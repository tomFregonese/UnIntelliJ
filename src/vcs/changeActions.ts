import * as vscode from 'vscode';
import { VcsService } from './vcsService';

/** A changed block as passed by VS Code's quick diff peek (`scm/change/title` menu). */
interface LineChange {
  originalStartLineNumber: number;
  originalEndLineNumber: number;
  modifiedStartLineNumber: number;
  modifiedEndLineNumber: number;
}

/** Lines `start..end` (1-based, inclusive) of `text`; empty when `end` is 0 (pure insertion). */
export function originalLines(text: string, change: LineChange): string {
  if (change.originalEndLineNumber === 0) {
    return '';
  }
  return text
    .split(/\r?\n/)
    .slice(change.originalStartLineNumber - 1, change.originalEndLineNumber)
    .join('\n');
}

/**
 * Actions added to the change popup (VS Code's quick diff peek, opened by clicking a change bar),
 * so that it offers IntelliJ's toolbar: Previous / Next / Rollback come from VS Code, UnIntelliJ adds
 * Show Diff and Copy (the original content of the block).
 */
export function registerChangeActions(vcs: VcsService): vscode.Disposable[] {
  const original = async (uri: vscode.Uri): Promise<string> => {
    const api = vcs.gitApi;
    if (!api) {
      throw new Error('Git is not available');
    }
    const doc = await vscode.workspace.openTextDocument(api.toGitUri(uri, 'HEAD'));
    return doc.getText();
  };
  return [
    vscode.commands.registerCommand('unintellij.change.copyOriginal', async (uri: vscode.Uri, changes: LineChange[], index: number) => {
      const change = changes?.[index];
      if (!uri || !change) {
        return;
      }
      await vscode.env.clipboard.writeText(originalLines(await original(uri), change));
      vscode.window.setStatusBarMessage('Original content copied', 2000);
    }),
    vscode.commands.registerCommand('unintellij.change.showDiff', async (uri: vscode.Uri, changes: LineChange[], index: number) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        return;
      }
      const api = vcs.gitApi;
      const commit = vcs.repository?.state.HEAD?.commit;
      if (api) {
        const base = commit ? `HEAD ${commit.slice(0, 8)}` : 'HEAD';
        await vscode.commands.executeCommand('vscode.diff', api.toGitUri(target, 'HEAD'), target, `${target.path.split('/').pop()} (${base} ↔ Your version)`);
      } else {
        await vscode.commands.executeCommand('git.openChange', target);
      }
      const line = changes?.[index]?.modifiedStartLineNumber;
      const editor = vscode.window.activeTextEditor;
      if (line && editor) {
        const position = new vscode.Position(Math.max(0, line - 1), 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      }
    }),
  ];
}
