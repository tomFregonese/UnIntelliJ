import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { language, t } from '../i18n/i18n';
import { Connections, DataSourceStore } from './connections';
import type { FromDataSourcesWebview, ToDataSourcesWebview } from './dataSourcesProtocol';

/** IntelliJ's "Data Sources and Drivers" dialog (PostgreSQL only), as an editor tab. */
export class DataSourcesPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private selected: string | undefined;
  private addOnOpen = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: DataSourceStore,
  ) {}

  /** `add`: starts with a new data source, like IntelliJ's + › PostgreSQL. */
  show(selected?: string, add = false): void {
    this.selected = selected;
    this.addOnOpen = add;
    if (this.panel) {
      this.panel.reveal();
      void this.post();
      return;
    }
    this.panel = vscode.window.createWebviewPanel('unintellij.dataSources', t('Data Sources'), vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist'), vscode.Uri.joinPath(this.extensionUri, 'media')],
    });
    this.panel.webview.html = this.html(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((message: FromDataSourcesWebview) => void this.onMessage(message));
    this.panel.onDidDispose(() => (this.panel = undefined));
  }

  private async post(message?: ToDataSourcesWebview): Promise<void> {
    if (message) {
      void this.panel?.webview.postMessage(message);
      return;
    }
    const sources = this.store.all;
    const withPassword: string[] = [];
    for (const s of sources) {
      if (await this.store.password(s.id)) {
        withPassword.push(s.id);
      }
    }
    void this.panel?.webview.postMessage({ type: 'model', model: { sources, withPassword, selected: this.addOnOpen ? '__new__' : this.selected } } satisfies ToDataSourcesWebview);
    this.addOnOpen = false;
  }

  private async onMessage(message: FromDataSourcesWebview): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.post();
        break;
      case 'save':
        await this.store.save(message.sources, message.passwords);
        if (message.close) {
          this.panel?.dispose();
        }
        break;
      case 'test': {
        try {
          const password = message.password ?? (await this.store.password(message.source.id));
          const version = await Connections.test(message.source, password);
          await this.post({ type: 'testResult', ok: true, message: t('Succeeded · {0}', version) });
        } catch (error) {
          await this.post({ type: 'testResult', ok: false, message: error instanceof Error ? error.message : String(error) });
        }
        break;
      }
      case 'cancel':
        this.panel?.dispose();
        break;
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const uri = (...segments: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...segments));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('media', 'product-icons.css')}">
<link rel="stylesheet" href="${uri('media', 'controls.css')}">
<link rel="stylesheet" href="${uri('media', 'settings.css')}">
<link rel="stylesheet" href="${uri('media', 'run-configs.css')}">
<title>Data Sources</title>
</head>
<body data-lang="${language()}">
<div id="app" class="loading">Loading…</div>
<script nonce="${nonce}" src="${uri('dist', 'webview', 'dataSources.js')}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.panel?.dispose();
  }
}
