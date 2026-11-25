import * as vscode from 'vscode';
import { KEYMAP } from '../keymap/keymap';
import { shortcutFor } from './actions';
import { fileIconPath } from './fileIcons';
import { NavigationHistory } from './history';
import { openLocation, SearchItem } from './searchEverywhere';
import { symbolIconPath } from './symbolIcons';

/** Tool windows listed in the left column of IntelliJ's Recent Files popup. */
const TOOL_WINDOW_ICONS: Record<string, string> = {
  ActivateProjectToolWindow: 'explorer-view-icon',
  ActivateCommitToolWindow: 'source-control-view-icon',
  ActivateVersionControlToolWindow: 'git-branch',
  ActivateStructureToolWindow: 'outline-view-icon',
  ActivateProblemsViewToolWindow: 'markers-view-icon',
  ActivateTerminalToolWindow: 'terminal',
  ActivateDebugToolWindow: 'run-view-icon',
  ActivateFindToolWindow: 'search-view-icon',
};

function runQuickPick(quickPick: vscode.QuickPick<SearchItem>): void {
  quickPick.matchOnDescription = true;
  quickPick.onDidAccept(() => {
    const item = quickPick.selectedItems[0] ?? quickPick.activeItems[0];
    quickPick.hide();
    void item?.open?.(false);
  });
  quickPick.onDidTriggerItemButton(({ item }) => {
    quickPick.hide();
    void item.open?.(true);
  });
  quickPick.onDidHide(() => quickPick.dispose());
  quickPick.show();
}

const OPEN_TO_SIDE: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('split-horizontal'), tooltip: 'Open to the Side' };

/**
 * IntelliJ's Recent Files (Ctrl+E) and Recent Locations (Ctrl+Shift+E). Invoking the shortcut
 * again while the popup is open toggles "Show edited only".
 */
export class RecentPopups {
  private open: { kind: 'files' | 'locations'; toggle(): void } | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly history: NavigationHistory,
  ) {}

  showRecentFiles(): void {
    if (this.open?.kind === 'files') {
      this.open.toggle();
      return;
    }
    let editedOnly = false;
    const quickPick = vscode.window.createQuickPick<SearchItem>();
    (quickPick as unknown as { sortByLabel: boolean }).sortByLabel = false;
    const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    const render = (): void => {
      quickPick.title = editedOnly ? 'Recently Edited Files' : 'Recent Files';
      quickPick.placeholder = `Type to filter · ${editedOnly ? 'Show all' : 'Show edited only'}: press the shortcut again`;
      const files: SearchItem[] = this.history.files(editedOnly).map((f) => {
        const uri = vscode.Uri.parse(f.uri);
        const relative = vscode.workspace.asRelativePath(uri, multiRoot);
        const slash = relative.lastIndexOf('/');
        const name = relative.slice(slash + 1);
        return {
          label: name,
          description: slash >= 0 ? relative.slice(0, slash) : '',
          iconPath: fileIconPath(this.extensionUri, name),
          buttons: [OPEN_TO_SIDE],
          open: (toSide) => openLocation(uri, toSide),
        };
      });
      // Like IntelliJ, the current file is second so that Enter goes back to the previous one.
      const current = vscode.window.activeTextEditor?.document.uri.toString();
      if (files.length > 1 && this.history.files(editedOnly)[0]?.uri === current) {
        files.push(files.shift()!);
      }
      const toolWindows: SearchItem[] = KEYMAP.filter((a) => a.id in TOOL_WINDOW_ICONS).map((a) => ({
        label: a.name,
        description: shortcutFor(a.command, a.args),
        iconPath: new vscode.ThemeIcon(TOOL_WINDOW_ICONS[a.id]),
        open: () => vscode.commands.executeCommand(a.command, ...(a.args !== undefined ? [a.args] : [])),
      }));
      quickPick.items = [...files, { label: 'Tool Windows', kind: vscode.QuickPickItemKind.Separator }, ...toolWindows];
    };
    this.open = { kind: 'files', toggle: () => ((editedOnly = !editedOnly), render()) };
    quickPick.onDidHide(() => (this.open = undefined));
    render();
    runQuickPick(quickPick);
  }

  showRecentLocations(): void {
    if (this.open?.kind === 'locations') {
      this.open.toggle();
      return;
    }
    let editedOnly = false;
    const quickPick = vscode.window.createQuickPick<SearchItem>();
    (quickPick as unknown as { sortByLabel: boolean }).sortByLabel = false;
    quickPick.matchOnDetail = true;
    const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    const render = (): void => {
      quickPick.title = editedOnly ? 'Recently Changed Locations' : 'Recent Locations';
      quickPick.placeholder = `Type to filter · ${editedOnly ? 'Show all' : 'Show changed only'}: press the shortcut again`;
      quickPick.items = this.history.locations(editedOnly).map((l) => {
        const uri = vscode.Uri.parse(l.uri);
        const relative = vscode.workspace.asRelativePath(uri, multiRoot);
        const name = relative.slice(relative.lastIndexOf('/') + 1);
        return {
          label: `${name}:${l.line + 1}`,
          description: relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : '',
          detail: l.text,
          iconPath: fileIconPath(this.extensionUri, name),
          buttons: [OPEN_TO_SIDE],
          open: (toSide) => openLocation(uri, toSide, new vscode.Position(l.line, l.character)),
        };
      });
    };
    this.open = { kind: 'locations', toggle: () => ((editedOnly = !editedOnly), render()) };
    quickPick.onDidHide(() => (this.open = undefined));
    render();
    runQuickPick(quickPick);
  }
}

interface FlatSymbol {
  symbol: vscode.DocumentSymbol;
  depth: number;
}

function flatten(symbols: readonly vscode.DocumentSymbol[], depth = 0, out: FlatSymbol[] = []): FlatSymbol[] {
  for (const symbol of [...symbols].sort((a, b) => a.range.start.compareTo(b.range.start))) {
    out.push({ symbol, depth });
    flatten(symbol.children, depth + 1, out);
  }
  return out;
}

/** IntelliJ's File Structure popup (Ctrl+F12): the current file's symbols, in source order. */
export async function showFileStructure(extensionUri: vscode.Uri): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const result = await vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined>(
    'vscode.executeDocumentSymbolProvider',
    editor.document.uri,
  );
  const documentSymbols = (result ?? []).filter((s): s is vscode.DocumentSymbol => 'children' in s);
  const flat = flatten(documentSymbols);
  const quickPick = vscode.window.createQuickPick<SearchItem>();
  (quickPick as unknown as { sortByLabel: boolean }).sortByLabel = false;
  quickPick.title = `File Structure · ${editor.document.fileName.split(/[\\/]/).pop()}`;
  quickPick.placeholder = flat.length === 0 ? 'No structure available for this file' : 'Type to filter';
  quickPick.matchOnDescription = true;
  const items: SearchItem[] = flat.map(({ symbol, depth }) => ({
    label: `${' '.repeat(depth)}${symbol.name}`,
    description: symbol.detail,
    iconPath: symbolIconPath(extensionUri, symbol.kind),
    open: async () => {
      const position = symbol.selectionRange.start;
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(symbol.selectionRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      await vscode.window.showTextDocument(editor.document, editor.viewColumn);
    },
  }));
  quickPick.items = items;
  // Preselect the innermost symbol containing the caret, like IntelliJ.
  const caret = editor.selection.active;
  const containing = flat.map((f, i) => ({ ...f, i })).filter((f) => f.symbol.range.contains(caret));
  if (containing.length > 0) {
    quickPick.activeItems = [items[containing[containing.length - 1].i]];
  }
  runQuickPick(quickPick);
}
