import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { UnIntelliJApi } from '../../src/extension';
import { fieldKeys } from '../../src/settings/pages';

const EXTENSION_ID = 'TomFregonese.UnIntelliJ';

suite('Settings window', () => {
  let api: UnIntelliJApi;
  const config = () => vscode.workspace.getConfiguration();

  suiteSetup(async () => {
    api = await vscode.extensions.getExtension<UnIntelliJApi>(EXTENSION_ID)!.activate();
  });

  test('applies changes to user settings, removing overrides equal to the default', async () => {
    await api.settings.applyChanges({ 'editor.fontSize': 15, 'unintellij.keymap.layout': 'windows' });
    assert.strictEqual(config().inspect('editor.fontSize')?.globalValue, 15);
    assert.strictEqual(config().inspect('unintellij.keymap.layout')?.globalValue, 'windows');
    await api.settings.applyChanges({ 'unintellij.keymap.layout': 'auto', 'editor.fontSize': config().inspect('editor.fontSize')?.defaultValue });
    assert.strictEqual(config().inspect('unintellij.keymap.layout')?.globalValue, undefined);
    assert.strictEqual(config().inspect('editor.fontSize')?.globalValue, undefined);
  });

  test('IntelliJ-like settings are VS Code defaults, without user values', () => {
    for (const key of ['editor.minimap.enabled', 'editor.rulers', 'workbench.colorTheme', 'editor.fontFamily']) {
      assert.strictEqual(config().inspect(key)?.globalValue, undefined, key);
    }
    assert.strictEqual(config().get('editor.minimap.enabled'), false);
    assert.deepStrictEqual(config().get('editor.rulers'), [120]);
    assert.strictEqual(config().get('workbench.colorTheme'), 'Islands Dark');
    assert.match(config().get<string>('editor.fontFamily') ?? '', /JetBrains Mono/);
  });

  test('every field edits an existing VS Code setting', () => {
    const config = vscode.workspace.getConfiguration();
    const unknown = fieldKeys().filter((key) => config.inspect(key)?.defaultValue === undefined);
    assert.deepStrictEqual(unknown, []);
  });

  test('opens as an editor tab', async () => {
    await vscode.commands.executeCommand('unintellij.showSettings');
    const find = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    for (let i = 0; i < 40 && !find().some((t) => t.label === 'Settings'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const tabs = find();
    const settings = tabs.find((t) => t.input instanceof vscode.TabInputWebview && t.label === 'Settings');
    assert.ok(settings, `tabs: ${tabs.map((t) => t.label).join(', ')}`);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });
});
