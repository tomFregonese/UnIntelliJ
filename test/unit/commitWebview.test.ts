// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { CommitViewState, FromCommitView } from '../../src/vcs/commitProtocol';

const sent: FromCommitView[] = [];
(globalThis as unknown as { acquireVsCodeApi: unknown }).acquireVsCodeApi = () => ({ postMessage: (m: FromCommitView) => sent.push(m), getState: () => undefined, setState: () => undefined });

const file = (name: string, status: 'M' | 'A' | 'U') => ({ path: `/repo/src/${name}`, name, dir: 'src', status });
const state: CommitViewState = {
  available: true,
  repository: 'repo',
  branch: 'main',
  changelistsEnabled: true,
  lists: [
    { id: 'default', name: 'Changes', active: true, files: [file('a.ts', 'M'), file('b.ts', 'A')] },
    { id: 'feature', name: 'Feature', active: false, files: [file('c.ts', 'M')] },
  ],
  unversioned: [file('new.ts', 'U')],
  commitShortcut: 'Ctrl+K',
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const deliver = async (data: unknown) => {
  window.dispatchEvent(new MessageEvent('message', { data }));
  await flush();
};
const row = (name: string) => [...document.querySelectorAll<HTMLElement>('.row.file')].find((r) => r.querySelector('.name')?.textContent === name)!;
const isChecked = (name: string) => row(name).querySelector<HTMLInputElement>('input')!.checked;
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;

describe('Commit tool window webview', () => {
  beforeAll(async () => {
    document.body.innerHTML = '<div id="app"></div>';
    await import('../../src/webview/commit');
    await deliver({ type: 'state', state });
  });

  it('checks the active changelist by default, not other changelists or unversioned files', () => {
    expect(isChecked('a.ts')).toBe(true);
    expect(isChecked('b.ts')).toBe(true);
    expect(isChecked('c.ts')).toBe(false);
    expect(isChecked('new.ts')).toBe(false);
    expect(row('a.ts').querySelector('.name')!.className).toContain('status-M');
  });

  it('marks the active changelist and shows counts', () => {
    const groups = [...document.querySelectorAll('.row.group')].map((g) => g.textContent);
    expect(groups[0]).toContain('Changes');
    expect(document.querySelector('.row.group.active .group-name')!.textContent).toBe('Changes');
    expect(groups).toContainEqual(expect.stringContaining('Unversioned Files'));
  });

  it('group checkbox toggles all its files', async () => {
    const featureBox = [...document.querySelectorAll<HTMLElement>('.row.group')][1].querySelector<HTMLInputElement>('input')!;
    featureBox.click();
    expect(isChecked('c.ts')).toBe(true);
  });

  it('commits the checked files with the message', async () => {
    const message = document.querySelector<HTMLTextAreaElement>('#message')!;
    message.value = 'Add login';
    message.dispatchEvent(new Event('input'));
    button('Commit').click();
    expect(sent.at(-1)).toEqual({ type: 'commit', paths: ['/repo/src/a.ts', '/repo/src/b.ts', '/repo/src/c.ts'], message: 'Add login', amend: false, push: false });
  });

  it('attaches the selection to rows for the native context menu', async () => {
    row('a.ts').click();
    row('b.ts').dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    const context = JSON.parse(row('a.ts').dataset.vscodeContext!);
    expect(context).toMatchObject({ webviewSection: 'file', paths: ['/repo/src/a.ts', '/repo/src/b.ts'] });
  });

  it('asks for the last message when Amend is checked and clears after commit', async () => {
    const amend = document.querySelector<HTMLInputElement>('.amend input')!;
    amend.click();
    expect(sent.at(-1)).toEqual({ type: 'amend', enabled: true, message: 'Add login' });
    expect(button('Amend Commit')).toBeDefined();
    await deliver({ type: 'committed' });
    expect(document.querySelector<HTMLTextAreaElement>('#message')!.value).toBe('');
    expect(button('Commit')).toBeDefined();
  });

  it('keeps decisions for known files when the state refreshes', async () => {
    await deliver({ type: 'state', state: { ...state, lists: [{ ...state.lists[0], files: [file('a.ts', 'M')] }, state.lists[1]] } });
    expect(isChecked('a.ts')).toBe(true);
    expect(isChecked('c.ts')).toBe(true);
  });
});
