import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getSetting } from '../config/settings';
import { shortcutFor } from '../search/actions';
import { fileIconPath } from '../search/fileIcons';
import { FileChange } from './changesLogic';
import { CommitViewState, FileItem, FromCommitView, RowContext, ToCommitView } from './commitProtocol';
import { VcsService } from './vcsService';

export const COMMIT_VIEW = 'unintellij.commit';

/** IntelliJ's Commit tool window (Alt+0 / Ctrl+K). */
export class CommitView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private pendingFocus = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly vcs: VcsService,
    private readonly log: vscode.LogOutputChannel,
    /** Called each time the tool window becomes visible. */
    private readonly onVisible: () => void = () => undefined,
  ) {
    this.disposables.push(
      vscode.window.registerWebviewViewProvider(COMMIT_VIEW, this, { webviewOptions: { retainContextWhenHidden: true } }),
      vcs.onDidChange(() => this.postState()),
      vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('unintellij') && this.postState()),
      vscode.commands.registerCommand('unintellij.commit.showDiff', (ctx: RowContext) => this.forPaths(ctx, (p) => Promise.all(p.map((x) => this.showDiff(x))))),
      vscode.commands.registerCommand('unintellij.commit.jumpToSource', (ctx: RowContext) => this.forPaths(ctx, (p) => Promise.all(p.map((x) => vscode.window.showTextDocument(vscode.Uri.file(x), { preview: false }))))),
      vscode.commands.registerCommand('unintellij.commit.rollback', (ctx: RowContext) => this.forPaths(ctx, (p) => this.rollback(p))),
      vscode.commands.registerCommand('unintellij.commit.addToVcs', (ctx: RowContext) => this.forPaths(ctx, (p) => this.vcs.addToVcs(p))),
      vscode.commands.registerCommand('unintellij.commit.moveToChangelist', (ctx: RowContext) => this.forPaths(ctx, (p) => this.moveToChangelist(p))),
      vscode.commands.registerCommand('unintellij.commit.newChangelist', () => this.newChangelist()),
      vscode.commands.registerCommand('unintellij.commit.setActiveChangelist', (ctx: RowContext) => ctx.changelistId && this.vcs.setActiveChangelist(ctx.changelistId)),
      vscode.commands.registerCommand('unintellij.commit.renameChangelist', (ctx: RowContext) => this.renameChangelist(ctx.changelistId)),
      vscode.commands.registerCommand('unintellij.commit.deleteChangelist', (ctx: RowContext) => ctx.changelistId && this.vcs.deleteChangelist(ctx.changelistId)),
    );
  }

  /** Shows the tool window and focuses the commit message (Ctrl+K). */
  async focus(): Promise<void> {
    this.pendingFocus = true;
    await vscode.commands.executeCommand(`${COMMIT_VIEW}.focus`);
    if (this.view) {
      this.post({ type: 'focusMessage' });
      this.pendingFocus = false;
    }
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const icons = vscode.Uri.joinPath(this.context.extensionUri, 'icons');
    view.webview.options = { enableScripts: true, localResourceRoots: [dist, media, icons] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((message: FromCommitView) => void this.onMessage(message));
    view.onDidDispose(() => (this.view = undefined));
    view.onDidChangeVisibility(() => view.visible && this.onVisible());
    if (view.visible) {
      this.onVisible();
    }
  }

  state(): CommitViewState {
    if (!this.vcs.available) {
      return { available: false, reason: 'The built-in Git extension is disabled.', changelistsEnabled: false, lists: [], unversioned: [] };
    }
    const repository = this.vcs.repository;
    if (!repository) {
      return { available: false, reason: 'No Git repository in this workspace.', changelistsEnabled: false, lists: [], unversioned: [] };
    }
    const root = repository.rootUri.fsPath;
    const webview = this.view?.webview;
    const icon = (name: string): FileItem['icon'] => {
      if (!webview) {
        return undefined;
      }
      const { dark, light } = fileIconPath(this.context.extensionUri, name);
      return { dark: webview.asWebviewUri(dark).toString(), light: webview.asWebviewUri(light).toString() };
    };
    const item = (c: FileChange): FileItem => ({
      path: c.path,
      name: path.basename(c.path),
      dir: path.relative(root, path.dirname(c.path)).split(path.sep).join('/'),
      status: c.status,
      icon: icon(path.basename(c.path)),
    });
    const { lists, unversioned } = this.vcs.groupedChanges();
    return {
      available: true,
      repository: path.basename(root),
      branch: repository.state.HEAD?.name ?? repository.state.HEAD?.commit?.slice(0, 8),
      changelistsEnabled: getSetting('vcs.changelists.enabled'),
      lists: lists.map((l) => ({ id: l.id, name: l.name, active: l.active, files: l.files.map(item) })),
      unversioned: unversioned.map(item),
      commitShortcut: shortcutFor('unintellij.commit'),
    };
  }

  private post(message: ToCommitView): void {
    void this.view?.webview.postMessage(message);
  }

  private postState(): void {
    this.post({ type: 'state', state: this.state() });
  }

  private async onMessage(message: FromCommitView): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
          this.postState();
          if (this.pendingFocus) {
            this.post({ type: 'focusMessage' });
            this.pendingFocus = false;
          }
          break;
        case 'refresh':
          await this.vcs.repository?.status();
          this.postState();
          break;
        case 'amend':
          if (message.enabled && message.message.trim() === '') {
            this.post({ type: 'setMessage', message: await this.vcs.lastCommitMessage() });
          }
          break;
        case 'diff':
          await this.showDiff(message.path);
          break;
        case 'rollback':
          await this.rollback(message.paths);
          break;
        case 'newChangelist':
          await this.newChangelist();
          break;
        case 'commit':
          await this.commit(message.paths, message.message, message.amend, message.push);
          break;
      }
    } catch (error) {
      this.log.error(`Commit: ${String(error)}`);
      void vscode.window.showErrorMessage(String(error instanceof Error ? error.message : error));
    }
  }

  private async commit(paths: string[], message: string, amend: boolean, push: boolean): Promise<void> {
    if (paths.length === 0 && !amend) {
      void vscode.window.showWarningMessage('No changes selected for commit.');
      return;
    }
    if (message.trim() === '') {
      void vscode.window.showWarningMessage('Commit message is empty.');
      return;
    }
    this.post({ type: 'busy', busy: true });
    try {
      await this.vcs.commit(paths, message, amend);
      this.post({ type: 'committed' });
      void vscode.window.setStatusBarMessage(`$(check) ${paths.length} file${paths.length === 1 ? '' : 's'} committed: ${message.split('\n')[0]}`, 5000);
      if (push) {
        await vscode.commands.executeCommand('unintellij.push');
      }
    } finally {
      this.post({ type: 'busy', busy: false });
    }
  }

  private async showDiff(filePath: string): Promise<void> {
    const change = this.vcs.changes().find((c) => c.path === filePath);
    const uri = vscode.Uri.file(filePath);
    const api = this.vcs.gitApi;
    if (!change || !api || change.status === 'A' || change.status === 'U') {
      await vscode.window.showTextDocument(uri, { preview: true });
      return;
    }
    const head = api.toGitUri(uri, 'HEAD');
    if (change.status === 'D') {
      await vscode.window.showTextDocument(head, { preview: true });
      return;
    }
    await vscode.commands.executeCommand('vscode.diff', head, uri, `${path.basename(filePath)} (HEAD ↔ Local Changes)`, { preview: true });
  }

  private async rollback(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    const changes = this.vcs.changes().filter((c) => paths.includes(c.path));
    const deletes = changes.filter((c) => c.status === 'A' || c.status === 'U');
    const detail = deletes.length > 0 ? `${deletes.length} new file(s) will be deleted.` : undefined;
    const answer = await vscode.window.showWarningMessage(
      `Rollback changes in ${paths.length === 1 ? path.basename(paths[0]) : `${paths.length} files`}?`,
      { modal: true, detail },
      'Rollback',
    );
    if (answer === 'Rollback') {
      await this.vcs.rollback(paths);
    }
  }

  private async newChangelist(): Promise<void> {
    const name = await vscode.window.showInputBox({ title: 'New Changelist', prompt: 'Name', validateInput: (v) => (v.trim() ? undefined : 'Name is required') });
    if (!name) {
      return;
    }
    const active = await vscode.window.showQuickPick(['Yes', 'No'], { title: 'Set as active changelist?' });
    await this.vcs.newChangelist(name.trim(), active === 'Yes');
  }

  private async renameChangelist(id: string | undefined): Promise<void> {
    const list = this.vcs.changelistNames().find((l) => l.id === id);
    if (!list) {
      return;
    }
    const name = await vscode.window.showInputBox({ title: 'Rename Changelist', value: list.name, validateInput: (v) => (v.trim() ? undefined : 'Name is required') });
    if (name) {
      await this.vcs.renameChangelist(list.id, name.trim());
    }
  }

  private async moveToChangelist(paths: string[]): Promise<void> {
    const NEW = '$(add) New Changelist…';
    const lists = this.vcs.changelistNames();
    const picked = await vscode.window.showQuickPick([...lists.map((l) => ({ label: l.name, id: l.id })), { label: NEW, id: '' }], { title: 'Move to Another Changelist' });
    if (!picked) {
      return;
    }
    if (picked.id) {
      await this.vcs.moveToChangelist(paths, picked.id);
      return;
    }
    const name = await vscode.window.showInputBox({ title: 'New Changelist', prompt: 'Name' });
    if (name?.trim()) {
      await this.vcs.newChangelist(name.trim(), false);
      const created = this.vcs.changelistNames().at(-1);
      if (created) {
        await this.vcs.moveToChangelist(paths, created.id);
      }
    }
  }

  private async forPaths(ctx: RowContext | undefined, action: (paths: string[]) => Thenable<unknown>): Promise<void> {
    try {
      if (ctx?.paths && ctx.paths.length > 0) {
        await action(ctx.paths);
      }
    } catch (error) {
      void vscode.window.showErrorMessage(String(error instanceof Error ? error.message : error));
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'commit.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'commit.css'));
    const controls = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'controls.css'));
    const iconStyle = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'product-icons.css'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${iconStyle}">
<link rel="stylesheet" href="${controls}">
<link rel="stylesheet" href="${style}">
</head>
<body data-vscode-context='{"preventDefaultContextMenuItems": true}'>
<div id="app"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
