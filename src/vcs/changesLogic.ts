/**
 * IntelliJ-style change management on top of Git: no staging area, changelists, commit of the
 * checked files only. Pure: no `vscode` import.
 */

/** File status as IntelliJ shows it (Modified, Added, Deleted, Renamed, Unversioned, Conflict). */
export type FileStatus = 'M' | 'A' | 'D' | 'R' | 'U' | 'C';

/** Numeric `Status` values of VS Code's Git extension API (git.d.ts). */
export const GIT_STATUS = {
  INDEX_MODIFIED: 0,
  INDEX_ADDED: 1,
  INDEX_DELETED: 2,
  INDEX_RENAMED: 3,
  INDEX_COPIED: 4,
  MODIFIED: 5,
  DELETED: 6,
  UNTRACKED: 7,
  IGNORED: 8,
  INTENT_TO_ADD: 9,
  INTENT_TO_RENAME: 10,
  TYPE_CHANGED: 11,
  ADDED_BY_US: 12,
  ADDED_BY_THEM: 13,
  DELETED_BY_US: 14,
  DELETED_BY_THEM: 15,
  BOTH_ADDED: 16,
  BOTH_DELETED: 17,
  BOTH_MODIFIED: 18,
} as const;

export function toFileStatus(status: number): FileStatus | undefined {
  switch (status) {
    case GIT_STATUS.INDEX_ADDED:
    case GIT_STATUS.INTENT_TO_ADD:
    case GIT_STATUS.INDEX_COPIED:
      return 'A';
    case GIT_STATUS.INDEX_DELETED:
    case GIT_STATUS.DELETED:
      return 'D';
    case GIT_STATUS.INDEX_RENAMED:
    case GIT_STATUS.INTENT_TO_RENAME:
      return 'R';
    case GIT_STATUS.UNTRACKED:
      return 'U';
    case GIT_STATUS.IGNORED:
      return undefined;
    case GIT_STATUS.ADDED_BY_US:
    case GIT_STATUS.ADDED_BY_THEM:
    case GIT_STATUS.DELETED_BY_US:
    case GIT_STATUS.DELETED_BY_THEM:
    case GIT_STATUS.BOTH_ADDED:
    case GIT_STATUS.BOTH_DELETED:
    case GIT_STATUS.BOTH_MODIFIED:
      return 'C';
    default:
      return 'M';
  }
}

export interface RawChange {
  path: string;
  status: number;
  /** True for changes from the index (staged). */
  staged: boolean;
}

export interface FileChange {
  path: string;
  status: FileStatus;
  /** Whether the index currently holds a version of this change. */
  staged: boolean;
}

/**
 * Merges index and working tree changes into one entry per file, like IntelliJ's single
 * "Changes" list: a file added in the index and modified afterwards is still "Added".
 */
export function mergeChanges(raw: readonly RawChange[]): FileChange[] {
  const byPath = new Map<string, FileChange>();
  const priority: Record<FileStatus, number> = { C: 5, A: 4, D: 3, R: 2, M: 1, U: 0 };
  for (const change of raw) {
    const status = toFileStatus(change.status);
    if (!status) {
      continue;
    }
    const existing = byPath.get(change.path);
    if (!existing) {
      byPath.set(change.path, { path: change.path, status, staged: change.staged });
      continue;
    }
    byPath.set(change.path, {
      path: change.path,
      status: priority[status] > priority[existing.status] ? status : existing.status,
      staged: existing.staged || change.staged,
    });
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export interface CommitPlan {
  /** Staged files that are not part of this commit: unstage them first. */
  unstage: string[];
  /** Files to stage (all checked files, including deletions and new files). */
  stage: string[];
}

/** What to do with the index so that the commit contains exactly the checked files. */
export function planCommit(changes: readonly FileChange[], checked: ReadonlySet<string>): CommitPlan {
  return {
    unstage: changes.filter((c) => c.staged && !checked.has(c.path)).map((c) => c.path),
    stage: changes.filter((c) => checked.has(c.path)).map((c) => c.path),
  };
}

// --- Changelists ---------------------------------------------------------------------------------

export interface Changelist {
  id: string;
  name: string;
  comment?: string;
}

export interface ChangelistState {
  lists: Changelist[];
  activeId: string;
  /** File path → changelist id. Files without an entry belong to the active changelist when first seen. */
  assignments: Record<string, string>;
}

export const DEFAULT_CHANGELIST: Changelist = { id: 'default', name: 'Changes' };

export function initialChangelists(): ChangelistState {
  return { lists: [{ ...DEFAULT_CHANGELIST }], activeId: DEFAULT_CHANGELIST.id, assignments: {} };
}

/**
 * Assigns new changed files to the active changelist and forgets files that are no longer
 * changed (IntelliJ empties changelists as their files are committed or reverted).
 */
export function syncAssignments(state: ChangelistState, changedPaths: readonly string[]): ChangelistState {
  const known = new Set(state.lists.map((l) => l.id));
  const assignments: Record<string, string> = {};
  for (const path of changedPaths) {
    const current = state.assignments[path];
    assignments[path] = current && known.has(current) ? current : state.activeId;
  }
  return { ...state, assignments };
}

export function createChangelist(state: ChangelistState, name: string, id: string, makeActive = false): ChangelistState {
  const lists = [...state.lists, { id, name }];
  return { ...state, lists, activeId: makeActive ? id : state.activeId };
}

export function renameChangelist(state: ChangelistState, id: string, name: string): ChangelistState {
  return { ...state, lists: state.lists.map((l) => (l.id === id ? { ...l, name } : l)) };
}

/** Deletes a changelist; its files move to the active one (or the default when deleting the active one). */
export function deleteChangelist(state: ChangelistState, id: string): ChangelistState {
  if (state.lists.length <= 1) {
    return state;
  }
  const lists = state.lists.filter((l) => l.id !== id);
  const activeId = state.activeId === id ? lists[0].id : state.activeId;
  const assignments = Object.fromEntries(Object.entries(state.assignments).map(([path, list]) => [path, list === id ? activeId : list]));
  return { lists, activeId, assignments };
}

export function setActiveChangelist(state: ChangelistState, id: string): ChangelistState {
  return state.lists.some((l) => l.id === id) ? { ...state, activeId: id } : state;
}

export function moveToChangelist(state: ChangelistState, paths: readonly string[], id: string): ChangelistState {
  if (!state.lists.some((l) => l.id === id)) {
    return state;
  }
  const assignments = { ...state.assignments };
  for (const path of paths) {
    assignments[path] = id;
  }
  return { ...state, assignments };
}
