import * as vscode from 'vscode';
import { findPackageScripts, PackageScripts, RunConfiguration, scriptCommandLine } from '../run/configurations';

export const NPM_VIEW = 'unintellij.npm';

type NpmNode = { kind: 'package'; pkg: PackageScripts } | { kind: 'script'; pkg: PackageScripts; name: string; command: string };

function toConfiguration(node: Extract<NpmNode, { kind: 'script' }>, multiPackage: boolean): RunConfiguration {
  return {
    kind: 'npm',
    id: `npm:${node.pkg.packageJson.toString()}:${node.name}`,
    name: `${multiPackage ? `${node.pkg.label} › ` : ''}${node.name}`,
    script: node.name,
    command: node.command,
    packageJson: node.pkg.packageJson,
    folder: node.pkg.folder,
    packageManager: node.pkg.packageManager,
  };
}

/** IntelliJ's npm tool window: package.json scripts, run or debug them. */
export class NpmView implements vscode.TreeDataProvider<NpmNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private packages: Promise<PackageScripts[]> | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher('**/package.json');
    const refresh = (): void => this.refresh();
    this.disposables.push(
      this.changed,
      watcher,
      watcher.onDidChange(refresh),
      watcher.onDidCreate(refresh),
      watcher.onDidDelete(refresh),
      vscode.window.createTreeView(NPM_VIEW, { treeDataProvider: this, showCollapseAll: true }),
      vscode.commands.registerCommand('unintellij.npm.refresh', refresh),
      vscode.commands.registerCommand('unintellij.npm.run', (node: NpmNode) => this.start(node, false)),
      vscode.commands.registerCommand('unintellij.npm.debug', (node: NpmNode) => this.start(node, true)),
      vscode.commands.registerCommand('unintellij.npm.open', (node: NpmNode) => this.open(node)),
    );
  }

  refresh(): void {
    this.packages = undefined;
    this.changed.fire();
  }

  private load(): Promise<PackageScripts[]> {
    this.packages ??= findPackageScripts();
    return this.packages;
  }

  getTreeItem(node: NpmNode): vscode.TreeItem {
    if (node.kind === 'package') {
      const item = new vscode.TreeItem(node.pkg.label, vscode.TreeItemCollapsibleState.Expanded);
      item.description = vscode.workspace.asRelativePath(node.pkg.packageJson);
      item.iconPath = new vscode.ThemeIcon('json');
      item.contextValue = 'package';
      item.command = { command: 'unintellij.npm.open', title: 'Open package.json', arguments: [node] };
      return item;
    }
    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
    item.description = node.command;
    item.tooltip = `${scriptCommandLine(node.pkg.packageManager, node.name)}\n${node.command}`;
    item.iconPath = new vscode.ThemeIcon('play');
    item.contextValue = 'script';
    item.command = { command: 'unintellij.npm.open', title: 'Show in package.json', arguments: [node] };
    return item;
  }

  async getChildren(node?: NpmNode): Promise<NpmNode[]> {
    const packages = await this.load();
    if (!node) {
      // A single package.json: list its scripts directly, like IntelliJ.
      return packages.length === 1
        ? packages[0].scripts.map((s) => ({ kind: 'script' as const, pkg: packages[0], name: s.name, command: s.command }))
        : packages.map((pkg) => ({ kind: 'package' as const, pkg }));
    }
    return node.kind === 'package' ? node.pkg.scripts.map((s) => ({ kind: 'script' as const, pkg: node.pkg, name: s.name, command: s.command })) : [];
  }

  private async start(node: NpmNode, debug: boolean): Promise<void> {
    if (node.kind !== 'script') {
      return;
    }
    const multiPackage = (await this.load()).length > 1;
    await vscode.commands.executeCommand('unintellij.runConfiguration', toConfiguration(node, multiPackage), debug);
  }

  private async open(node: NpmNode): Promise<void> {
    const document = await vscode.workspace.openTextDocument(node.pkg.packageJson);
    let selection: vscode.Range | undefined;
    if (node.kind === 'script') {
      const offset = document.getText().indexOf(`"${node.name}"`);
      if (offset >= 0) {
        const start = document.positionAt(offset + 1);
        selection = new vscode.Range(start, start.translate(0, node.name.length));
      }
    }
    await vscode.window.showTextDocument(document, { selection, preview: true });
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
