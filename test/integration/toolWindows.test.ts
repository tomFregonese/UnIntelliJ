import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { UnIntelliJApi } from '../../src/extension';

const EXTENSION_ID = 'TomFregonese.UnIntelliJ';

suite('Tool windows and Run', () => {
  const workspace = () => vscode.workspace.workspaceFolders![0].uri;

  suiteSetup(async () => {
    await vscode.extensions.getExtension<UnIntelliJApi>(EXTENSION_ID)!.activate();
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('Alt+7 opens the Outline (the Structure tool window was dropped)', async () => {
    const keybindings = vscode.extensions.getExtension(EXTENSION_ID)!.packageJSON.contributes.keybindings as { key: string; command: string }[];
    assert.ok(keybindings.some((k) => k.key === 'alt+7' && k.command === 'outline.focus'));
  });

  test('runs an npm script as a task', async () => {
    const ended = new Promise<number | undefined>((resolve) => {
      const listener = vscode.tasks.onDidEndTaskProcess((e) => {
        if (e.execution.task.definition.type === 'unintellij-npm' && e.execution.task.definition.script === 'hello') {
          listener.dispose();
          resolve(e.exitCode);
        }
      });
    });
    await vscode.commands.executeCommand('unintellij.runConfiguration', {
      kind: 'npm',
      id: 'npm:test:hello',
      name: 'hello',
      script: 'hello',
      command: '',
      packageJson: vscode.Uri.joinPath(workspace(), 'package.json'),
      folder: vscode.workspace.workspaceFolders![0],
      packageManager: 'npm',
    });
    const exitCode = await Promise.race([ended, new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 30000))]);
    assert.strictEqual(exitCode, 0);
  });
});
