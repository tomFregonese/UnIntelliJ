import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CommitContext, CommitDetails, CommitRow, classifyRef, DEFAULT_FILTERS, FromGitLog, LogFilters, ToGitLog } from './gitLogProtocol';
import { validateBranchName } from './branchesLogic';
import { ChangedFile, layoutGraph, logArgs, LogCommit, parseLog, parseNameStatus } from './logLogic';
import { VcsService } from './vcsService';

export const GIT_LOG_VIEW = 'unintellij.gitLog';
const PAGE = 500;

function formatDate(seconds: number): string {
  const date = new Date(seconds * 1000);
  const now = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) {
    return `Today ${time}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${time}`;
  }
  return `${date.toLocaleDateString()} ${time}`;
}

/** IntelliJ's Git tool window (Alt+9): log with graph, filters and commit details. */
export class GitLogView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private filters: LogFilters = { ...DEFAULT_FILTERS };
  private limit = PAGE;
  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private lastHead: string | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly vcs: VcsService,
    private readonly log: vscode.LogOutputChannel,
  ) {
    this.disposables.push(
      vscode.window.registerWebviewViewProvider(GIT_LOG_VIEW, this, { webviewOptions: { retainContextWhenHidden: true } }),
      vcs.onDidChange(() => {
        // Reload when HEAD moves (commit, checkout, pull), not on every file change.
        const head = vcs.repository?.state.HEAD?.commit;
        if (head !== this.lastHead) {
          this.lastHead = head;
          this.scheduleRefresh();
        }
      }),
      vscode.commands.registerCommand('unintellij.git.showFileHistory', (uri?: vscode.Uri) => this.showFileHistory(uri)),
      vscode.commands.registerCommand('unintellij.git.showLog', () => this.show({ ...DEFAULT_FILTERS })),
      vscode.commands.registerCommand('unintellij.git.copyRevision', (ctx: CommitContext) => vscode.env.clipboard.writeText(ctx.hash)),
      vscode.commands.registerCommand('unintellij.git.checkoutRevision', (ctx: CommitContext) => this.run(`Checking out ${short(ctx.hash)}`, ['checkout', ctx.hash])),
      vscode.commands.registerCommand('unintellij.git.newBranchHere', (ctx: CommitContext) => this.newBranch(ctx.hash)),
      vscode.commands.registerCommand('unintellij.git.newTag', (ctx: CommitContext) => this.newTag(ctx.hash)),
      vscode.commands.registerCommand('unintellij.git.cherryPick', (ctx: CommitContext) => this.run(`Cherry-picking ${short(ctx.hash)}`, ['cherry-pick', ctx.hash])),
      vscode.commands.registerCommand('unintellij.git.revertCommit', (ctx: CommitContext) => this.run(`Reverting ${short(ctx.hash)}`, ['revert', '--no-edit', ctx.hash])),
      vscode.commands.registerCommand('unintellij.git.resetToHere', (ctx: CommitContext) => this.reset(ctx.hash)),
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const roots = ['dist/webview', 'media', 'icons'].map((p) => vscode.Uri.joinPath(this.context.extensionUri, ...p.split('/')));
    view.webview.options = { enableScripts: true, localResourceRoots: roots };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((message: FromGitLog) => void this.onMessage(message));
    view.onDidDispose(() => (this.view = undefined));
  }

  /** Opens the Git tool window with the given filters. */
  async show(filters: LogFilters): Promise<void> {
    this.filters = filters;
    this.limit = PAGE;
    await vscode.commands.executeCommand(`${GIT_LOG_VIEW}.focus`);
    await this.refresh();
  }

  private async showFileHistory(uri?: vscode.Uri): Promise<void> {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    const root = this.vcs.repository?.rootUri.fsPath;
    if (!target || !root) {
      return;
    }
    await this.show({ ...DEFAULT_FILTERS, branch: 'HEAD', path: path.relative(root, target.fsPath).split(path.sep).join('/') });
  }

  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), 300);
  }

  private post(message: ToGitLog): void {
    void this.view?.webview.postMessage(message);
  }

  /** Loads the log for the current filters (exported state for tests through `load`). */
  async load(filters: LogFilters = this.filters, limit = this.limit): Promise<Extract<ToGitLog, { type: 'log' }> | Extract<ToGitLog, { type: 'unavailable' }>> {
    const repository = this.vcs.repository;
    if (!this.vcs.available || !repository) {
      return { type: 'unavailable', reason: this.vcs.available ? 'No Git repository in this workspace.' : 'The built-in Git extension is disabled.' };
    }
    let commits: LogCommit[];
    try {
      commits = parseLog(await this.vcs.git(logArgs(filters, limit + 1), false));
    } catch (error) {
      // An empty repository has no HEAD yet.
      this.log.warn(`Git log: ${String(error)}`);
      commits = [];
    }
    const hasMore = commits.length > limit;
    commits = commits.slice(0, limit);
    const remotes = repository.state.remotes.map((r) => r.name);
    const rows: CommitRow[] = commits.map((c) => ({
      hash: c.hash,
      subject: c.subject,
      author: c.author,
      date: formatDate(c.date),
      refs: c.refs.flatMap((r) => classifyRef(r, remotes)),
    }));
    const [branches, authors] = await Promise.all([
      this.vcs.git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], false).catch(() => ''),
      this.vcs.git(['log', '--all', '--format=%an', '-n', '2000'], false).catch(() => ''),
    ]);
    return {
      type: 'log',
      commits: rows,
      graph: layoutGraph(commits),
      branches: branches.split('\n').filter(Boolean),
      authors: [...new Set(authors.split('\n').filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      filters,
      hasMore,
    };
  }

  private async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    this.post(await this.load());
  }

  async details(hash: string): Promise<CommitDetails> {
    const output = await this.vcs.git(['show', '--no-patch', '--format=%H%x00%an%x00%ae%x00%at%x00%B', hash], false);
    const [full, author, email, date, ...message] = output.split('\0');
    const nameStatus = await this.vcs.git(['show', '--name-status', '--format=', '-M', '--first-parent', hash], false);
    return { hash: full.trim(), author, email, date: formatDate(Number(date)), message: message.join('\0').trim(), files: parseNameStatus(nameStatus) };
  }

  private async onMessage(message: FromGitLog): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
        case 'refresh':
          await this.refresh();
          break;
        case 'filter':
          this.filters = message.filters;
          this.limit = PAGE;
          await this.refresh();
          break;
        case 'loadMore':
          this.limit += PAGE;
          await this.refresh();
          break;
        case 'select':
          this.post({ type: 'details', details: await this.details(message.hash) });
          break;
        case 'openDiff':
          await this.openDiff(message.hash, message.file);
          break;
      }
    } catch (error) {
      this.log.error(`Git log: ${String(error)}`);
      void vscode.window.showErrorMessage(String(error instanceof Error ? error.message : error));
    }
  }

  private async openDiff(hash: string, file: ChangedFile): Promise<void> {
    const api = this.vcs.gitApi;
    const root = this.vcs.repository?.rootUri;
    if (!api || !root) {
      return;
    }
    const after = vscode.Uri.joinPath(root, file.path);
    const before = vscode.Uri.joinPath(root, file.oldPath ?? file.path);
    const title = `${path.basename(file.path)} (${short(hash)}^ ↔ ${short(hash)})`;
    if (file.status === 'A') {
      await vscode.window.showTextDocument(api.toGitUri(after, hash), { preview: true });
    } else if (file.status === 'D') {
      await vscode.window.showTextDocument(api.toGitUri(before, `${hash}^`), { preview: true });
    } else {
      await vscode.commands.executeCommand('vscode.diff', api.toGitUri(before, `${hash}^`), api.toGitUri(after, hash), title, { preview: true });
    }
  }

  private async run(title: string, args: string[]): Promise<void> {
    try {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, () => this.vcs.git(args));
    } catch (error) {
      void vscode.window.showErrorMessage(`${title} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await this.refresh();
  }

  private async newBranch(hash: string): Promise<void> {
    const name = await vscode.window.showInputBox({ title: `New Branch from ${short(hash)}`, prompt: 'Branch name', validateInput: validateBranchName });
    if (name) {
      await this.run(`Creating branch ${name}`, ['checkout', '-b', name, hash]);
    }
  }

  private async newTag(hash: string): Promise<void> {
    const name = await vscode.window.showInputBox({ title: `New Tag on ${short(hash)}`, prompt: 'Tag name', validateInput: (v) => (/^[^\s~^:?*[\\]+$/.test(v) ? undefined : 'Invalid tag name') });
    if (name) {
      await this.run(`Creating tag ${name}`, ['tag', name, hash]);
    }
  }

  private async reset(hash: string): Promise<void> {
    const branch = this.vcs.repository?.state.HEAD?.name ?? 'HEAD';
    const modes = [
      { label: 'Soft', description: 'Files are not changed, differences are staged for commit', mode: '--soft' },
      { label: 'Mixed', description: 'Files are not changed, differences are not staged', mode: '--mixed' },
      { label: 'Hard', description: 'Files are reverted, local changes are lost', mode: '--hard' },
      { label: 'Keep', description: 'Files are reverted, local changes are kept', mode: '--keep' },
    ];
    const picked = await vscode.window.showQuickPick(modes, { title: `Reset '${branch}' to ${short(hash)}` });
    if (!picked) {
      return;
    }
    if (picked.mode === '--hard') {
      const confirm = await vscode.window.showWarningMessage(`Hard reset '${branch}' to ${short(hash)}? Local changes will be lost.`, { modal: true }, 'Reset');
      if (confirm !== 'Reset') {
        return;
      }
    }
    await this.run(`Resetting ${branch}`, ['reset', picked.mode, hash]);
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const uri = (...parts: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, ...parts));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('media', 'product-icons.css')}">
<link rel="stylesheet" href="${uri('media', 'git-log.css')}">
</head>
<body data-vscode-context='{"preventDefaultContextMenuItems": true}'>
<div id="app"></div>
<script nonce="${nonce}" src="${uri('dist', 'webview', 'gitLog.js')}"></script>
</body>
</html>`;
  }

  dispose(): void {
    clearTimeout(this.refreshTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}

function short(hash: string): string {
  return hash.slice(0, 8);
}
