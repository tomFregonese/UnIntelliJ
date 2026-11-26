/**
 * VS Code's recent projects (`_workbench.getRecentlyOpened`) for the project widget. Pure: the
 * `Uri` class is passed in so this runs in unit tests.
 */

interface UriLike {
  scheme: string;
  path: string;
  fsPath?: string;
  toString(): string;
}

/** Entries as VS Code returns them: a folder or a .code-workspace file. */
export type RecentEntry<U extends UriLike = UriLike> = { folderUri: U; label?: string; remoteAuthority?: string } | { workspace: { configPath: U }; label?: string; remoteAuthority?: string };

export interface RecentProject<U extends UriLike = UriLike> {
  uri: U;
  /** Folder name, or workspace file name without `.code-workspace`. */
  label: string;
  /** Where it is, `~` for the home folder (IntelliJ shows the path under the name). */
  path: string;
  workspace: boolean;
}

function baseName(path: string): string {
  return path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? path;
}

/** Recent folders and workspaces in VS Code's order (most recent first). */
export function recentProjects<U extends UriLike>(entries: readonly RecentEntry<U>[], home: string): RecentProject<U>[] {
  return entries.map((entry) => {
    const workspace = 'workspace' in entry;
    const uri = workspace ? entry.workspace.configPath : entry.folderUri;
    const local = uri.scheme === 'file' ? (uri.fsPath ?? uri.path) : undefined;
    const name = baseName(uri.path).replace(/\.code-workspace$/, '');
    const shown = local ?? `${entry.remoteAuthority ? `[${entry.remoteAuthority}] ` : ''}${uri.path}`;
    const tilde = local && home && (local === home || local.startsWith(home + '/') || local.startsWith(home + '\\')) ? `~${local.slice(home.length)}` : shown;
    return { uri, label: entry.label && !entry.label.includes('/') && !entry.label.includes('\\') ? entry.label : name, path: tilde, workspace };
  });
}
