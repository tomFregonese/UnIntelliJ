import * as vscode from 'vscode';
import { symbolIcon } from '../search/searchEverywhere';

export const STRUCTURE_VIEW = 'unintellij.structure';

interface StructureNode {
  symbol: vscode.DocumentSymbol;
  parent?: StructureNode;
  children: StructureNode[];
}

const FIELD_KINDS = new Set([vscode.SymbolKind.Field, vscode.SymbolKind.Property, vscode.SymbolKind.Constant, vscode.SymbolKind.EnumMember, vscode.SymbolKind.Variable]);

/** Options of IntelliJ's Structure tool window, persisted globally. */
interface StructureOptions {
  sortAlphabetically: boolean;
  showFields: boolean;
  autoscrollFromSource: boolean;
}

const OPTIONS_KEY = 'structure.options';
const DEFAULT_OPTIONS: StructureOptions = { sortAlphabetically: false, showFields: true, autoscrollFromSource: true };

/** IntelliJ's Structure tool window (Alt+7): symbols of the active file. */
export class StructureView implements vscode.TreeDataProvider<StructureNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<StructureNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private roots: StructureNode[] = [];
  private document: vscode.TextDocument | undefined;
  private options: StructureOptions;
  private readonly view: vscode.TreeView<StructureNode>;
  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private loaded: Promise<void> = Promise.resolve();

  constructor(private readonly state: vscode.Memento) {
    this.options = { ...DEFAULT_OPTIONS, ...state.get<Partial<StructureOptions>>(OPTIONS_KEY) };
    this.view = vscode.window.createTreeView(STRUCTURE_VIEW, { treeDataProvider: this, showCollapseAll: true });
    this.disposables.push(
      this.view,
      this.changed,
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefresh(0)),
      vscode.workspace.onDidChangeTextDocument((e) => e.document === this.document && this.scheduleRefresh(500)),
      vscode.window.onDidChangeTextEditorSelection((e) => e.textEditor.document === this.document && this.autoscroll(e.textEditor)),
      this.view.onDidChangeVisibility((e) => e.visible && this.scheduleRefresh(0)),
      vscode.commands.registerCommand('unintellij.structure.sortAlphabetically', () => this.setOption('sortAlphabetically', true)),
      vscode.commands.registerCommand('unintellij.structure.sortByPosition', () => this.setOption('sortAlphabetically', false)),
      vscode.commands.registerCommand('unintellij.structure.showFields', () => this.setOption('showFields', true)),
      vscode.commands.registerCommand('unintellij.structure.hideFields', () => this.setOption('showFields', false)),
      vscode.commands.registerCommand('unintellij.structure.enableAutoscroll', () => this.setOption('autoscrollFromSource', true)),
      vscode.commands.registerCommand('unintellij.structure.disableAutoscroll', () => this.setOption('autoscrollFromSource', false)),
      vscode.commands.registerCommand('unintellij.structure.reveal', (node: StructureNode) => this.revealInEditor(node)),
    );
    this.updateContext();
    this.scheduleRefresh(0);
  }

  /** Resolves when the tree reflects the active editor (used by tests). */
  async whenLoaded(): Promise<StructureNode[]> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await this.loaded;
    return this.roots;
  }

  getTreeItem(node: StructureNode): vscode.TreeItem {
    const children = this.visibleChildren(node);
    const item = new vscode.TreeItem(node.symbol.name, children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    item.description = node.symbol.detail;
    item.iconPath = symbolIcon(node.symbol.kind);
    item.tooltip = `${vscode.SymbolKind[node.symbol.kind]} ${node.symbol.name}${node.symbol.detail ? ` ${node.symbol.detail}` : ''}`;
    item.command = { command: 'unintellij.structure.reveal', title: 'Navigate', arguments: [node] };
    item.id = idOf(node);
    return item;
  }

  getChildren(node?: StructureNode): StructureNode[] {
    return node ? this.visibleChildren(node) : this.sorted(this.roots.filter((n) => this.isVisible(n)));
  }

  getParent(node: StructureNode): StructureNode | undefined {
    return node.parent;
  }

  private visibleChildren(node: StructureNode): StructureNode[] {
    return this.sorted(node.children.filter((n) => this.isVisible(n)));
  }

  private isVisible(node: StructureNode): boolean {
    return this.options.showFields || !FIELD_KINDS.has(node.symbol.kind) || node.parent === undefined;
  }

  private sorted(nodes: StructureNode[]): StructureNode[] {
    const byPosition = (a: StructureNode, b: StructureNode) => a.symbol.range.start.compareTo(b.symbol.range.start);
    return [...nodes].sort(this.options.sortAlphabetically ? (a, b) => a.symbol.name.localeCompare(b.symbol.name) || byPosition(a, b) : byPosition);
  }

  private async setOption<K extends keyof StructureOptions>(key: K, value: StructureOptions[K]): Promise<void> {
    this.options = { ...this.options, [key]: value };
    await this.state.update(OPTIONS_KEY, this.options);
    this.updateContext();
    this.changed.fire(undefined);
  }

  private updateContext(): void {
    for (const [key, value] of Object.entries(this.options)) {
      void vscode.commands.executeCommand('setContext', `unintellij.structure.${key}`, value);
    }
  }

  private scheduleRefresh(delay: number): void {
    clearTimeout(this.refreshTimer);
    this.loaded = new Promise((resolve) => {
      this.refreshTimer = setTimeout(() => void this.refresh().finally(() => resolve()), delay);
    });
  }

  private async refresh(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      // Keep the last file's structure while focus is in a tool window, like IntelliJ.
      return;
    }
    this.document = editor.document;
    const result = await vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined>(
      'vscode.executeDocumentSymbolProvider',
      editor.document.uri,
    );
    const build = (symbols: readonly vscode.DocumentSymbol[], parent?: StructureNode): StructureNode[] =>
      symbols.map((symbol) => {
        const node: StructureNode = { symbol, parent, children: [] };
        node.children = build(symbol.children, node);
        return node;
      });
    this.roots = build((result ?? []).filter((s): s is vscode.DocumentSymbol => 'children' in s));
    this.view.message = this.roots.length === 0 ? 'No structure available for this file' : undefined;
    this.view.description = editor.document.uri.path.slice(editor.document.uri.path.lastIndexOf('/') + 1);
    this.changed.fire(undefined);
  }

  private autoscroll(editor: vscode.TextEditor): void {
    if (!this.options.autoscrollFromSource || !this.view.visible) {
      return;
    }
    const caret = editor.selection.active;
    let match: StructureNode | undefined;
    let level = this.getChildren();
    while (level.length > 0) {
      const containing = level.find((n) => n.symbol.range.contains(caret));
      if (!containing) {
        break;
      }
      match = containing;
      level = this.visibleChildren(containing);
    }
    if (match) {
      void this.view.reveal(match, { select: true, focus: false, expand: false });
    }
  }

  private async revealInEditor(node: StructureNode): Promise<void> {
    if (!this.document) {
      return;
    }
    const editor = await vscode.window.showTextDocument(this.document, { preserveFocus: true, preview: false });
    const position = node.symbol.selectionRange.start;
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(node.symbol.selectionRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  dispose(): void {
    clearTimeout(this.refreshTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}

function idOf(node: StructureNode): string {
  const path: string[] = [];
  for (let n: StructureNode | undefined = node; n; n = n.parent) {
    path.unshift(`${n.symbol.name}@${n.symbol.range.start.line}:${n.symbol.range.start.character}`);
  }
  return path.join('/');
}
