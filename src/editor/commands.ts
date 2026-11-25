import * as vscode from 'vscode';
import { adjacentMethodLine, toggleCase } from './textLogic';

const METHOD_KINDS = new Set([vscode.SymbolKind.Method, vscode.SymbolKind.Function, vscode.SymbolKind.Constructor]);

async function methodLines(document: vscode.TextDocument): Promise<number[]> {
  const symbols = await vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined>(
    'vscode.executeDocumentSymbolProvider',
    document.uri,
  );
  const lines: number[] = [];
  const visit = (items: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[]): void => {
    for (const symbol of items) {
      if (METHOD_KINDS.has(symbol.kind)) {
        lines.push('range' in symbol ? symbol.selectionRange.start.line : symbol.location.range.start.line);
      }
      if ('children' in symbol) {
        visit(symbol.children);
      }
    }
  };
  visit(symbols ?? []);
  return lines;
}

async function moveToMethod(direction: 'next' | 'previous'): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const target = adjacentMethodLine(await methodLines(editor.document), editor.selection.active.line, direction);
  if (target === undefined) {
    return;
  }
  const position = new vscode.Position(target, editor.document.lineAt(target).firstNonWhitespaceCharacterIndex);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

async function toggleCaseCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const ranges = editor.selections.map((selection) =>
    selection.isEmpty ? editor.document.getWordRangeAtPosition(selection.active) : selection,
  );
  await editor.edit((edit) => {
    for (const range of ranges) {
      if (range) {
        edit.replace(range, toggleCase(editor.document.getText(range)));
      }
    }
  });
}

export function registerEditorCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('unintellij.nextMethod', () => moveToMethod('next')),
    vscode.commands.registerCommand('unintellij.previousMethod', () => moveToMethod('previous')),
    vscode.commands.registerCommand('unintellij.toggleCase', toggleCaseCommand),
  ];
}
