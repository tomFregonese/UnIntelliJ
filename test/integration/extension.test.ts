import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { UnIntelliJApi } from '../../src/extension';

const EXTENSION_ID = 'unintellij.unintellij';

suite('Extension', () => {
  test('activates and exposes its API', async () => {
    const extension = vscode.extensions.getExtension<UnIntelliJApi>(EXTENSION_ID);
    assert.ok(extension, `${EXTENSION_ID} should be installed`);
    const api = await extension.activate();
    assert.strictEqual(extension.isActive, true);

    const integrations = api.integrations();
    const git = integrations.find((i) => i.id === 'git');
    assert.ok(git, 'git integration should be reported');
    // Other extensions are disabled in tests: optional integrations must be reported as missing.
    assert.strictEqual(integrations.find((i) => i.id === 'java')?.installed, false);
  });

  test('contributes settings with their defaults', () => {
    const config = vscode.workspace.getConfiguration('unintellij');
    assert.strictEqual(config.get('appearance.theme'), 'islandsDark');
    assert.strictEqual(config.get('keymap.layout'), 'auto');
    assert.strictEqual(config.get('vcs.updateMethod'), 'merge');
    assert.deepStrictEqual(config.get('keymap.disabledActions'), []);
  });
});
