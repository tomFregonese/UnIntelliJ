// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { FromGitLog, ToGitLog } from '../../src/vcs/gitLogProtocol';
import { layoutGraph } from '../../src/vcs/logLogic';

const sent: FromGitLog[] = [];
(globalThis as unknown as { acquireVsCodeApi: unknown }).acquireVsCodeApi = () => ({ postMessage: (m: FromGitLog) => sent.push(m) });

const commits = [
  { hash: 'm'.repeat(40), subject: 'Merge feature', author: 'Tom', date: 'Today 10:00', refs: [{ name: 'main', kind: 'head' as const }] },
  { hash: 'f'.repeat(40), subject: 'Feature work', author: 'Ann', date: 'Today 09:00', refs: [{ name: 'origin/feature', kind: 'remote' as const }] },
  { hash: 'b'.repeat(40), subject: 'Base', author: 'Tom', date: 'Yesterday 18:00', refs: [] },
];
const graph = layoutGraph([
  { hash: commits[0].hash, parents: [commits[2].hash, commits[1].hash], author: '', email: '', date: 0, refs: [], subject: '' },
  { hash: commits[1].hash, parents: [commits[2].hash], author: '', email: '', date: 0, refs: [], subject: '' },
  { hash: commits[2].hash, parents: [], author: '', email: '', date: 0, refs: [], subject: '' },
]);
const log: ToGitLog = { type: 'log', commits, graph, branches: ['main'], authors: ['Ann', 'Tom'], filters: { text: '', branch: 'all', author: 'all', since: 'all', path: '' }, hasMore: true };

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const deliver = async (data: unknown) => {
  window.dispatchEvent(new MessageEvent('message', { data }));
  await flush();
};

describe('Git log webview', () => {
  beforeAll(async () => {
    document.body.innerHTML = '<div id="app"></div>';
    await import('../../src/webview/gitLog');
    await deliver(log);
  });

  it('renders commits with graph, refs, author and date', () => {
    const rows = [...document.querySelectorAll<HTMLElement>('.commit')];
    expect(rows.map((r) => r.querySelector('.subject')!.textContent)).toEqual(['Merge feature', 'Feature work', 'Base']);
    expect(rows[0].querySelector('.ref-head')!.textContent).toBe('main');
    expect(rows[1].querySelector('.ref-remote')!.textContent).toBe('origin/feature');
    expect(rows[0].querySelectorAll('svg.graph path').length).toBe(2); // merge: two outgoing lines
    expect(rows[1].querySelector('circle')!.getAttribute('cx')).toBe('18'); // second lane
  });

  it('selects a commit and shows its details', async () => {
    document.querySelector<HTMLElement>('.commit')!.click();
    expect(sent.at(-1)).toEqual({ type: 'select', hash: commits[0].hash });
    await deliver({ type: 'details', details: { hash: commits[0].hash, author: 'Tom', email: 't@x', date: 'Today', message: 'Merge feature\n\nBody', files: [{ status: 'M', path: 'src/a.ts' }] } });
    expect(document.querySelector('.details .message')!.textContent).toContain('Body');
    document.querySelector<HTMLElement>('.details .file')!.click();
    expect(sent.at(-1)).toEqual({ type: 'openDiff', hash: commits[0].hash, file: { status: 'M', path: 'src/a.ts' } });
  });

  it('exposes the commit to the native context menu', () => {
    const context = JSON.parse(document.querySelector<HTMLElement>('.commit')!.dataset.vscodeContext!);
    expect(context).toMatchObject({ webviewSection: 'commit', hash: commits[0].hash });
  });

  it('sends filter changes', () => {
    const user = [...document.querySelectorAll<HTMLSelectElement>('select')].find((s) => s.title === 'User')!;
    user.value = 'Ann';
    user.dispatchEvent(new Event('change'));
    expect(sent.at(-1)).toMatchObject({ type: 'filter', filters: { author: 'Ann' } });
  });

  it('loads more commits on demand', () => {
    document.querySelector<HTMLButtonElement>('button.more')!.click();
    expect(sent.at(-1)).toEqual({ type: 'loadMore' });
  });
});
