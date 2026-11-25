import * as vscode from 'vscode';
import { getSetting } from '../config/settings';
import { shortcutFor } from '../search/actions';
import { BranchInfo, COMMIT_FORMAT, localNameForRemote, parseCommits, parseRefs, REF_FORMAT, trackingLabel, validateBranchName } from './branchesLogic';
import { VcsService } from './vcsService';
import { t } from '../i18n/i18n';

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
  private readonly disposables: vscode.Disposable[] = [];
  private lastHead: string | undefined;

  constructor(
    private readonly vcs: VcsService,
    private readonly state: vscode.Memento,
  ) {
    this.disposables.push(vcs.onDidChange(() => this.onChange()));
    this.onChange();
  }

  private onChange(): void {
    // Remembers recently used branches for the popup (the widget itself is BranchWidget).
    const head = this.vcs.repository?.state.HEAD;
    if (head?.name && head.name !== this.lastHead) {
      this.lastHead = head.name;
      const recent = [head.name, ...this.state.get<string[]>(RECENT_KEY, []).filter((b) => b !== head.name)].slice(0, 10);
      void this.state.update(RECENT_KEY, recent);
    }
  }

  private requireRepository(): boolean {
    if (!this.vcs.available) {
      void vscode.window.showWarningMessage(t('Git is not available: the built-in Git extension is disabled.'));
      return false;
    }
    if (!this.vcs.repository) {
      void vscode.window.showWarningMessage(t('No Git repository in this workspace.'));
      return false;
    }
    return true;
  }

  private async branches(): Promise<BranchInfo[]> {
    return parseRefs(await this.vcs.git(['for-each-ref', `--format=${REF_FORMAT}`, 'refs/heads', 'refs/remotes'], false));
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
      void vscode.window.showErrorMessage(t('{0} failed: {1}', title, error instanceof Error ? error.message : String(error)));
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
      { label: t('$(repo-pull) Update Project…'), description: shortcutFor('unintellij.updateProject'), run: () => vscode.commands.executeCommand('unintellij.updateProject') },
      { label: t('$(git-commit) Commit…'), description: shortcutFor('unintellij.commit'), run: () => vscode.commands.executeCommand('unintellij.commit') },
      { label: t('$(repo-push) Push…'), description: shortcutFor('unintellij.push'), run: () => this.push() },
      { label: t('$(add) New Branch…'), run: () => this.newBranch(current) },
      { label: t('$(tag) Checkout Tag or Revision…'), run: () => this.checkoutRevision() },
    ];
    const recent = recentNames.map((n) => local.find((b) => b.name === n)).filter((b): b is BranchInfo => b !== undefined);
    if (recent.length > 0) {
      items.push(separator(t('Recent')), ...recent.map(branchItem));
    }
    items.push(separator(t('Local')), ...local.map(branchItem));
    if (remote.length > 0) {
      items.push(separator(t('Remote')), ...remote.map(branchItem));
    }
    const picked = await vscode.window.showQuickPick(items, { title: t('Git Branches · {0}', current ?? 'detached HEAD'), placeHolder: t('Type to search branches and actions'), matchOnDescription: true });
    await picked?.run?.();
  }

  private async branchActions(branch: BranchInfo): Promise<void> {
    const current = this.current();
    const isCurrent = branch.name === current;
    const items: Action[] = [];
    if (branch.remote) {
      items.push(
        { label: t('Checkout'), run: () => this.checkoutRemote(branch) },
        { label: t('New Branch from \'{0}\'…', branch.name), run: () => this.newBranch(branch.name) },
      );
      if (current) {
        items.push(
          separator(''),
          { label: t('Merge \'{0}\' into \'{1}\'', branch.name, current), run: () => this.operation(t('Merging {0}', branch.name), () => this.vcs.git(['merge', branch.name])) },
          { label: t('Rebase \'{0}\' onto \'{1}\'', current, branch.name), run: () => this.operation(t('Rebasing {0}', current), () => this.vcs.git(['rebase', branch.name])) },
          { label: t('Compare with \'{0}\'', current), run: () => this.compare(branch.name, current) },
        );
      }
      items.push(separator(''), { label: t('Delete…'), run: () => vscode.commands.executeCommand('git.deleteRemoteBranch') });
    } else if (isCurrent) {
      items.push(
        { label: t('New Branch from \'{0}\'…', branch.name), run: () => this.newBranch(branch.name) },
        { label: t('Update'), run: () => vscode.commands.executeCommand('unintellij.updateProject') },
        { label: t('Push…'), run: () => this.push() },
        separator(''),
        { label: t('Rename…'), run: () => this.rename(branch.name) },
      );
    } else {
      items.push(
        { label: t('Checkout'), run: () => this.operation(`Checking out ${branch.name}`, () => this.vcs.git(['checkout', branch.name])) },
        { label: t('New Branch from \'{0}\'…', branch.name), run: () => this.newBranch(branch.name) },
      );
      if (current) {
        items.push(
          { label: t('Checkout and Rebase onto \'{0}\'', current), run: () => this.operation(t('Rebasing {0}', branch.name), () => this.vcs.git(['rebase', current, branch.name])) },
          separator(''),
          { label: t('Compare with \'{0}\'', current), run: () => this.compare(branch.name, current) },
          { label: t('Rebase \'{0}\' onto \'{1}\'', current, branch.name), run: () => this.operation(t('Rebasing {0}', current), () => this.vcs.git(['rebase', branch.name])) },
          { label: t('Merge \'{0}\' into \'{1}\'', branch.name, current), run: () => this.operation(t('Merging {0}', branch.name), () => this.vcs.git(['merge', branch.name])) },
        );
      }
      items.push(
        ...[
          separator(''),
          branch.upstream && { label: t('Update'), run: () => this.updateBranch(branch) },
          { label: t('Push…'), run: () => this.push(branch.name) },
          { label: t('Rename…'), run: () => this.rename(branch.name) },
          { label: t('Delete'), run: () => this.deleteBranch(branch.name) },
        ].filter((i): i is Action => Boolean(i)),
      );
    }
    const picked = await vscode.window.showQuickPick(items, { title: t('Branch \'{0}\'', branch.name) });
    await picked?.run?.();
  }

  async newBranch(from?: string): Promise<void> {
    if (!this.requireRepository()) {
      return;
    }
    const name = await vscode.window.showInputBox({
      title: from ? t('Create New Branch from \'{0}\'', from) : t('Create New Branch'),
      prompt: t('New branch name'),
      validateInput: validateBranchName,
    });
    if (!name) {
      return;
    }
    await this.operation(t('Creating branch {0}', name), () => this.vcs.git(['checkout', '-b', name, ...(from ? [from] : [])]));
  }

  private async checkoutRemote(branch: BranchInfo): Promise<void> {
    const local = localNameForRemote(branch.name);
    const exists = (await this.branches()).some((b) => !b.remote && b.name === local);
    if (exists) {
      await this.operation(t('Checking out {0}', local), () => this.vcs.git(['checkout', local]));
      return;
    }
    await this.operation(t('Checking out {0}', branch.name), () => this.vcs.git(['checkout', '--track', '-b', local, branch.name]));
  }

  private async checkoutRevision(): Promise<void> {
    const ref = await vscode.window.showInputBox({ title: t('Checkout Tag or Revision'), prompt: t('Tag, commit hash or any revision') });
    if (ref) {
      await this.operation(t('Checking out {0}', ref), () => this.vcs.git(['checkout', ref]));
    }
  }

  private async rename(name: string): Promise<void> {
    const next = await vscode.window.showInputBox({ title: t('Rename Branch \'{0}\'', name), value: name, validateInput: validateBranchName });
    if (next && next !== name) {
      await this.operation(t('Renaming {0}', name), () => this.vcs.git(['branch', '-m', name, next]));
    }
  }

  private async deleteBranch(name: string): Promise<void> {
    const ok = await this.operation(t('Deleting {0}', name), () => this.vcs.git(['branch', '-d', name]));
    if (!ok) {
      const force = await vscode.window.showWarningMessage(t('Branch \'{0}\' is not fully merged. Delete it anyway?', name), { modal: true }, t('Delete'));
      if (force === t('Delete')) {
        await this.operation(t('Deleting {0}', name), () => this.vcs.git(['branch', '-D', name]));
      }
    }
  }

  private async updateBranch(branch: BranchInfo): Promise<void> {
    const repository = this.vcs.repository!;
    const [remote, ...rest] = (branch.upstream ?? '').split('/');
    await this.operation(t('Updating {0}', branch.name), () => repository.fetch({ remote, ref: `${rest.join('/')}:${branch.name}` }));
  }

  private async compare(branch: string, current: string): Promise<void> {
    const [incoming, outgoing] = await Promise.all([
      this.vcs.git(['log', `--format=${COMMIT_FORMAT}`, '-n', '200', `${current}..${branch}`], false),
      this.vcs.git(['log', `--format=${COMMIT_FORMAT}`, '-n', '200', `${branch}..${current}`], false),
    ]);
    const item = (c: ReturnType<typeof parseCommits>[number]): Action => ({ label: c.subject, description: `${c.hash.slice(0, 8)} · ${c.author} · ${c.relativeDate}` });
    await vscode.window.showQuickPick(
      [
        separator(t('In \'{0}\' but not in \'{1}\'', branch, current)),
        ...parseCommits(incoming).map(item),
        separator(t('In \'{0}\' but not in \'{1}\'', current, branch)),
        ...parseCommits(outgoing).map(item),
      ],
      { title: t('Compare \'{0}\' with \'{1}\'', branch, current) },
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
      void vscode.window.showWarningMessage(t('Cannot push a detached HEAD.'));
      return;
    }
    const info = (await this.branches()).find((b) => !b.remote && b.name === branch);
    let remote = info?.upstream?.split('/')[0];
    const remoteBranch = info?.upstream?.slice((remote?.length ?? 0) + 1) ?? branch;
    if (!remote) {
      const remotes = repository.state.remotes.map((r) => r.name);
      if (remotes.length === 0) {
        void vscode.window.showWarningMessage(t('No remote configured for this repository.'));
        return;
      }
      remote = remotes.length === 1 ? remotes[0] : await vscode.window.showQuickPick(remotes, { title: t('Push to remote') });
      if (!remote) {
        return;
      }
    }
    const range = info?.upstream ? `${info.upstream}..${branch}` : branch;
    const args = ['log', `--format=${COMMIT_FORMAT}`, '-n', '100', range];
    if (!info?.upstream) {
      args.push('--not', '--remotes');
    }
    const commits = parseCommits(await this.vcs.git(args, false));
    const target = `${remote}/${remoteBranch}`;
    const setUpstream = !info?.upstream;
    const items: Action[] = [
      { label: t('$(repo-push) Push'), description: `${branch} → ${target}${setUpstream ? ' (new)' : ''}`, run: () => this.operation(`Pushing ${branch}`, () => repository.push(remote, branch, setUpstream)) },
      { label: t('$(warning) Force Push'), description: t('with lease'), run: () => this.forcePush(branch, remote!, setUpstream) },
      separator(commits.length === 0 ? t('Nothing to push') : commits.length === 1 ? t('1 commit to push') : t('{0} commits to push', commits.length)),
      ...commits.map((c) => ({ label: `$(git-commit) ${c.subject}`, description: `${c.hash.slice(0, 8)} · ${c.author} · ${c.relativeDate}` })),
    ];
    const picked = await vscode.window.showQuickPick(items, { title: t('Push Commits to {0}', target), placeHolder: t('Select Push to confirm') });
    await picked?.run?.();
  }

  private async forcePush(branch: string, remote: string, setUpstream: boolean): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(t('Force push \'{0}\' to \'{1}\'? Remote commits not in your branch will be lost.', branch, remote), { modal: true }, t('Force Push'));
    if (confirm === t('Force Push')) {
      await this.operation(t('Force pushing {0}', branch), () => this.vcs.repository!.push(remote, branch, setUpstream, FORCE_WITH_LEASE));
    }
  }

  // --- Fetch, update project and VCS operations popup ---------------------------------------------

  /** Fetches all remotes; `silent` is the background fetch (no progress, errors only logged). */
  async fetch(silent = false): Promise<void> {
    const repository = this.vcs.repository;
    if (silent) {
      await repository?.fetch({ all: true, prune: true });
      return;
    }
    if (this.requireRepository()) {
      await this.operation(t('Fetching'), () => repository!.fetch({ all: true, prune: true }));
    }
  }

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
      { label: t('$(repo-fetch) Fetch'), run: () => vscode.commands.executeCommand('git.fetch') },
      { label: t('$(warning) Resolve Conflicts…'), run: () => vscode.commands.executeCommand('unintellij.git.resolveConflicts') },
      { label: t('$(history) Show Git Log'), run: () => vscode.commands.executeCommand('unintellij.git.showLog') },
      separator(''),
      file && { label: t('$(discard) Rollback File…'), run: () => vscode.commands.executeCommand('unintellij.commit.rollback', { webviewSection: 'file', paths: [file.fsPath], preventDefaultContextMenuItems: true }) },
      file && { label: t('$(history) Show History'), run: () => vscode.commands.executeCommand('unintellij.git.showFileHistory', file) },
      file && { label: t('$(account) Annotate with Git Blame'), run: () => this.toggleBlame() },
      separator(''),
      { label: withShortcut('$(git-branch) Branches…', 'unintellij.branches'), run: () => this.showBranches() },
      { label: t('$(add) New Branch…'), run: () => this.newBranch(this.current()) },
      { label: t('$(archive) Stash Changes…'), run: () => vscode.commands.executeCommand('git.stash') },
      { label: t('$(desktop-download) Unstash Changes…'), run: () => vscode.commands.executeCommand('git.stashPop') },
    ].filter((i): i is Action => Boolean(i));
    const picked = await vscode.window.showQuickPick(items, { title: t('VCS Operations') });
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
