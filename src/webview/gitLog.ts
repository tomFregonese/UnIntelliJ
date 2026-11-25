/** Git tool window (log) UI: filters, commit graph, details. Runs in the webview. */
import type { CommitDetails, CommitContext, CommitRow, FromGitLog, LogFilters, ToGitLog } from '../vcs/gitLogProtocol';
import type { GraphRow } from '../vcs/logLogic';
import { setLanguage, t, type Language } from '../i18n/i18n';

setLanguage((document.body.dataset.lang as Language | undefined) ?? 'en');

declare function acquireVsCodeApi(): { postMessage(message: FromGitLog): void };
const vscode = acquireVsCodeApi();

const LANE = 12;
const ROW = 22;
const DOT = 3.5;
const COLORS = ['#548AF7', '#5FAD65', '#E5A33B', '#C77DBB', '#2AACB8', '#DB5C5C', '#B3AE60', '#8B8EF0'];
const SVG = 'http://www.w3.org/2000/svg';

let commits: CommitRow[] = [];
let graph: GraphRow[] = [];
let branches: string[] = [];
let authors: string[] = [];
let filters: LogFilters | undefined;
let hasMore = false;
let selected: string | undefined;
let details: CommitDetails | undefined;
let unavailable: string | undefined;
let textTimer: ReturnType<typeof setTimeout> | undefined;

type Child = Node | string | false | null | undefined;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name.startsWith('on') && typeof value === 'function') {
      el.addEventListener(name.slice(2).toLowerCase(), value as EventListener);
    } else if (name === 'className') {
      el.className = String(value);
    } else if (typeof value === 'boolean') {
      if (value) {
        el.setAttribute(name, '');
      }
    } else if (value !== undefined && value !== null) {
      el.setAttribute(name, String(value));
    }
  }
  for (const child of children) {
    if (child !== false && child !== null && child !== undefined) {
      el.append(child);
    }
  }
  return el;
}

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, String(value));
  }
  return el;
}

const x = (lane: number) => lane * LANE + LANE / 2;
const color = (index: number) => COLORS[index % COLORS.length];

function graphCell(row: GraphRow, width: number): SVGElement {
  const cell = svg('svg', { width: width * LANE, height: ROW, class: 'graph' });
  const line = (x1: number, y1: number, x2: number, y2: number, c: number) =>
    cell.append(svg('path', { d: `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`, stroke: color(c), 'stroke-width': 1.6, fill: 'none' }));
  for (const edge of row.incoming) {
    line(x(edge.from), 0, x(edge.to), ROW / 2, edge.color);
  }
  for (const edge of row.outgoing) {
    line(x(edge.from), ROW / 2, x(edge.to), ROW, edge.color);
  }
  cell.append(svg('circle', { cx: x(row.lane), cy: ROW / 2, r: DOT, fill: color(row.color) }));
  return cell;
}

function setFilter(patch: Partial<LogFilters>): void {
  if (!filters) {
    return;
  }
  filters = { ...filters, ...patch };
  vscode.postMessage({ type: 'filter', filters });
}

function select(hash: string): void {
  selected = hash;
  details = undefined;
  vscode.postMessage({ type: 'select', hash });
  render();
}

function dropdown(label: string, value: string, options: [string, string][], onChange: (v: string) => void): HTMLElement {
  const el = h('select', { title: label, onChange: (e: Event) => onChange((e.target as HTMLSelectElement).value) });
  for (const [v, text] of options) {
    el.append(h('option', { value: v, selected: v === value }, `${label}: ${text}`));
  }
  return el;
}

function renderToolbar(): HTMLElement {
  const f = filters!;
  const text = h('input', {
    type: 'search',
    placeholder: t('Text or hash'),
    value: f.text,
    onInput: (e: Event) => {
      clearTimeout(textTimer);
      const value = (e.target as HTMLInputElement).value;
      textTimer = setTimeout(() => setFilter({ text: value }), 300);
    },
  });
  return h(
    'div',
    { className: 'toolbar' },
    text,
    dropdown(t('Branch'), f.branch, [['all', t('All')], ['HEAD', 'HEAD'], ...branches.map((b): [string, string] => [b, b])], (v) => setFilter({ branch: v })),
    dropdown(t('User'), f.author, [['all', t('All')], ...authors.map((a): [string, string] => [a, a])], (v) => setFilter({ author: v })),
    dropdown(t('Date'), f.since, [['all', t('All')], ['1', t('Last 24 hours')], ['7', t('Last 7 days')], ['30', t('Last 30 days')]], (v) => setFilter({ since: v })),
    f.path && h('span', { className: 'path-filter', title: t('Showing history of this path') }, `Path: ${f.path}`, h('button', { className: 'tool', title: t('Clear'), onClick: () => setFilter({ path: '' }) }, h('span', { className: 'icon icon-close' }))),
    h('button', { className: 'tool', title: t('Refresh'), onClick: () => vscode.postMessage({ type: 'refresh' }) }, h('span', { className: 'icon icon-refresh' })),
  );
}

