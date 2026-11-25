import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { VcsService } from '../vcs/vcsService';
import { compareEntries, displayPath, folderIcon, groupPackages, MODULE_MARKERS, PROJECT_MODES, ProjectMode, rootKind, RootKind, validateFileName } from './projectLogic';
import { t } from '../i18n/i18n';

const MODE_KEY = 'project.mode';
const TREE_MIME = 'application/vnd.code.tree.unintellij.project';

type Node =
  | { type: 'fs'; uri: vscode.Uri; directory: boolean; module: boolean; kind: RootKind; parent?: Node; workspaceRoot?: boolean }
  | { type: 'package'; name: string; files: vscode.Uri[] }
  | { type: 'message'; label: string };

/**
 * IntelliJ's Project tool window: the "Project ▾" selector switches between Project (modules and
 * source roots), Packages, Project Files, Open Files and Changed Files. File operations (new,
 * rename with reference updates, delete to trash, drag and drop, copy path) work in every mode.
 */
export class ProjectView implements vscode.Disposable, vscode.TreeDataProvider<Node>, vscode.TreeDragAndDropController<Node> {
  readonly dropMimeTypes = [TREE_MIME, 'text/uri-list'];
  readonly dragMimeTypes = ['text/uri-list'];
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly view: vscode.TreeView<Node>;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly nodes = new Map<string, Node>();
  private refreshTimer: NodeJS.Timeout | undefined;
  private mode: ProjectMode;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly vcs: VcsService,
  ) {
    this.mode = context.workspaceState.get<ProjectMode>(MODE_KEY, 'project');
    this.view = vscode.window.createTreeView('unintellij.project', { treeDataProvider: this, dragAndDropController: this, canSelectMany: true, showCollapseAll: true });
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    this.disposables.push(
      this.view,
      this.changed,
      watcher,
      watcher.onDidCreate(() => this.refreshSoon()),
      watcher.onDidDelete(() => this.refreshSoon()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refreshSoon()),
      vscode.window.tabGroups.onDidChangeTabs(() => this.mode === 'openFiles' && this.refreshSoon()),
      vcs.onDidChange(() => this.mode === 'changedFiles' && this.refreshSoon()),
      vscode.commands.registerCommand('unintellij.project.selectMode', () => this.selectMode()),
      vscode.commands.registerCommand('unintellij.project.selectOpenedFile', () => this.selectOpenedFile()),
      vscode.commands.registerCommand('unintellij.project.newFile', (node?: Node) => this.create(node, false)),
      vscode.commands.registerCommand('unintellij.project.newFolder', (node?: Node) => this.create(node, true)),
      vscode.commands.registerCommand('unintellij.project.rename', (node?: Node) => this.rename(node)),
      vscode.commands.registerCommand('unintellij.project.delete', (node?: Node, nodes?: Node[]) => this.delete(node, nodes)),
      vscode.commands.registerCommand('unintellij.project.copyPath', (node?: Node, nodes?: Node[]) => this.copyPaths(node, nodes, false)),
      vscode.commands.registerCommand('unintellij.project.copyRelativePath', (node?: Node, nodes?: Node[]) => this.copyPaths(node, nodes, true)),
      vscode.commands.registerCommand('unintellij.project.revealInOs', (node?: Node) => this.withUri(node, (uri) => vscode.commands.executeCommand('revealFileInOS', uri))),
      vscode.commands.registerCommand('unintellij.project.openInTerminal', (node?: Node) => this.withUri(node, (uri, dir) => vscode.window.createTerminal({ cwd: dir ? uri : vscode.Uri.joinPath(uri, '..') }).show())),
      vscode.commands.registerCommand('unintellij.project.refresh', () => this.refresh()),
    );
    this.updateTitle();
  }

  // --- Tree data -----------------------------------------------------------------------------------

  private refreshSoon(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refresh(), 300);
  }

  private refresh(): void {
    this.nodes.clear();
    this.changed.fire(undefined);
  }

  private updateTitle(): void {
    this.view.title = PROJECT_MODES.find((m) => m.id === this.mode)!.label;
  }

  private remember(node: Node): Node {
    if (node.type === 'fs') {
      this.nodes.set(node.uri.toString(), node);
    }
    return node;
  }

  getParent(node: Node): Node | undefined {
    return node.type === 'fs' ? node.parent : undefined;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) {
      return this.roots();
    }
    if (node.type === 'package') {
      return node.files.map((uri) => this.remember({ type: 'fs', uri, directory: false, module: false, kind: undefined }));
    }
    if (node.type === 'fs' && node.directory) {
      return this.readDirectory(node);
    }
    return [];
  }

  private async roots(): Promise<Node[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    switch (this.mode) {
      case 'project':
      case 'files':
        return Promise.all(folders.map(async (f) => this.remember({ type: 'fs', uri: f.uri, directory: true, module: this.mode === 'project' && (await this.isModule(f.uri)), kind: undefined, workspaceRoot: true })));
      case 'packages':
        return this.packages();
      case 'openFiles': {
        const uris = new Map<string, vscode.Uri>();
        for (const tab of vscode.window.tabGroups.all.flatMap((g) => g.tabs)) {
          if (tab.input instanceof vscode.TabInputText) {
            uris.set(tab.input.uri.toString(), tab.input.uri);
          }
        }
        return this.flatFiles([...uris.values()], t('No open files'));
      }
      case 'changedFiles': {
        const state = this.vcs.repository?.state;
        const changes = [...(state?.indexChanges ?? []), ...(state?.workingTreeChanges ?? []), ...((state as { untrackedChanges?: { uri: vscode.Uri }[] } | undefined)?.untrackedChanges ?? [])];
        const uris = new Map(changes.map((c) => [c.uri.toString(), c.uri]));
        return this.flatFiles([...uris.values()], t('No local changes'));
      }
    }
  }

  private flatFiles(uris: vscode.Uri[], empty: string): Node[] {
    if (uris.length === 0) {
      return [{ type: 'message', label: empty }];
    }
    return uris
      .sort((a, b) => path.basename(a.fsPath).localeCompare(path.basename(b.fsPath)))
      .map((uri) => this.remember({ type: 'fs', uri, directory: false, module: false, kind: undefined }));
  }

  private async packages(): Promise<Node[]> {
    const files = await vscode.workspace.findFiles('**/src/{main,test}/{java,kotlin}/**/*.{java,kt}', '**/{node_modules,target,build}/**', 20000);
    if (files.length === 0) {
      return [{ type: 'message', label: t('No Java packages in this project') }];
    }
    const relative = new Map<string, vscode.Uri>();
    for (const uri of files) {
      const match = /\/src\/(?:main|test)\/(?:java|kotlin)\/(.+)$/.exec(uri.path);
      if (match) {
        relative.set(`${match[1]}\u0000${uri.toString()}`, uri);
      }
    }
    const grouped = groupPackages([...relative.keys()].map((k) => k.split('\u0000')[0]));
    const byPath = new Map<string, vscode.Uri[]>();
    for (const [key, uri] of relative) {
      const rel = key.split('\u0000')[0];
      byPath.set(rel, [...(byPath.get(rel) ?? []), uri]);
    }
    return [...grouped.entries()].map(([name, rels]) => ({
      type: 'package' as const,
      name: name || '<default package>',
      files: [...new Set(rels)].flatMap((r) => byPath.get(r) ?? []).sort((a, b) => path.basename(a.path).localeCompare(path.basename(b.path))),
    }));
  }

  private async isModule(uri: vscode.Uri): Promise<boolean> {
    for (const marker of MODULE_MARKERS) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(uri, marker));
        return true;
      } catch {
        // Not this marker.
      }
    }
    return false;
  }

  private moduleOf(node: Node | undefined): vscode.Uri | undefined {
    for (let n = node; n; n = n.type === 'fs' ? n.parent : undefined) {
      if (n.type === 'fs' && n.module) {
        return n.uri;
      }
    }
    return undefined;
  }

  private async readDirectory(parent: Extract<Node, { type: 'fs' }>): Promise<Node[]> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(parent.uri);
    } catch {
      return [];
    }
    const excluded = vscode.workspace.getConfiguration('files', parent.uri).get<Record<string, boolean>>('exclude') ?? {};
    const hidden = new Set(Object.entries(excluded).filter(([, v]) => v).map(([k]) => k.replace(/^\*\*\//, '')));
    const module = this.moduleOf(parent);
    const items = entries
      .filter(([name]) => !hidden.has(name))
      .map(([name, type]) => ({ name, directory: (type & vscode.FileType.Directory) !== 0 }))
      .sort(compareEntries);
    return Promise.all(
      items.map(async ({ name, directory }) => {
        const uri = vscode.Uri.joinPath(parent.uri, name);
        const relative = module ? path.posix.relative(module.path, uri.path) : name;
        const isModule = this.mode === 'project' && directory && (await this.isModule(uri));
        return this.remember({ type: 'fs', uri, directory, module: isModule, kind: this.mode === 'project' && directory ? rootKind(relative, name) : undefined, parent });
      }),
    );
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.type === 'message') {
      return new vscode.TreeItem(node.label);
    }
    if (node.type === 'package') {
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon('symbol-package');
      item.contextValue = 'package';
      return item;
    }
    const item = new vscode.TreeItem(node.uri, node.directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.id = `${this.mode}:${node.uri.toString()}`;
    item.contextValue = node.directory ? 'folder' : 'file';
    if (node.workspaceRoot) {
      item.label = path.basename(node.uri.fsPath);
      item.description = displayPath(node.uri.fsPath, os.homedir());
      item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    } else if (node.module && this.mode === 'project') {
      item.description = vscode.workspace.asRelativePath(node.uri, false);
    }
    if (this.mode === 'openFiles' || this.mode === 'changedFiles') {
      item.description = vscode.workspace.asRelativePath(vscode.Uri.joinPath(node.uri, '..'), false);
    }
    const icon = node.directory && this.mode === 'project' ? folderIcon(node.kind, node.module) : undefined;
    if (icon) {
      const file = (suffix: string) => vscode.Uri.joinPath(this.context.extensionUri, 'icons', 'files', `${icon}${suffix}.svg`);
      item.iconPath = { light: file('_light'), dark: file('') };
    }
    if (!node.directory) {
      item.command = { command: 'vscode.open', title: t('Open'), arguments: [node.uri] };
    }
    return item;
  }

  // --- Mode selector and navigation ----------------------------------------------------------------

  private async selectMode(): Promise<void> {
    const picked = await vscode.window.showQuickPick(
      PROJECT_MODES.map((m) => ({ ...m, label: m.id === this.mode ? `$(check) ${m.label}` : `      ${m.label}` })),
      { title: t('Project View'), placeHolder: t('Show the project as…') },
    );
    if (picked) {
      this.mode = picked.id;
      await this.context.workspaceState.update(MODE_KEY, this.mode);
      this.updateTitle();
      this.refresh();
    }
  }

  /** IntelliJ's "Select Opened File" (Alt+F1 › Project View). */
  private async selectOpenedFile(): Promise<void> {
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
      return;
    }
    if (this.mode !== 'project' && this.mode !== 'files') {
      this.mode = 'project';
      this.updateTitle();
      this.refresh();
    }
    // Load the ancestors so that reveal() can find the node.
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) {
      return;
    }
    let children = await this.getChildren();
    let node: Node | undefined;
    const segments = path.posix.relative(folder.uri.path, uri.path).split('/');
    node = children.find((c) => c.type === 'fs' && c.uri.toString() === folder.uri.toString());
    for (const segment of segments) {
      if (!node) {
        break;
      }
      children = await this.getChildren(node);
      node = children.find((c) => c.type === 'fs' && path.posix.basename(c.uri.path) === segment);
    }
    if (node) {
      await this.view.reveal(node, { select: true, focus: true, expand: false });
    }
  }

  // --- File operations -----------------------------------------------------------------------------

  private target(node?: Node): Extract<Node, { type: 'fs' }> | undefined {
    const n = node ?? this.view.selection[0];
    return n?.type === 'fs' ? n : undefined;
  }

  private async withUri(node: Node | undefined, run: (uri: vscode.Uri, directory: boolean) => unknown): Promise<void> {
    const target = this.target(node);
    if (target) {
      await run(target.uri, target.directory);
    }
  }

  private async create(node: Node | undefined, directory: boolean): Promise<void> {
    const target = this.target(node);
    const dir = target ? (target.directory ? target.uri : vscode.Uri.joinPath(target.uri, '..')) : vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!dir) {
      return;
    }
    const name = await vscode.window.showInputBox({ title: directory ? t('New Directory') : t('New File'), prompt: directory ? t('Name (a/b/c creates nested directories)') : t('Name (with extension; a/b.ts creates directories)'), validateInput: validateFileName });
    if (!name) {
      return;
    }
    const uri = vscode.Uri.joinPath(dir, name);
    if (directory) {
      await vscode.workspace.fs.createDirectory(uri);
    } else {
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, { ignoreIfExists: true });
      await vscode.workspace.applyEdit(edit);
      await vscode.window.showTextDocument(uri);
    }
    this.refresh();
  }

  private async rename(node?: Node): Promise<void> {
    const target = this.target(node);
    if (!target) {
      return;
    }
    const old = path.posix.basename(target.uri.path);
    const dot = target.directory ? -1 : old.lastIndexOf('.');
    const name = await vscode.window.showInputBox({ title: t('Rename {0}', target.directory ? 'Directory' : 'File'), value: old, valueSelection: [0, dot > 0 ? dot : old.length], validateInput: validateFileName });
    if (!name || name === old) {
      return;
    }
    // A workspace edit lets language servers update imports and references, like IntelliJ's refactoring.
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(target.uri, vscode.Uri.joinPath(target.uri, '..', name));
    await vscode.workspace.applyEdit(edit);
    this.refresh();
  }

  private selected(node?: Node, nodes?: Node[]): Extract<Node, { type: 'fs' }>[] {
    const list = nodes && nodes.length > 0 ? nodes : node ? [node] : [...this.view.selection];
    return list.filter((n): n is Extract<Node, { type: 'fs' }> => n.type === 'fs' && !n.workspaceRoot);
  }

  private async delete(node?: Node, nodes?: Node[]): Promise<void> {
    const targets = this.selected(node, nodes);
    if (targets.length === 0) {
      return;
    }
    const what = targets.length === 1 ? `'${path.posix.basename(targets[0].uri.path)}'` : `${targets.length} items`;
    const answer = await vscode.window.showWarningMessage(t('Delete {0}?', what), { modal: true, detail: t('Items are moved to the trash.') }, 'Delete');
    if (answer !== t('Delete')) {
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    targets.forEach((t) => edit.deleteFile(t.uri, { recursive: true, ignoreIfNotExists: true }));
    await vscode.workspace.applyEdit(edit);
    this.refresh();
  }

  private async copyPaths(node: Node | undefined, nodes: Node[] | undefined, relative: boolean): Promise<void> {
    const targets = this.selected(node, nodes);
    const text = targets.map((t) => (relative ? vscode.workspace.asRelativePath(t.uri, false) : t.uri.fsPath)).join('\n');
    if (text) {
      await vscode.env.clipboard.writeText(text);
    }
  }

  // --- Drag and drop -------------------------------------------------------------------------------

  handleDrag(source: readonly Node[], data: vscode.DataTransfer): void {
    const uris = source.filter((n): n is Extract<Node, { type: 'fs' }> => n.type === 'fs').map((n) => n.uri.toString());
    data.set(TREE_MIME, new vscode.DataTransferItem(source));
    data.set('text/uri-list', new vscode.DataTransferItem(uris.join('\r\n')));
  }

  async handleDrop(target: Node | undefined, data: vscode.DataTransfer): Promise<void> {
    const dest = target?.type === 'fs' ? (target.directory ? target.uri : vscode.Uri.joinPath(target.uri, '..')) : undefined;
    const dragged = data.get(TREE_MIME)?.value as Node[] | undefined;
    if (!dest || !dragged) {
      return;
    }
    const moves = dragged.filter((n): n is Extract<Node, { type: 'fs' }> => n.type === 'fs' && !n.workspaceRoot && !dest.path.startsWith(`${n.uri.path}/`) && vscode.Uri.joinPath(n.uri, '..').toString() !== dest.toString());
    if (moves.length === 0) {
      return;
    }
    const names = moves.map((m) => path.posix.basename(m.uri.path)).join(', ');
    const answer = await vscode.window.showInformationMessage(t('Move {0} to \'{1}\'?', names, vscode.workspace.asRelativePath(dest, false)), { modal: true, detail: t('References are updated when the language supports it.') }, 'Refactor');
    if (answer !== t('Refactor')) {
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    moves.forEach((m) => edit.renameFile(m.uri, vscode.Uri.joinPath(dest, path.posix.basename(m.uri.path))));
    await vscode.workspace.applyEdit(edit);
    this.refresh();
  }

  dispose(): void {
    clearTimeout(this.refreshTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}
