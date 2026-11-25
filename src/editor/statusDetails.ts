import * as path from 'node:path';
import * as vscode from 'vscode';

/** Innermost symbols containing `position`, outermost first. */
function symbolPath(symbols: readonly vscode.DocumentSymbol[], position: vscode.Position): vscode.DocumentSymbol[] {
  for (const symbol of symbols) {
    if (symbol.range.contains(position)) {
      return [symbol, ...symbolPath(symbol.children, position)];
    }
  }
  return [];
}

/**
 * IntelliJ New UI status bar details:
 * - Navigation bar at the bottom left: project › folders › file › class › method, following the caret.
 * - Read-only lock next to the file details at the bottom right.
 * - Inspection widget state (✓ / warning / error) for the editor title button.
 */
export class StatusDetails implements vscode.Disposable {
  private readonly navigation: vscode.StatusBarItem;
  private readonly readOnly: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private symbolTimer: NodeJS.Timeout | undefined;
  private symbols: { uri: string; version: number; tree: vscode.DocumentSymbol[] } | undefined;
  /** Files made read-only for this session with the lock (VS Code has no API to read that state). */
  private readonly lockedInSession = new Set<string>();

  constructor() {
    // Leftmost item, like IntelliJ's navigation bar in the status bar.
    this.navigation = vscode.window.createStatusBarItem('unintellij.navigationBar', vscode.StatusBarAlignment.Left, 1000);
    this.navigation.name = 'Navigation Bar';
    this.navigation.command = 'unintellij.project.selectOpenedFile';
    this.navigation.tooltip = 'Select in Project View';
    this.readOnly = vscode.window.createStatusBarItem('unintellij.readOnly', vscode.StatusBarAlignment.Right, -1000);
    this.readOnly.name = 'Read-Only';
    this.readOnly.command = 'unintellij.toggleReadOnly';
    this.disposables.push(
      this.navigation,
      this.readOnly,
      vscode.window.onDidChangeActiveTextEditor(() => this.update()),
      vscode.window.onDidChangeTextEditorSelection((e) => e.textEditor === vscode.window.activeTextEditor && this.scheduleSymbols()),
      vscode.workspace.onDidChangeTextDocument((e) => e.document === vscode.window.activeTextEditor?.document && this.scheduleSymbols()),
      vscode.languages.onDidChangeDiagnostics(() => this.updateInspection()),
      vscode.commands.registerCommand('unintellij.toggleReadOnly', async () => {
        const key = vscode.window.activeTextEditor?.document.uri.toString();
        if (!key) {
          return;
        }
        await vscode.commands.executeCommand('workbench.action.files.toggleActiveEditorReadonlyInSession');
        if (!this.lockedInSession.delete(key)) {
          this.lockedInSession.add(key);
        }
        this.updateReadOnly();
      }),
      ...['ok', 'warning', 'error'].map((state) => vscode.commands.registerCommand(`unintellij.inspection.${state}`, () => vscode.commands.executeCommand('workbench.actions.view.problems'))),
    );
    this.update();
  }

  private update(): void {
    void this.updateNavigation();
    this.updateInspection();
    this.updateReadOnly();
  }

  private scheduleSymbols(): void {
    clearTimeout(this.symbolTimer);
    this.symbolTimer = setTimeout(() => void this.updateNavigation(), 200);
  }

  private async updateNavigation(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const uri = editor?.document.uri;
    if (!editor || !uri || uri.scheme === 'output') {
      this.navigation.hide();
      return;
    }
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const relative = folder ? path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep) : [path.basename(uri.fsPath)];
    const parts = folder ? [folder.name, ...relative] : relative;
    const document = editor.document;
    if (this.symbols?.uri !== uri.toString() || this.symbols.version !== document.version) {
      const tree = (await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>('vscode.executeDocumentSymbolProvider', uri).then(undefined, () => undefined)) ?? [];
      this.symbols = { uri: uri.toString(), version: document.version, tree: Array.isArray(tree) && tree.length > 0 && 'children' in tree[0] ? tree : [] };
    }
    if (vscode.window.activeTextEditor !== editor) {
      return;
    }
    const symbols = symbolPath(this.symbols.tree, editor.selection.active).map((s) => s.name);
    // Long paths: keep the project, the last folders, the file and the symbols, like IntelliJ.
    const shown = parts.length > 6 ? [parts[0], '…', ...parts.slice(-4)] : parts;
    this.navigation.text = [...shown, ...symbols].join(' › ');
    this.navigation.show();
  }

  private updateInspection(): void {
    const uri = vscode.window.activeTextEditor?.document.uri;
    const diagnostics = uri ? vscode.languages.getDiagnostics(uri) : [];
    const state = !uri
      ? undefined
      : diagnostics.some((d) => d.severity === vscode.DiagnosticSeverity.Error)
        ? 'error'
        : diagnostics.some((d) => d.severity === vscode.DiagnosticSeverity.Warning)
          ? 'warning'
          : 'ok';
    void vscode.commands.executeCommand('setContext', 'unintellij.inspection', state);
  }

  private updateReadOnly(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.readOnly.hide();
      return;
    }
    const uri = editor.document.uri;
    const readonly = vscode.workspace.fs.isWritableFileSystem(uri.scheme) === false || this.lockedInSession.has(uri.toString());
    this.readOnly.text = readonly ? '$(lock)' : '$(unlock)';
    this.readOnly.tooltip = readonly ? 'File is read-only' : 'Make file read-only';
    this.readOnly.show();
  }

  dispose(): void {
    clearTimeout(this.symbolTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}