function renderTable(): HTMLElement {
  const width = Math.max(1, ...graph.map((r) => r.width));
  const table = h('div', { className: 'log', tabindex: 0, onKeydown: onKey });
  commits.forEach((commit, index) => {
    const context: CommitContext = { webviewSection: 'commit', hash: commit.hash, preventDefaultContextMenuItems: true };
    const refs = commit.refs.map((r) => h('span', { className: `ref ref-${r.kind}` }, r.name));
    table.append(
      h(
        'div',
        {
          className: `commit${commit.hash === selected ? ' selected' : ''}`,
          'data-hash': commit.hash,
          'data-vscode-context': JSON.stringify(context),
          onClick: () => select(commit.hash),
          onMousedown: (e: MouseEvent) => e.button === 2 && commit.hash !== selected && select(commit.hash),
        },
        h('span', { className: 'subject-cell' }, graph[index] ? graphCell(graph[index], width) : '', ...refs, h('span', { className: 'subject', title: commit.subject }, commit.subject)),
        h('span', { className: 'author' }, commit.author),
        h('span', { className: 'date' }, commit.date),
      ),
    );
  });
  if (commits.length === 0) {
    table.append(h('div', { className: 'empty' }, t('No commits match the filters')));
  }
  if (hasMore) {
    table.append(h('button', { className: 'more secondary', onClick: () => vscode.postMessage({ type: 'loadMore' }) }, t('Load more commits')));
  }
  return table;
}

function renderDetails(): HTMLElement {
  if (!selected) {
    return h('div', { className: 'details empty' }, t('Select a commit to view its changes'));
  }
  if (!details || details.hash !== selected) {
    return h('div', { className: 'details empty' }, t('Loading…'));
  }
  const d = details;
  return h(
    'div',
    { className: 'details' },
    h(
      'div',
      { className: 'files' },
      ...d.files.map((file) =>
        h(
          'div',
          { className: 'file', title: file.oldPath ? `${file.oldPath} → ${file.path}` : file.path, onClick: () => vscode.postMessage({ type: 'openDiff', hash: d.hash, file }) },
          h('span', { className: `name status-${file.status}` }, file.path.split('/').pop()!),
          h('span', { className: 'dir' }, file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''),
        ),
      ),
    ),
    h('div', { className: 'message' }, d.message),
    h('div', { className: 'meta' }, `${d.hash.slice(0, 8)} ${d.author} <${d.email}> on ${d.date}`),
  );
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
    return;
  }
  e.preventDefault();
  const index = commits.findIndex((c) => c.hash === selected);
  const next = commits[Math.max(0, Math.min(commits.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))];
  if (next) {
    select(next.hash);
    document.querySelector(`[data-hash="${next.hash}"]`)?.scrollIntoView({ block: 'nearest' });
  }
}

function render(): void {
  const app = document.getElementById('app')!;
  if (unavailable) {
    app.replaceChildren(h('div', { className: 'empty' }, unavailable));
    return;
  }
  if (!filters) {
    return;
  }
  const scroll = document.querySelector('.log')?.scrollTop ?? 0;
  const focused = document.activeElement?.classList.contains('log');
  const searchFocused = document.activeElement?.getAttribute('type') === 'search';
  app.replaceChildren(renderToolbar(), h('div', { className: 'split' }, renderTable(), renderDetails()));
  const log = document.querySelector<HTMLElement>('.log')!;
  log.scrollTop = scroll;
  if (focused) {
    log.focus();
  } else if (searchFocused) {
    const search = document.querySelector<HTMLInputElement>('input[type=search]')!;
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  }
}

window.addEventListener('message', (event: MessageEvent<ToGitLog>) => {
  const data = event.data;
  if (data.type === 'log') {
    unavailable = undefined;
    ({ commits, graph, branches, authors, filters, hasMore } = data);
    if (selected && !commits.some((c) => c.hash === selected)) {
      selected = undefined;
      details = undefined;
    }
    render();
  } else if (data.type === 'details') {
    details = data.details;
    render();
  } else if (data.type === 'unavailable') {
    unavailable = data.reason;
    render();
  }
});

vscode.postMessage({ type: 'ready' });
