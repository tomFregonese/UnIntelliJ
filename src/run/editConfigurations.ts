import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { language } from '../i18n/i18n';
import { collectRunConfigurations, findPackageScripts } from './configurations';
import type { NpmConfigData } from './runConfigLogic';
import type { FromRunWebview, RunConfigsModel, ToRunWebview } from './runProtocol';

const SAVED_KEY = 'run.savedConfigurations';

/** Saved npm configurations of this workspace (IntelliJ keeps them in the project's workspace.xml). */
export class SavedConfigurations {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  constructor(private readonly state: vscode.Memento) {}

  get all(): NpmConfigData[] {
    return this.state.get<NpmConfigData[]>(SAVED_KEY, []);
  }

  async set(configs: NpmConfigData[]): Promise<void> {
    await this.state.update(SAVED_KEY, configs);
    this.changed.fire();
  }

  dispose(): void {
    this.changed.dispose();
  }
}

/** IntelliJ's "Run/Debug Configurations" dialog, as a webview editor tab. */
export class EditConfigurationsPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private selected: string | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly saved: SavedConfigurations,
  ) {}

  show(selected?: string): void {
    this.selected = selected;
    if (this.panel) {
      this.panel.reveal();
      void this.post();
      return;
    }
    this.panel = vscode.window.createWebviewPanel('unintellij.runConfigurations', 'Run/Debug Configurations', vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist'), vscode.Uri.joinPath(this.extensionUri, 'media'), vscode.Uri.joinPath(this.extensionUri, 'icons')],
    });
    this.panel.webview.html = this.html(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((message: FromRunWebview) => void this.onMessage(message));
    this.panel.onDidDispose(() => (this.panel = undefined));
  }

  private async model(): Promise<RunConfigsModel> {
    const packages = await findPackageScripts();
    const launches = (await collectRunConfigurations()).filter((c) => c.kind === 'launch');
    return {
      configs: this.saved.all,
      packages: packages.map((p) => ({ path: p.packageJson.toString(), label: `${p.label} (${vscode.workspace.asRelativePath(p.packageJson)})`, scripts: p.scripts.map((s) => s.name) })),
      launches: launches.map((l) => ({ id: l.id, name: l.name, type: l.kind === 'launch' ? l.type : '', folder: l.folder?.name ?? '' })),
      selected: this.selected,
    };
  }

  private async post(): Promise<void> {
    const message: ToRunWebview = { type: 'model', model: await this.model() };
    void this.panel?.webview.postMessage(message);
  }

  private async onMessage(message: FromRunWebview): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.post();
        break;
      case 'save':
        await this.saved.set(message.configs);
        if (message.close) {
          this.panel?.dispose();
        }
        break;
      case 'cancel':
        this.panel?.dispose();
        break;
      case 'openLaunch': {
        // Opens launch.json of the configuration's folder (VS Code's own editor for it).
        const launch = (await collectRunConfigurations()).find((c) => c.id === message.id);
        const folder = launch?.folder ?? vscode.workspace.workspaceFolders?.[0];
        if (folder) {
          const uri = vscode.Uri.joinPath(folder.uri, '.vscode', 'launch.json');
          await vscode.window.showTextDocument(uri).then(undefined, () => vscode.commands.executeCommand('workbench.action.debug.configure'));
        }
        break;
      }
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
<title>Run/Debug Configurations</title>
</head>
<body data-lang="${language()}">
<div id="app" class="loading">Loading…</div>
<script nonce="${nonce}" src="${uri('dist', 'webview', 'runConfigs.js')}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.panel?.dispose();
  }
}
