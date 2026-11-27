import * as assert from 'node:assert';
import { cpSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { WorkbenchPatcher } from '../../src/islandsPlus/patcher';
import { checksum, checksumKey, WORKBENCH_CANDIDATES } from '../../src/islandsPlus/patchLogic';

suite('Islands+ patcher', () => {
  // Work on a copy of this VS Code's real files: never on the running installation.
  const appRoot = mkdtempSync(join(tmpdir(), 'unintellij-islands-'));
  const relative = WORKBENCH_CANDIDATES.find((c) => existsSync(join(vscode.env.appRoot, c)));
  const assets = join(vscode.extensions.getExtension('TomFregonese.UnIntelliJ')!.extensionPath, 'media', 'islands-plus');

  suiteSetup(function () {
    if (!relative) {
      this.skip();
    }
    cpSync(join(vscode.env.appRoot, relative!), join(appRoot, relative!));
    cpSync(join(vscode.env.appRoot, 'product.json'), join(appRoot, 'product.json'));
  });

  const html = () => readFileSync(join(appRoot, relative!), 'utf8');
  const product = () => JSON.parse(readFileSync(join(appRoot, 'product.json'), 'utf8')) as { checksums?: Record<string, string> };

  test('applies with a valid checksum and reverts to the exact original', async () => {
    const originalHtml = html();
    const originalChecksum = product().checksums?.[checksumKey(relative!)];
    const patcher = new WorkbenchPatcher(appRoot, assets);
    assert.strictEqual(await patcher.status(), 'clean');

    await patcher.apply();
    assert.strictEqual(await patcher.status(), 'patched');
    assert.strictEqual(readFileSync(join(appRoot, `${relative!}.unintellij-backup`), 'utf8'), originalHtml, 'backup of the original');
    assert.match(html(), /unintellij-islands\.js/);
    assert.ok(existsSync(join(appRoot, relative!, '..', 'unintellij-islands.css')));
    if (originalChecksum) {
      // VS Code reports a corrupt installation when this does not match.
      assert.strictEqual(product().checksums![checksumKey(relative!)], checksum(readFileSync(join(appRoot, relative!))));
    }

    await patcher.apply(); // idempotent
    assert.strictEqual(html().match(/UNINTELLIJ-ISLANDS-START/g)?.length, 1);

    await patcher.revert();
    assert.strictEqual(await patcher.status(), 'clean');
    assert.strictEqual(html(), originalHtml);
    assert.strictEqual(product().checksums?.[checksumKey(relative!)], originalChecksum);
    assert.ok(!existsSync(join(appRoot, relative!, '..', 'unintellij-islands.js')));
    assert.ok(!existsSync(join(appRoot, `${relative!}.unintellij-backup`)), 'backups are removed on revert');
    assert.ok(!existsSync(join(appRoot, 'product.json.unintellij-backup')));
  });

  test('the running installation is not patched by tests', async () => {
    assert.ok(!readFileSync(join(vscode.env.appRoot, relative!), 'utf8').includes('UNINTELLIJ-ISLANDS'));
  });
});
