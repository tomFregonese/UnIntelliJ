import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { UnIntelliJApi } from '../../src/extension';

const EXTENSION_ID = 'unintellij.unintellij';
const labels = (items: vscode.QuickPickItem[]) => items.filter((i) => i.kind !== vscode.QuickPickItemKind.Separator).map((i) => i.label);

async function eventually<T>(produce: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 15000): Promise<T> {
  const start = Date.now();
  let value = await produce();
  while (!accept(value) && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    value = await produce();
  }
  return value;
}

suite('Search Everywhere', () => {
  let api: UnIntelliJApi;
  const workspace = () => vscode.workspace.workspaceFolders![0].uri;

  suiteSetup(async () => {
    api = await vscode.extensions.getExtension<UnIntelliJApi>(EXTENSION_ID)!.activate();
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('Files: camel humps and abbreviations', async () => {
    const results = labels(await api.search('files', 'usrsvc'));
    assert.strictEqual(results[0], 'user.service.ts');
  });

  test('Files: directory fragments', async () => {
    assert.deepStrictEqual(labels(await api.search('files', 'app/user/card')), ['user-card.component.ts']);
    assert.deepStrictEqual(labels(await api.search('files', 'node/card')), []);
  });

  test('Files: excludes non-project items by default', async () => {
    assert.ok(!labels(await api.search('files', 'user-service-lib')).includes('user-service-lib.js'));
  });

  test('Files: includes non-project items when configured', async () => {
    const config = vscode.workspace.getConfiguration('unintellij');
    await config.update('searchEverywhere.includeNonProjectItems', true, vscode.ConfigurationTarget.Global);
    try {
      assert.ok(labels(await api.search('files', 'user-service-lib')).includes('user-service-lib.js'));
    } finally {
      await config.update('searchEverywhere.includeNonProjectItems', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  test('Actions: IntelliJ action names with their shortcut', async () => {
    const [first] = await api.search('actions', 'reformat code');
    assert.strictEqual(first.label, 'Reformat Code');
    assert.ok(first.description, 'shortcut should be shown');
  });

  test('Actions: options can be toggled', async () => {
    const results = labels(await api.search('actions', 'soft wraps'));
    assert.match(results[0], /^Soft-Wraps: (ON|OFF)$/);
  });

  test('Text: finds occurrences with their location', async () => {
    const results = await api.search('text', 'findUser(');
    const descriptions = results.map((r) => r.description ?? '');
    assert.ok(descriptions.some((d) => /user\.service\.ts:9$/.test(d)), descriptions.join(', '));
    assert.ok(descriptions.some((d) => /user-card\.component\.ts:7$/.test(d)), descriptions.join(', '));
    assert.ok(!descriptions.some((d) => d.includes('node_modules')));
  });

  test('Classes: workspace symbols from the language server', async () => {
    // The TypeScript server needs an open file to load the project.
    await vscode.window.showTextDocument(vscode.Uri.joinPath(workspace(), 'src/app/user/user.service.ts'));
    const results = await eventually(
      () => api.search('classes', 'UsrSvc'),
      (items) => labels(items).includes('UserService'),
    );
    assert.strictEqual(labels(results)[0], 'UserService');
    assert.ok(!labels(results).includes('findUser'), 'Classes tab must not list methods');
  });

  test('All: recent files first when the query is empty', async () => {
    await vscode.window.showTextDocument(vscode.Uri.joinPath(workspace(), 'src/app/user/user-card.component.ts'));
    await vscode.window.showTextDocument(vscode.Uri.joinPath(workspace(), 'src/app/app.component.html'));
    const results = await eventually(
      () => api.search('all', ''),
      (items) => labels(items).includes('user-card.component.ts'),
      3000,
    );
    // The current file is excluded; the previous one comes first.
    assert.strictEqual(labels(results)[0], 'user-card.component.ts');
  });

  test('All: groups results by kind', async () => {
    const results = await api.search('all', 'user');
    const separators = results.filter((r) => r.kind === vscode.QuickPickItemKind.Separator).map((r) => r.label);
    // Files already listed under Recent Files are not repeated, as in IntelliJ.
    assert.ok(separators.includes('Recent Files') && separators.includes('Classes') && separators.includes('Actions'), separators.join(', '));
  });
});
