import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { detectIntegrations, IntegrationId } from '../integrations';
import { formatKey, KEYMAP } from '../keymap/keymap';
import { fieldKeys, PAGES } from './pages';
import { applyPreset, PRESET, presetApplied, revertPreset } from './preset';
import { FromWebview, SettingsModel, ToWebview } from './protocol';

const PURPOSES: Record<IntegrationId, string> = {
  git: 'Commit tool window, branches, Git log',
  java: 'Java classes and symbols in Search Everywhere, Java refactorings',
  javaDebug: 'Run/Debug of Java applications',
  angular: 'Angular templates: completion, navigation',
};

/** Applies settings changes from the Settings window to user settings. Exported for tests. */
export async function applyChanges(changes: Record<string, unknown>): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  for (const [key, value] of Object.entries(changes)) {
    const inspect = config.inspect(key);
    // Writing the default value removes the user override instead, keeping settings.json clean.
    const isDefault = JSON.stringify(value) === JSON.stringify(inspect?.defaultValue);
    await config.update(key, isDefault ? undefined : value, vscode.ConfigurationTarget.Global);
  }
}

export function buildModel(state: vscode.Memento, initialPage = 'appearance'): SettingsModel {
  const config = vscode.workspace.getConfiguration();
  const values: Record<string, unknown> = {};
  for (const key of [...fieldKeys(), 'unintellij.keymap.disabledActions']) {
    values[key] = config.get(key);
  }
  return {
    pages: [...PAGES],
    values,
    autoKeymapOs: process.platform === 'darwin' ? 'macos' : 'windows',
    keymap: KEYMAP.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      windows: a.windows && formatKey(a.windows, 'windows'),
      macos: a.macos && formatKey(a.macos, 'macos'),
    })),
    integrations: detectIntegrations().map((i) => ({
      name: i.name,
      extensionId: i.extensionId,
      purpose: PURPOSES[i.id],
      installed: i.installed,
      active: i.active,
      version: i.version,
    })),
    preset: { applied: presetApplied(state), entries: PRESET.map((p) => ({ ...p })) },
    initialPage,
  };
}

/** IntelliJ's Settings dialog (Ctrl+Alt+S), as a webview editor tab. */
export class SettingsPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  show(page?: string): void {
    if (this.panel) {
      this.panel.reveal();
      if (page) {
        this.post({ type: 'navigate', page });
      }
      return;
    }
    const webviewRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('unintellij.settings', 'Settings', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [webviewRoot, vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    });
    this.panel = panel;
    const media = (name: string) => vscode.Uri.joinPath(this.context.extensionUri, 'media', name);
    panel.iconPath = { light: media('settings-light.svg'), dark: media('settings-dark.svg') };
    panel.webview.html = this.html(panel.webview);
    const initialPage = page ?? 'appearance';
    const refresh = (): void => this.post({ type: 'model', model: buildModel(this.context.globalState, initialPage) });
    const subscriptions = [
      panel.webview.onDidReceiveMessage((message: FromWebview) => void this.onMessage(message, refresh)),
      // Reflect changes made elsewhere (settings.json, theme picker…). The webview keeps pending edits.
      vscode.workspace.onDidChangeConfiguration(() => refresh()),
      vscode.extensions.onDidChange(() => refresh()),
    ];
    panel.onDidDispose(() => {
      subscriptions.forEach((s) => s.dispose());
      this.panel = undefined;
    });
  }

  private async onMessage(message: FromWebview, refresh: () => void): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
          refresh();
          break;
        case 'apply':
          await applyChanges(message.changes);
          this.post({ type: 'applied' });
          if (message.close) {
            this.panel?.dispose();
          }
          break;
        case 'cancel':
          this.panel?.dispose();
          break;
        case 'applyPreset':
          await applyPreset(this.context.globalState);
          refresh();
          break;
        case 'revertPreset':
          await revertPreset(this.context.globalState);
          refresh();
          break;
        case 'showExtension':
          await vscode.commands.executeCommand('extension.open', message.id);
          break;
      }
    } catch (error) {
      this.log.error(`Settings: ${String(error)}`);
      void vscode.window.showErrorMessage(`Could not apply settings: ${String(error)}`);
    }
  }

  private post(message: ToWebview): void {
    void this.panel?.webview.postMessage(message);
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'settings.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'settings.css'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style}">
<title>Settings</title>
</head>
<body>
<div id="app" class="loading">Loading…</div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.panel?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
