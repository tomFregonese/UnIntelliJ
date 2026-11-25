import * as vscode from 'vscode';
import { getSetting } from '../config/settings';
import { shortcutFor } from '../search/actions';
import { BranchInfo, COMMIT_FORMAT, localNameForRemote, parseCommits, parseRefs, REF_FORMAT, trackingLabel, validateBranchName } from './branchesLogic';
import { VcsService } from './vcsService';

const RECENT_KEY = 'vcs.recentBranches';
const FORCE_WITH_LEASE = 1; // ForcePushMode.ForceWithLease in git.d.ts

type Action = vscode.QuickPickItem & { run?: () => Thenable<unknown> };

const separator = (label: string): Action => ({ label, kind: vscode.QuickPickItemKind.Separator });
const withShortcut = (label: string, command: string): string => {
  const shortcut = shortcutFor(command);
  return shortcut ? `${label}  ·  ${shortcut}` : label;
};

/** IntelliJ's branches popup, Push dialog, VCS Operations popup and branch widget. */
export class Branches implements vscode.Disposable {
  private readonly widget: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private lastHead: string | undefined;

  constructor(
    private readonly vcs: VcsService,
    private readonly state: vscode.Memento,
  ) {
    this.widget = vscode.window.createStatusBarItem('unintellij.branch', vscode.StatusBarAlignment.Left, 104);
    this.widget.name = 'Git Branch';
    this.widget.command = 'unintellij.branches';
    this.disposables.push(this.widget, vcs.onDidChange(() => this.onChange()));
    this.onChange();
  }

  private onChange(): void {
    const repository = this.vcs.repository;
    const head = repository?.state.HEAD;
    if (!repository || !head) {
      this.widget.hide();
      return;
    }
    const name = head.name ?? head.commit?.slice(0, 8) ?? '';
    const tracking = [head.ahead ? `↑${head.ahead}` : '', head.behind ? `↓${head.behind}` : ''].filter(Boolean).join(' ');
    this.widget.text = `$(git-branch) ${name}${tracking ? ` ${tracking}` : ''}`;
    this.widget.tooltip = `Git Branch: ${name}${head.upstream ? ` → ${head.upstream.remote}/${head.upstream.name}` : ''}${hint(shortcutFor('unintellij.branches'))}`;
    this.widget.show();
    if (head.name && head.name !== this.lastHead) {
      this.lastHead = head.name;
      const recent = [head.name, ...this.state.get<string[]>(RECENT_KEY, []).filter((b) => b !== head.name)].slice(0, 10);
      void this.state.update(RECENT_KEY, recent);
    }
  }

  private requireRepository(): boolean {
    if (!this.vcs.available) {
      void vscode.window.showWarningMessage('Git is not available: the built-in Git extension is disabled.');
      return false;
    }
    if (!this.vcs.repository) {
      void vscode.window.showWarningMessage('No Git repository in this workspace.');
      return false;
    }
    return true;
  }

  private async branches(): Promise<BranchInfo[]> {
    return parseRefs(await this.vcs.git(['for-each-ref', `--format=${REF_FORMAT}`, 'refs/heads', 'refs/remotes']));
  }

  private current(): string | undefined {
    return this.vcs.repository?.state.HEAD?.name;
  }

