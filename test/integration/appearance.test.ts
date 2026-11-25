import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { UnIntelliJApi } from '../../src/extension';

const EXTENSION_ID = 'unintellij.unintellij';
const Global = vscode.ConfigurationTarget.Global;

const unintellij = () => vscode.workspace.getConfiguration('unintellij');
const workbench = () => vscode.workspace.getConfiguration('workbench');
const window = () => vscode.workspace.getConfiguration('window');

async function waitFor(description: string, predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      assert.fail(`Timed out waiting for: ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

suite('Appearance', () => {
  let api: UnIntelliJApi;

  suiteSetup(async () => {
    api = await vscode.extensions.getExtension<UnIntelliJApi>(EXTENSION_ID)!.activate();
    await api.appearanceIdle();
  });

  teardown(async () => {
    await api.appearanceIdle();
  });

  test('contributes both Islands themes', () => {
    const themes = vscode.extensions.getExtension(EXTENSION_ID)!.packageJSON.contributes.themes as { label: string }[];
    assert.deepStrictEqual(
      themes.map((t) => t.label),
      ['Islands Dark', 'Islands Light'],
    );
  });

  test('switches VS Code to Islands Dark on first activation', () => {
    assert.strictEqual(workbench().get('colorTheme'), 'Islands Dark');
    assert.strictEqual(vscode.window.activeColorTheme.kind, vscode.ColorThemeKind.Dark);
  });

  test('switches to the New UI file and product icons on first activation', () => {
    assert.strictEqual(workbench().get('iconTheme'), 'unintellij-file-icons');
    assert.strictEqual(workbench().get('productIconTheme'), 'unintellij-product-icons');
  });

  test('applies the theme chosen in UnIntelliJ settings', async () => {
    await unintellij().update('appearance.theme', 'islandsLight', Global);
    await waitFor('Islands Light applied', () => workbench().get('colorTheme') === 'Islands Light');
    await waitFor('light theme active', () => vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light);
  });

  test('reflects an Islands theme picked through VS Code', async () => {
    await workbench().update('colorTheme', 'Islands Dark', Global);
    await waitFor('setting reflected', () => unintellij().get('appearance.theme') === 'islandsDark');
  });

  test('leaves non-Islands themes picked through VS Code alone', async () => {
    await workbench().update('colorTheme', 'Default Light Modern', Global);
    await api.appearanceIdle();
    assert.strictEqual(unintellij().get('appearance.theme'), 'islandsDark');
    assert.strictEqual(workbench().get('colorTheme'), 'Default Light Modern');
    await workbench().update('colorTheme', 'Islands Dark', Global);
  });

  test('syncs with the OS using the preferred themes', async () => {
    await unintellij().update('appearance.syncWithOs', true, Global);
    await waitFor('OS detection enabled', () => window().get('autoDetectColorScheme') === true);
    await waitFor('preferred dark theme', () => workbench().get('preferredDarkColorTheme') === 'Islands Dark');
    await waitFor('preferred light theme', () => workbench().get('preferredLightColorTheme') === 'Islands Light');

    await unintellij().update('appearance.syncWithOs', false, Global);
    await waitFor('OS detection disabled', () => window().get('autoDetectColorScheme') === false);
  });
});
