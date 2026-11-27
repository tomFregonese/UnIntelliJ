import * as assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import * as vscode from 'vscode';
import type { UnIntelliJApi } from '../../src/extension';

const EXTENSION_ID = 'TomFregonese.UnIntelliJ';

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

  test('reassigned shortcuts are written to the user keybindings.json and removed on reset', async () => {
    const api = await vscode.extensions.getExtension<UnIntelliJApi>(EXTENSION_ID)!.activate();
    const config = vscode.workspace.getConfiguration('unintellij');
    const read = () => (existsSync(api.keymap.file) ? readFileSync(api.keymap.file, 'utf8') : '');
    await config.update('keymap.customShortcuts', { ReformatCode: 'ctrl+shift+f9' }, vscode.ConfigurationTarget.Global);
    await api.keymap.sync();
    assert.match(read(), /"key":"ctrl\+shift\+f9","command":"editor\.action\.formatDocument"/);
    await config.update('keymap.customShortcuts', undefined, vscode.ConfigurationTarget.Global);
    await api.keymap.sync();
    assert.ok(!read().includes('ctrl+shift+f9'), read());
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

  test('Next/Previous Method move between methods', async () => {
    // A real file: untitled documents reuse URIs and the TypeScript server may answer for a previous one.
    const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'src/app/user/user.service.ts');
    const editor = await vscode.window.showTextDocument(uri);
    for (let i = 0; i < 100; i++) {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri);
      if (symbols?.some((s) => s.name === 'UserService' && s.children.length > 0)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    await vscode.commands.executeCommand('unintellij.nextMethod');
    assert.strictEqual(editor.selection.active.line, 8, 'findUser');
    await vscode.commands.executeCommand('unintellij.nextMethod');
    assert.strictEqual(editor.selection.active.line, 12, 'saveUser');
    await vscode.commands.executeCommand('unintellij.previousMethod');
    assert.strictEqual(editor.selection.active.line, 8, 'findUser again');
  });
});
