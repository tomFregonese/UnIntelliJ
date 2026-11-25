import * as assert from 'node:assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'unintellij.unintellij';

suite('Keymap and commands', () => {
  suiteSetup(async () => {
    await vscode.extensions.getExtension(EXTENSION_ID)!.activate();
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('registers every contributed command', async () => {
    const registered = new Set(await vscode.commands.getCommands(true));
    const contributed = vscode.extensions.getExtension(EXTENSION_ID)!.packageJSON.contributes.commands as { command: string }[];
    const missing = contributed.map((c) => c.command).filter((c) => !registered.has(c));
    assert.deepStrictEqual(missing, []);
  });

  test('Toggle Case flips the word under the caret', async () => {
    const document = await vscode.workspace.openTextDocument({ language: 'typescript', content: 'const userName = 1;\n' });
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(0, 8, 0, 8);
    await vscode.commands.executeCommand('unintellij.toggleCase');
    assert.strictEqual(document.lineAt(0).text, 'const USERNAME = 1;');
    await vscode.commands.executeCommand('unintellij.toggleCase');
    assert.strictEqual(document.lineAt(0).text, 'const username = 1;');
  });

  test('Next/Previous Method move between methods', async function () {
    // Document symbols for untitled TypeScript come from the built-in TypeScript extension.
    if (!vscode.extensions.getExtension('vscode.typescript-language-features')) {
      this.skip();
    }
    const content = ['class A {', '  first() {', '  }', '', '  second() {', '  }', '}', ''].join('\n');
    const document = await vscode.workspace.openTextDocument({ language: 'typescript', content });
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    await vscode.commands.executeCommand('unintellij.nextMethod');
    assert.strictEqual(editor.selection.active.line, 1);
    await vscode.commands.executeCommand('unintellij.nextMethod');
    assert.strictEqual(editor.selection.active.line, 4);
    await vscode.commands.executeCommand('unintellij.previousMethod');
    assert.strictEqual(editor.selection.active.line, 1);
  });
});
