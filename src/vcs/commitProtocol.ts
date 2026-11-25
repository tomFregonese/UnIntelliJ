/** Messages between the Commit tool window webview and the extension. Pure types. */
import type { FileStatus } from './changesLogic';

export interface FileItem {
  path: string;
  name: string;
  /** Directory relative to the repository root. */
  dir: string;
  status: FileStatus;
  /** Webview URIs of the New UI file icon, for dark and light themes. */
  icon?: { dark: string; light: string };
}

export interface ChangelistItem {
  id: string;
  name: string;
  active: boolean;
  files: FileItem[];
}

export interface CommitViewState {
  available: boolean;
  /** Why the view is empty (no Git, no repository). */
  reason?: string;
  repository?: string;
  branch?: string;
  changelistsEnabled: boolean;
  lists: ChangelistItem[];
  unversioned: FileItem[];
  /** Commit shortcut of the active keymap, shown on the button. */
  commitShortcut?: string;
}

export type FromCommitView =
  | { type: 'ready' }
  | { type: 'commit'; paths: string[]; message: string; amend: boolean; push: boolean }
  | { type: 'amend'; enabled: boolean; message: string }
  | { type: 'diff'; path: string }
  | { type: 'refresh' }
  | { type: 'rollback'; paths: string[] }
  | { type: 'newChangelist' };

export type ToCommitView =
  | { type: 'state'; state: CommitViewState }
  | { type: 'setMessage'; message: string }
  | { type: 'committed' }
  | { type: 'focusMessage' }
  | { type: 'busy'; busy: boolean };

/** Context attached to rows for VS Code's native webview context menu (data-vscode-context). */
export interface RowContext {
  webviewSection: 'file' | 'changelist' | 'unversioned';
  /** Selected paths when the row is part of the selection, else the row's path. */
  paths?: string[];
  changelistId?: string;
  preventDefaultContextMenuItems: true;
}
