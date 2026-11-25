import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { UnIntelliJApi } from '../../src/extension';

const EXTENSION_ID = 'unintellij.unintellij';

async function eventually(description: string, check: () => boolean | Promise<boolean>, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) {
      assert.fail(`Timed out waiting for: ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

suite('Version control', function () {
  this.timeout(60000);
  let api: UnIntelliJApi;
  // A throwaway repository: tests must never touch the UnIntelliJ repository itself.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unintellij-git-')));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const file = (name: string) => join(root, name);
  const state = () => api.vcs.commitState();
  const names = (files: { name: string }[]) => files.map((f) => f.name).sort();

  suiteSetup(async () => {
    git('init', '-b', 'main');
    git('config', 'user.name', 'UnIntelliJ Tests');
    git('config', 'user.email', 'tests@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(file('a.txt'), 'a\n');
    writeFileSync(file('b.txt'), 'b\n');
    git('add', '.');
    git('commit', '-m', 'Initial commit');

    api = await vscode.extensions.getExtension<UnIntelliJApi>(EXTENSION_ID)!.activate();
    await api.vcs.service.ready;
    const gitApi = api.vcs.service.gitApi;
    assert.ok(gitApi?.openRepository, 'Git extension API should be available');
    await gitApi.openRepository(vscode.Uri.file(root));
    await vscode.window.showTextDocument(vscode.Uri.file(file('a.txt')));
    await eventually('temporary repository active', () => api.vcs.service.repository?.rootUri.fsPath === root);
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  setup(() => {
    // Guard against ever committing into a real repository.
    assert.strictEqual(api.vcs.service.repository?.rootUri.fsPath, root);
  });

  test('lists changes in the active changelist and unversioned files apart', async () => {
    writeFileSync(file('a.txt'), 'a changed\n');
    writeFileSync(file('b.txt'), 'b changed\n');
    writeFileSync(file('c.txt'), 'new\n');
    await api.vcs.service.repository!.status();
    await eventually('changes detected', () => state().lists[0]?.files.length === 2 && state().unversioned.length === 1);
    assert.deepStrictEqual(names(state().lists[0].files), ['a.txt', 'b.txt']);
    assert.strictEqual(state().lists[0].active, true);
    assert.deepStrictEqual(names(state().unversioned), ['c.txt']);
    assert.strictEqual(state().branch, 'main');
  });

  test('commits only the checked files, ignoring the staging area', async () => {
    git('add', 'b.txt'); // staged but not checked: must not be committed
    await api.vcs.service.repository!.status();
    await api.vcs.service.commit([file('a.txt'), file('c.txt')], 'Commit a and c', false);
    const committed = git('show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort();
    assert.deepStrictEqual(committed, ['a.txt', 'c.txt']);
    await api.vcs.service.repository!.status();
    await eventually('b still changed', () => state().lists[0]?.files.map((f) => f.name).join() === 'b.txt');
  });

  test('amend keeps the commit and updates its message', async () => {
    const before = git('rev-list', '--count', 'HEAD').trim();
    await api.vcs.service.commit([], 'Commit a and c (amended)', true);
    assert.strictEqual(git('rev-list', '--count', 'HEAD').trim(), before);
    assert.strictEqual(git('log', '-1', '--format=%s').trim(), 'Commit a and c (amended)');
  });

  test('changelists group files and survive refreshes', async () => {
    await api.vcs.service.newChangelist('Feature', false);
    const feature = api.vcs.service.changelistNames().find((l) => l.name === 'Feature')!;
    await api.vcs.service.moveToChangelist([file('b.txt')], feature.id);
    await api.vcs.service.repository!.status();
    const lists = state().lists;
    assert.deepStrictEqual(lists.find((l) => l.name === 'Feature')?.files.map((f) => f.name), ['b.txt']);
    assert.deepStrictEqual(lists.find((l) => l.name === 'Changes')?.files, []);
  });

  test('rollback restores the file', async () => {
    await api.vcs.service.rollback([file('b.txt')]);
    assert.strictEqual(readFileSync(file('b.txt'), 'utf8'), 'b\n');
    await api.vcs.service.repository!.status();
    await eventually('no more changes', () => state().lists.every((l) => l.files.length === 0));
  });

  test('git operations run in the repository and refresh its state', async () => {
    await api.vcs.service.git(['checkout', '-b', 'feature/login']);
    await eventually('branch switched', () => api.vcs.service.repository?.state.HEAD?.name === 'feature/login');
    assert.strictEqual(state().branch, 'feature/login');
  });
});