  /** Runs a git operation with a progress notification and reports failures. */
  private async operation(title: string, run: () => Thenable<unknown>): Promise<boolean> {
    try {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, run);
      return true;
    } catch (error) {
      void vscode.window.showErrorMessage(`${title} failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  // --- Branches popup ----------------------------------------------------------------------------

  async showBranches(): Promise<void> {
    if (!this.requireRepository()) {
      return;
    }
    const branches = await this.branches();
    const current = this.current();
    const recentNames = this.state.get<string[]>(RECENT_KEY, []).filter((b) => b !== current);
    const local = branches.filter((b) => !b.remote);
    const remote = branches.filter((b) => b.remote);
    const branchItem = (b: BranchInfo): Action => ({
      label: `${b.name === current ? '$(check)' : '$(git-branch)'} ${b.name}`,
      description: [trackingLabel(b), b.upstream && b.upstream !== b.name ? `→ ${b.upstream}` : ''].filter(Boolean).join('  '),
      run: () => this.branchActions(b),
    });
    const items: Action[] = [
      { label: '$(repo-pull) Update Project…', description: shortcutFor('unintellij.updateProject'), run: () => vscode.commands.executeCommand('unintellij.updateProject') },
      { label: '$(git-commit) Commit…', description: shortcutFor('unintellij.commit'), run: () => vscode.commands.executeCommand('unintellij.commit') },
      { label: '$(repo-push) Push…', description: shortcutFor('unintellij.push'), run: () => this.push() },
      { label: '$(add) New Branch…', run: () => this.newBranch(current) },
      { label: '$(tag) Checkout Tag or Revision…', run: () => this.checkoutRevision() },
    ];
    const recent = recentNames.map((n) => local.find((b) => b.name === n)).filter((b): b is BranchInfo => b !== undefined);
    if (recent.length > 0) {
      items.push(separator('Recent'), ...recent.map(branchItem));
    }
    items.push(separator('Local'), ...local.map(branchItem));
    if (remote.length > 0) {
      items.push(separator('Remote'), ...remote.map(branchItem));
    }
    const picked = await vscode.window.showQuickPick(items, { title: `Git Branches · ${current ?? 'detached HEAD'}`, placeHolder: 'Type to search branches and actions', matchOnDescription: true });
    await picked?.run?.();
  }

  private async branchActions(branch: BranchInfo): Promise<void> {
    const current = this.current();
    const isCurrent = branch.name === current;
    const items: Action[] = [];
    if (branch.remote) {
      items.push(
        { label: 'Checkout', run: () => this.checkoutRemote(branch) },
        { label: `New Branch from '${branch.name}'…`, run: () => this.newBranch(branch.name) },
      );
      if (current) {
        items.push(
          separator(''),
          { label: `Merge '${branch.name}' into '${current}'`, run: () => this.operation(`Merging ${branch.name}`, () => this.vcs.git(['merge', branch.name])) },
          { label: `Rebase '${current}' onto '${branch.name}'`, run: () => this.operation(`Rebasing ${current}`, () => this.vcs.git(['rebase', branch.name])) },
          { label: `Compare with '${current}'`, run: () => this.compare(branch.name, current) },
        );
      }
      items.push(separator(''), { label: 'Delete…', run: () => vscode.commands.executeCommand('git.deleteRemoteBranch') });
    } else if (isCurrent) {
      items.push(
        { label: `New Branch from '${branch.name}'…`, run: () => this.newBranch(branch.name) },
        { label: 'Update', run: () => vscode.commands.executeCommand('unintellij.updateProject') },
        { label: 'Push…', run: () => this.push() },
        separator(''),
        { label: 'Rename…', run: () => this.rename(branch.name) },
      );
    } else {
      items.push(
        { label: 'Checkout', run: () => this.operation(`Checking out ${branch.name}`, () => this.vcs.git(['checkout', branch.name])) },
        { label: `New Branch from '${branch.name}'…`, run: () => this.newBranch(branch.name) },
      );
      if (current) {
        items.push(
          { label: `Checkout and Rebase onto '${current}'`, run: () => this.operation(`Rebasing ${branch.name}`, () => this.vcs.git(['rebase', current, branch.name])) },
          separator(''),
          { label: `Compare with '${current}'`, run: () => this.compare(branch.name, current) },
          { label: `Rebase '${current}' onto '${branch.name}'`, run: () => this.operation(`Rebasing ${current}`, () => this.vcs.git(['rebase', branch.name])) },
          { label: `Merge '${branch.name}' into '${current}'`, run: () => this.operation(`Merging ${branch.name}`, () => this.vcs.git(['merge', branch.name])) },
        );
      }
      items.push(
        ...[
          separator(''),
          branch.upstream && { label: 'Update', run: () => this.updateBranch(branch) },
          { label: 'Push…', run: () => this.push(branch.name) },
          { label: 'Rename…', run: () => this.rename(branch.name) },
          { label: 'Delete', run: () => this.deleteBranch(branch.name) },
        ].filter((i): i is Action => Boolean(i)),
      );
    }
    const picked = await vscode.window.showQuickPick(items, { title: `Branch '${branch.name}'` });
    await picked?.run?.();
  }

  async newBranch(from?: string): Promise<void> {
    if (!this.requireRepository()) {
      return;
    }
    const name = await vscode.window.showInputBox({
      title: from ? `Create New Branch from '${from}'` : 'Create New Branch',
      prompt: 'New branch name',
      validateInput: validateBranchName,
    });
    if (!name) {
      return;
    }
    await this.operation(`Creating branch ${name}`, () => this.vcs.git(['checkout', '-b', name, ...(from ? [from] : [])]));
  }

  private async checkoutRemote(branch: BranchInfo): Promise<void> {
    const local = localNameForRemote(branch.name);
    const exists = (await this.branches()).some((b) => !b.remote && b.name === local);
    if (exists) {
      await this.operation(`Checking out ${local}`, () => this.vcs.git(['checkout', local]));
      return;
    }
    await this.operation(`Checking out ${branch.name}`, () => this.vcs.git(['checkout', '--track', '-b', local, branch.name]));
  }

  private async checkoutRevision(): Promise<void> {
    const ref = await vscode.window.showInputBox({ title: 'Checkout Tag or Revision', prompt: 'Tag, commit hash or any revision' });
    if (ref) {
      await this.operation(`Checking out ${ref}`, () => this.vcs.git(['checkout', ref]));
    }
  }

  private async rename(name: string): Promise<void> {
    const next = await vscode.window.showInputBox({ title: `Rename Branch '${name}'`, value: name, validateInput: validateBranchName });
    if (next && next !== name) {
      await this.operation(`Renaming ${name}`, () => this.vcs.git(['branch', '-m', name, next]));
    }
  }

  private async deleteBranch(name: string): Promise<void> {
    const ok = await this.operation(`Deleting ${name}`, () => this.vcs.git(['branch', '-d', name]));
    if (!ok) {
      const force = await vscode.window.showWarningMessage(`Branch '${name}' is not fully merged. Delete it anyway?`, { modal: true }, 'Delete');
      if (force === 'Delete') {
        await this.operation(`Deleting ${name}`, () => this.vcs.git(['branch', '-D', name]));
      }
    }
  }

  private async updateBranch(branch: BranchInfo): Promise<void> {
    const repository = this.vcs.repository!;
    const [remote, ...rest] = (branch.upstream ?? '').split('/');
    await this.operation(`Updating ${branch.name}`, () => repository.fetch({ remote, ref: `${rest.join('/')}:${branch.name}` }));
  }

  private async compare(branch: string, current: string): Promise<void> {
    const [incoming, outgoing] = await Promise.all([
      this.vcs.git(['log', `--format=${COMMIT_FORMAT}`, '-n', '200', `${current}..${branch}`]),
      this.vcs.git(['log', `--format=${COMMIT_FORMAT}`, '-n', '200', `${branch}..${current}`]),
    ]);
    const item = (c: ReturnType<typeof parseCommits>[number]): Action => ({ label: c.subject, description: `${c.hash.slice(0, 8)} · ${c.author} · ${c.relativeDate}` });
    await vscode.window.showQuickPick(
      [
        separator(`In '${branch}' but not in '${current}'`),
        ...parseCommits(incoming).map(item),
        separator(`In '${current}' but not in '${branch}'`),
        ...parseCommits(outgoing).map(item),
      ],
      { title: `Compare '${branch}' with '${current}'` },
    );
  }

  // --- Push dialog --------------------------------------------------------------------------------

  async push(branchName?: string): Promise<void> {
    if (!this.requireRepository()) {
      return;
    }
    const repository = this.vcs.repository!;
    const branch = branchName ?? this.current();
    if (!branch) {
      void vscode.window.showWarningMessage('Cannot push a detached HEAD.');
      return;
    }
    const info = (await this.branches()).find((b) => !b.remote && b.name === branch);
    let remote = info?.upstream?.split('/')[0];
    const remoteBranch = info?.upstream?.slice((remote?.length ?? 0) + 1) ?? branch;
    if (!remote) {
      const remotes = repository.state.remotes.map((r) => r.name);
      if (remotes.length === 0) {
        void vscode.window.showWarningMessage('No remote configured for this repository.');
        return;
      }
      remote = remotes.length === 1 ? remotes[0] : await vscode.window.showQuickPick(remotes, { title: 'Push to remote' });
      if (!remote) {
        return;
      }
    }
    const range = info?.upstream ? `${info.upstream}..${branch}` : branch;
    const args = ['log', `--format=${COMMIT_FORMAT}`, '-n', '100', range];
    if (!info?.upstream) {
      args.push('--not', '--remotes');
    }
    const commits = parseCommits(await this.vcs.git(args));
    const target = `${remote}/${remoteBranch}`;
    const setUpstream = !info?.upstream;
    const items: Action[] = [
      { label: '$(repo-push) Push', description: `${branch} → ${target}${setUpstream ? ' (new)' : ''}`, run: () => this.operation(`Pushing ${branch}`, () => repository.push(remote, branch, setUpstream)) },
      { label: '$(warning) Force Push', description: 'with lease', run: () => this.forcePush(branch, remote!, setUpstream) },
      separator(commits.length > 0 ? `${commits.length} commit${commits.length === 1 ? '' : 's'} to push` : 'Nothing to push'),
      ...commits.map((c) => ({ label: `$(git-commit) ${c.subject}`, description: `${c.hash.slice(0, 8)} · ${c.author} · ${c.relativeDate}` })),
    ];
    const picked = await vscode.window.showQuickPick(items, { title: `Push Commits to ${target}`, placeHolder: 'Select Push to confirm' });
    await picked?.run?.();
  }

  private async forcePush(branch: string, remote: string, setUpstream: boolean): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(`Force push '${branch}' to '${remote}'? Remote commits not in your branch will be lost.`, { modal: true }, 'Force Push');
    if (confirm === 'Force Push') {
      await this.operation(`Force pushing ${branch}`, () => this.vcs.repository!.push(remote, branch, setUpstream, FORCE_WITH_LEASE));
    }
  }

  // --- Update project and VCS operations popup ----------------------------------------------------

  async updateProject(): Promise<void> {
    if (!this.requireRepository()) {
      return;
    }
    const rebase = getSetting('vcs.updateMethod') === 'rebase';
    await vscode.commands.executeCommand(rebase ? 'git.pullRebase' : 'git.pull');
  }

  async vcsOperations(): Promise<void> {
    if (!this.requireRepository()) {
      return;
    }
    const file = vscode.window.activeTextEditor?.document.uri;
    const items: Action[] = [
      { label: withShortcut('$(git-commit) Commit…', 'unintellij.commit'), run: () => vscode.commands.executeCommand('unintellij.commit') },
      { label: withShortcut('$(repo-push) Push…', 'unintellij.push'), run: () => this.push() },
      { label: withShortcut('$(repo-pull) Update Project…', 'unintellij.updateProject'), run: () => this.updateProject() },
      { label: '$(repo-fetch) Fetch', run: () => vscode.commands.executeCommand('git.fetch') },
      separator(''),
      file && { label: '$(discard) Rollback File…', run: () => vscode.commands.executeCommand('unintellij.commit.rollback', { webviewSection: 'file', paths: [file.fsPath], preventDefaultContextMenuItems: true }) },
      file && { label: '$(history) Show History', run: () => vscode.commands.executeCommand('unintellij.git.showFileHistory', file) },
      file && { label: '$(account) Annotate with Git Blame', run: () => this.toggleBlame() },
      separator(''),
      { label: withShortcut('$(git-branch) Branches…', 'unintellij.branches'), run: () => this.showBranches() },
      { label: '$(add) New Branch…', run: () => this.newBranch(this.current()) },
      { label: '$(archive) Stash Changes…', run: () => vscode.commands.executeCommand('git.stash') },
      { label: '$(desktop-download) Unstash Changes…', run: () => vscode.commands.executeCommand('git.stashPop') },
    ].filter((i): i is Action => Boolean(i));
    const picked = await vscode.window.showQuickPick(items, { title: 'VCS Operations' });
    await picked?.run?.();
  }

  private async toggleBlame(): Promise<void> {
    const config = vscode.workspace.getConfiguration('git');
    await config.update('blame.editorDecoration.enabled', !config.get<boolean>('blame.editorDecoration.enabled'), vscode.ConfigurationTarget.Global);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

function hint(shortcut: string | undefined): string {
  return shortcut ? ` (${shortcut})` : '';
}
