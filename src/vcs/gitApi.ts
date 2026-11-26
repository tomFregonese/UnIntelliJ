/**
 * Subset of the API exported by VS Code's built-in Git extension (extensions/git/src/api/git.d.ts),
 * limited to what UnIntelliJ uses.
 */
import * as vscode from 'vscode';

export interface Change {
  readonly uri: vscode.Uri;
  readonly originalUri: vscode.Uri;
  readonly renameUri: vscode.Uri | undefined;
  readonly status: number;
}

export interface Branch {
  readonly type: 0 | 1 | 2; // Head, RemoteHead, Tag
  readonly name?: string;
  readonly commit?: string;
  readonly remote?: string;
  readonly upstream?: { readonly name: string; readonly remote: string };
  readonly ahead?: number;
  readonly behind?: number;
}

export interface Ref {
  readonly type: 0 | 1 | 2;
  readonly name?: string;
  readonly commit?: string;
  readonly remote?: string;
}

export interface Commit {
  readonly hash: string;
  readonly message: string;
  readonly parents: string[];
  readonly authorDate?: Date;
  readonly authorName?: string;
  readonly authorEmail?: string;
}

export interface Remote {
  readonly name: string;
  readonly fetchUrl?: string;
  readonly pushUrl?: string;
}

export interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly remotes: Remote[];
  readonly mergeChanges: Change[];
  readonly indexChanges: Change[];
  readonly workingTreeChanges: Change[];
  /** Present when `git.untrackedChanges` is "separate". */
  readonly untrackedChanges?: Change[];
  readonly onDidChange: vscode.Event<void>;
}

export interface Repository {
  readonly rootUri: vscode.Uri;
  readonly state: RepositoryState;
  readonly inputBox: { value: string };
  status(): Promise<void>;
  add(paths: string[]): Promise<void>;
  /** Unstages (git reset) the given paths. */
  revert(paths: string[]): Promise<void>;
  /** Discards working tree changes; deletes untracked files. */
  clean(paths: string[]): Promise<void>;
  commit(message: string, opts?: { amend?: boolean; all?: boolean | 'tracked'; signoff?: boolean }): Promise<void>;
  checkout(treeish: string): Promise<void>;
  createBranch(name: string, checkout: boolean, ref?: string): Promise<void>;
  deleteBranch(name: string, force?: boolean): Promise<void>;
  getBranches?(query: { remote?: boolean }): Promise<Ref[]>;
  getRefs?(query: { pattern?: string; sort?: 'alphabetically' | 'committerdate'; contains?: string; count?: number }): Promise<Ref[]>;
  getCommit(ref: string): Promise<Commit>;
  log(options?: { maxEntries?: number; path?: string; range?: string }): Promise<Commit[]>;
  fetch(options?: { remote?: string; ref?: string; all?: boolean; prune?: boolean }): Promise<void>;
  pull(unshallow?: boolean): Promise<void>;
  push(remoteName?: string, branchName?: string, setUpstream?: boolean, force?: number): Promise<void>;
  merge?(ref: string): Promise<void>;
}

export interface GitApi {
  readonly git: { readonly path: string };
  readonly repositories: Repository[];
  /** `initialized` once the Git extension has scanned the workspace for repositories. */
  readonly state: 'uninitialized' | 'initialized';
  readonly onDidChangeState: vscode.Event<'uninitialized' | 'initialized'>;
  readonly onDidOpenRepository: vscode.Event<Repository>;
  readonly onDidCloseRepository: vscode.Event<Repository>;
  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
  getRepository(uri: vscode.Uri): Repository | null;
  openRepository?(root: vscode.Uri): Promise<Repository | null>;
}

/**
 * The Git API, or undefined when the built-in Git extension is missing or disabled. `onEnabled` is
 * called if a disabled Git extension gets enabled later (`git.enabled` turned on).
 */
export async function getGitApi(onEnabled?: () => void): Promise<GitApi | undefined> {
  const extension = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi; enabled: boolean; onDidChangeEnablement: vscode.Event<boolean> }>('vscode.git');
  if (!extension) {
    return undefined;
  }
  const exports = extension.isActive ? extension.exports : await extension.activate();
  if (!exports.enabled) {
    if (onEnabled) {
      const listener = exports.onDidChangeEnablement((enabled) => {
        if (enabled) {
          listener.dispose();
          onEnabled();
        }
      });
    }
    return undefined;
  }
  return exports.getAPI(1);
}
