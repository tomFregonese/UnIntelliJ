/** Messages between the Git tool window (log) webview and the extension. Pure types. */
import type { ChangedFile, GraphRow } from './logLogic';

export interface LogFilters {
  text: string;
  /** `all`, `HEAD` or a branch name. */
  branch: string;
  /** `all` or an author name. */
  author: string;
  /** `all` or a number of days. */
  since: string;
  /** Repository-relative path for file history, empty for the whole repository. */
  path: string;
}

export const DEFAULT_FILTERS: LogFilters = { text: '', branch: 'all', author: 'all', since: 'all', path: '' };

export interface RefLabel {
  name: string;
  kind: 'head' | 'local' | 'remote' | 'tag';
}

export interface CommitRow {
  hash: string;
  subject: string;
  author: string;
  date: string;
  refs: RefLabel[];
}

export interface CommitDetails {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  files: ChangedFile[];
}

export type ToGitLog =
  | { type: 'log'; commits: CommitRow[]; graph: GraphRow[]; branches: string[]; authors: string[]; filters: LogFilters; hasMore: boolean }
  | { type: 'details'; details: CommitDetails }
  | { type: 'unavailable'; reason: string };

export type FromGitLog =
  | { type: 'ready' }
  | { type: 'filter'; filters: LogFilters }
  | { type: 'select'; hash: string }
  | { type: 'openDiff'; hash: string; file: ChangedFile }
  | { type: 'loadMore' }
  | { type: 'refresh' };

/** Context of commit rows for VS Code's native webview context menu. */
export interface CommitContext {
  webviewSection: 'commit';
  hash: string;
  preventDefaultContextMenuItems: true;
}

/** Classifies a `git log --format=%D` decoration, given the repository's remote names. */
export function classifyRef(ref: string, remotes: readonly string[]): RefLabel[] {
  if (ref.startsWith('HEAD -> ')) {
    return [{ name: ref.slice('HEAD -> '.length), kind: 'head' }];
  }
  if (ref === 'HEAD') {
    return [{ name: 'HEAD', kind: 'head' }];
  }
  if (ref.startsWith('tag: ')) {
    return [{ name: ref.slice('tag: '.length), kind: 'tag' }];
  }
  if (ref.endsWith('/HEAD')) {
    return [];
  }
  return [{ name: ref, kind: remotes.some((remote) => ref.startsWith(`${remote}/`)) ? 'remote' : 'local' }];
}
