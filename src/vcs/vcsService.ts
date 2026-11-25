import * as vscode from 'vscode';
import { getSetting } from '../config/settings';
import {
  Changelist,
  ChangelistState,
  createChangelist,
  deleteChangelist,
  FileChange,
  initialChangelists,
  mergeChanges,
  moveToChangelist,
  planCommit,
  RawChange,
  renameChangelist,
  setActiveChangelist,
  syncAssignments,
} from './changesLogic';
import { getGitApi, GitApi, Repository } from './gitApi';
import { runGit } from './gitCli';

const CHANGELISTS_KEY = 'vcs.changelists';

export interface ChangelistView extends Changelist {
  active: boolean;
  files: FileChange[];
}

/**
 * Current repository and IntelliJ-style operations on it. Emits `onDidChange` when the
 * repository state or changelists change.
 */
export class VcsService implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private api: GitApi | undefined;
  private changelists: ChangelistState;
  private readonly disposables: vscode.Disposable[] = [this.changed];
  private repositoryListeners: vscode.Disposable[] = [];
  readonly ready: Promise<void>;

  constructor(private readonly state: vscode.Memento) {
    this.changelists = state.get<ChangelistState>(CHANGELISTS_KEY) ?? initialChangelists();
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    this.api = await getGitApi();
    if (!this.api) {
      return;
    }
    const listen = (): void => {
      this.repositoryListeners.forEach((d) => d.dispose());
      this.repositoryListeners = this.api!.repositories.map((r) => r.state.onDidChange(() => this.onRepositoryChange()));
      this.onRepositoryChange();
    };
    this.disposables.push(this.api.onDidOpenRepository(listen), this.api.onDidCloseRepository(listen), vscode.window.onDidChangeActiveTextEditor(() => this.changed.fire()));
    listen();
  }

  get available(): boolean {
    return this.api !== undefined;
  }

  get gitApi(): GitApi | undefined {
    return this.api;
  }

  /** Repository of the active file, else the first one. */
  get repository(): Repository | undefined {
    if (!this.api || this.api.repositories.length === 0) {
      return undefined;
    }
    const active = vscode.window.activeTextEditor?.document.uri;
    return (active && this.api.getRepository(active)) || this.api.repositories[0];
  }

  /** All changed files of the current repository, one entry per file. */
  changes(): FileChange[] {
    const repository = this.repository;
    if (!repository) {
      return [];
    }
    const { indexChanges, workingTreeChanges, untrackedChanges, mergeChanges: conflicts } = repository.state;
    const raw: RawChange[] = [
      ...indexChanges.map((c) => ({ path: c.uri.fsPath, status: c.status, staged: true })),
      ...workingTreeChanges.map((c) => ({ path: c.uri.fsPath, status: c.status, staged: false })),
      ...(untrackedChanges ?? []).map((c) => ({ path: c.uri.fsPath, status: c.status, staged: false })),
      ...conflicts.map((c) => ({ path: c.uri.fsPath, status: c.status, staged: false })),
    ];
    return mergeChanges(raw);
  }

  /** Tracked changes grouped by changelist (a single "Changes" list when changelists are disabled), plus unversioned files. */
  groupedChanges(): { lists: ChangelistView[]; unversioned: FileChange[] } {
    const changes = this.changes();
    const tracked = changes.filter((c) => c.status !== 'U');
    const unversioned = changes.filter((c) => c.status === 'U');
    if (!getSetting('vcs.changelists.enabled')) {
      return { lists: [{ id: 'default', name: 'Changes', active: true, files: tracked }], unversioned };
    }
    const assignments = this.changelists.assignments;
    return {
      lists: this.changelists.lists.map((list) => ({
        ...list,
        active: list.id === this.changelists.activeId,
        files: tracked.filter((c) => (assignments[c.path] ?? this.changelists.activeId) === list.id),
      })),
      unversioned,
    };
  }

  private onRepositoryChange(): void {
    const tracked = this.changes()
      .filter((c) => c.status !== 'U')
      .map((c) => c.path);
    void this.saveChangelists(syncAssignments(this.changelists, tracked), false);
    this.changed.fire();
  }

  private async saveChangelists(next: ChangelistState, notify = true): Promise<void> {
    this.changelists = next;
    await this.state.update(CHANGELISTS_KEY, next);
    if (notify) {
      this.changed.fire();
    }
  }

  // --- Changelists -------------------------------------------------------------------------------

  newChangelist(name: string, makeActive: boolean): Promise<void> {
    return this.saveChangelists(createChangelist(this.changelists, name, `cl-${Date.now().toString(36)}`, makeActive));
  }

  renameChangelist(id: string, name: string): Promise<void> {
    return this.saveChangelists(renameChangelist(this.changelists, id, name));
  }

  deleteChangelist(id: string): Promise<void> {
    return this.saveChangelists(deleteChangelist(this.changelists, id));
  }

  setActiveChangelist(id: string): Promise<void> {
    return this.saveChangelists(setActiveChangelist(this.changelists, id));
  }

  moveToChangelist(paths: string[], id: string): Promise<void> {
    return this.saveChangelists(moveToChangelist(this.changelists, paths, id));
  }

  changelistNames(): Changelist[] {
    return this.changelists.lists;
  }

  // --- Operations --------------------------------------------------------------------------------

  private requireRepository(): Repository {
    const repository = this.repository;
    if (!repository) {
      throw new Error('No Git repository in this workspace.');
    }
    return repository;
  }

  /** Commits exactly `paths` (IntelliJ ignores the staging area), optionally amending. */
  async commit(paths: readonly string[], message: string, amend: boolean): Promise<void> {
    const repository = this.requireRepository();
    const plan = planCommit(this.changes(), new Set(paths));
    if (plan.unstage.length > 0) {
      await repository.revert(plan.unstage);
    }
    if (plan.stage.length > 0) {
      await repository.add(plan.stage);
    }
    await repository.commit(message, { amend });
  }

  /** IntelliJ "Rollback": discards changes; added files are unstaged and deleted. */
  async rollback(paths: readonly string[]): Promise<void> {
    const repository = this.requireRepository();
    const changes = this.changes().filter((c) => paths.includes(c.path));
    const staged = changes.filter((c) => c.staged).map((c) => c.path);
    if (staged.length > 0) {
      await repository.revert(staged);
    }
    await repository.clean(changes.map((c) => c.path));
  }

  async addToVcs(paths: readonly string[]): Promise<void> {
    await this.requireRepository().add([...paths]);
  }

  async lastCommitMessage(): Promise<string> {
    try {
      return (await this.requireRepository().getCommit('HEAD')).message;
    } catch {
      return '';
    }
  }

  /** Runs a git command in the repository root; `refresh` reloads the repository state afterwards (for commands that change it). */
  async git(args: readonly string[], refresh = true): Promise<string> {
    const repository = this.requireRepository();
    try {
      return (await runGit(this.api!.git.path, repository.rootUri.fsPath, args)).stdout;
    } finally {
      if (refresh) {
        await repository.status();
      }
    }
  }

  dispose(): void {
    this.repositoryListeners.forEach((d) => d.dispose());
    this.disposables.forEach((d) => d.dispose());
  }
}
