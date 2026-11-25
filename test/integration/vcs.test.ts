import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  // A throwaway repository: tests must never touch the UnIntelliJ repository itself. It lives in
  // the (git-ignored) workspace because older VS Code versions only open repositories inside it.
  const root = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, `.tmp-repo-${Date.now()}`).fsPath;
  // Uri.fsPath normalizes the drive letter case on Windows, like the Git extension does.
  const same = (a: string | undefined, b: string) => a !== undefined && vscode.Uri.file(a).fsPath === vscode.Uri.file(b).fsPath;
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const file = (name: string) => join(root, name);
  const state = () => api.vcs.commitState();
  const names = (files: { name: string }[]) => files.map((f) => f.name).sort();

  suiteSetup(async () => {
    mkdirSync(root, { recursive: true });
    git('init', '-b', 'main');
    git('config', 'user.name', 'UnIntelliJ Tests');
    git('config', 'user.email', 'tests@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.autocrlf', 'false'); // Windows runners default to CRLF checkouts
    writeFileSync(file('a.txt'), 'a\n');
    writeFileSync(file('b.txt'), 'b\n');
    git('add', '.');
    git('commit', '-m', 'Initial commit');

    api = await vscode.extensions.getExtension<UnIntelliJApi>(EXTENSION_ID)!.activate();
    await api.vcs.service.ready;
    const gitApi = api.vcs.service.gitApi;
    assert.ok(gitApi?.openRepository, 'Git extension API should be available');
    const opened = await gitApi.openRepository(vscode.Uri.file(root));
    assert.ok(opened, 'the Git extension should open the temporary repository');
    await vscode.window.showTextDocument(vscode.Uri.file(file('a.txt')));
    await eventually('temporary repository active', () => same(api.vcs.service.repository?.rootUri.fsPath, root));
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows: the Git extension may still hold files open; the folder is git-ignored anyway.
    }
  });

  setup(() => {
    // Guard against ever committing into a real repository.
    assert.ok(same(api.vcs.service.repository?.rootUri.fsPath, root), `active repository: ${api.vcs.service.repository?.rootUri.fsPath}`);
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

  test('Git log: commits with graph, path filter and details', async () => {
    const log = await api.vcs.gitLog.load({ text: '', branch: 'all', author: 'all', since: 'all', path: '' }, 50);
    assert.strictEqual(log.type, 'log');
    if (log.type !== 'log') {
      return;
    }
    assert.deepStrictEqual(log.commits.map((c) => c.subject), ['Commit a and c (amended)', 'Initial commit']);
    assert.strictEqual(log.graph.length, 2);
    assert.deepStrictEqual(log.commits[0].refs, [{ name: 'main', kind: 'head' }]);
    assert.deepStrictEqual(log.authors, ['UnIntelliJ Tests']);

    const history = await api.vcs.gitLog.load({ text: '', branch: 'HEAD', author: 'all', since: 'all', path: 'c.txt' }, 50);
    assert.deepStrictEqual(history.type === 'log' && history.commits.map((c) => c.subject), ['Commit a and c (amended)']);

    const details = await api.vcs.gitLog.details(log.commits[0].hash);
    assert.deepStrictEqual(details.files.map((f) => `${f.status} ${f.path}`).sort(), ['A c.txt', 'M a.txt']);
    assert.strictEqual(details.message, 'Commit a and c (amended)');
  });

  test('git operations run in the repository and refresh its state', async () => {
    await api.vcs.service.git(['checkout', '-b', 'feature/login']);
    await eventually('branch switched', () => api.vcs.service.repository?.state.HEAD?.name === 'feature/login');
    assert.strictEqual(state().branch, 'feature/login');
  });
});
