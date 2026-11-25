import * as path from 'node:path';
import * as vscode from 'vscode';
import { excludedGlobs, toExcludeGlob } from './excludes';

export interface IndexedFile {
  uri: vscode.Uri;
  name: string;
  /** Directory relative to its workspace folder, prefixed with the folder name in multi-root workspaces. */
  relativeDir: string;
}

const MAX_FILES = 200_000;

/**
 * Lazily built list of workspace files, one per "include non-project items" mode.
 * Invalidated when files are created, deleted or exclusions change; rebuilt on next use.
 */
export class FileIndex implements vscode.Disposable {
  private readonly cache = new Map<boolean, Promise<IndexedFile[]>>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, true, false);
    const invalidate = (): void => this.cache.clear();
    this.disposables.push(
      watcher,
      watcher.onDidCreate(invalidate),
      watcher.onDidDelete(invalidate),
      vscode.workspace.onDidChangeWorkspaceFolders(invalidate),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (['files.exclude', 'search.exclude', 'unintellij.searchEverywhere.excludePatterns'].some((s) => e.affectsConfiguration(s))) {
          invalidate();
        }
      }),
    );
  }

  files(includeNonProjectItems: boolean): Promise<IndexedFile[]> {
    let files = this.cache.get(includeNonProjectItems);
    if (!files) {
      files = this.build(includeNonProjectItems);
      this.cache.set(includeNonProjectItems, files);
      files.catch(() => this.cache.delete(includeNonProjectItems));
    }
    return files;
  }

  private async build(includeNonProjectItems: boolean): Promise<IndexedFile[]> {
    const exclude = toExcludeGlob(excludedGlobs(includeNonProjectItems));
    // `null` disables files.exclude; we pass our own complete list instead.
    const uris = await vscode.workspace.findFiles('**/*', exclude ?? null, MAX_FILES);
    const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    return uris.map((uri) => {
      const relative = vscode.workspace.asRelativePath(uri, multiRoot);
      const dir = path.posix.dirname(relative.replace(/\\/g, '/'));
      return { uri, name: path.posix.basename(uri.path), relativeDir: dir === '.' ? '' : dir };
    });
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
