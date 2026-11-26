/**
 * Database results panel (runs in the webview): tabs, toolbar (rerun, cancel, copy, CSV), grid,
 * status line, NOTICE output; table data tabs add WHERE / ORDER BY filters and pages.
 */
import type { FromResultsWebview, ResultsModel, ResultTab, ToResultsWebview } from '../database/resultsProtocol';
import { setLanguage, t, type Language } from '../i18n/i18n';

setLanguage((document.body.dataset.lang as Language | undefined) ?? 'en');

declare function acquireVsCodeApi(): { postMessage(message: FromResultsWebview): void };
const vscode = acquireVsCodeApi();

let model: ResultsModel = { tabs: [] };
let active: string | undefined;

type Child = Node | string | false | null | undefined;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name.startsWith('on') && typeof value === 'function') {
      el.addEventListener(name.slice(2).toLowerCase(), value as EventListener);
    } else if (name === 'className') {
      el.className = String(value);
    } else if (name === 'value') {
      (el as HTMLInputElement).value = String(value);
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

const tool = (icon: string, title: string, onClick: () => void, disabled = false): HTMLElement =>
  h('button', { className: 'tool', title, disabled, onClick }, h('span', { className: `icon icon-${icon}` }));

function status(tab: ResultTab): string {
  if (tab.running) {
    return t('Running…');
  }
  if (tab.error) {
    return t('Failed');
  }
  const time = t('{0} ms', tab.durationMs);
  if (tab.columns.length === 0) {
    return tab.rowCount !== null ? t('{0}: {1} rows affected in {2}', tab.command || 'OK', tab.rowCount, time) : t('{0} in {1}', tab.command || 'OK', time);
  }
  const shown = tab.truncated ? t('first {0} rows', tab.rows.length) : t('{0} rows', tab.rows.length);
  return t('{0} retrieved in {1}', shown, time);
}

function renderTableFilters(tab: ResultTab): HTMLElement {
  const table = tab.table!;
  const where = h('input', { type: 'text', className: 'filter', value: table.where, placeholder: 'WHERE' });
  const orderBy = h('input', { type: 'text', className: 'filter', value: table.orderBy, placeholder: 'ORDER BY' });
  const apply = (page: number) => vscode.postMessage({ type: 'table', id: tab.id, where: where.value, orderBy: orderBy.value, page });
  for (const input of [where, orderBy]) {
    input.addEventListener('keydown', (e) => e.key === 'Enter' && apply(0));
  }
  return h(
    'div',
    { className: 'filters' },
    where,
    orderBy,
    tool('arrow-left', t('Previous Page'), () => apply(table.page - 1), table.page === 0),
    h('span', { className: 'muted' }, t('Page {0}', table.page + 1)),
    tool('arrow-right', t('Next Page'), () => apply(table.page + 1), !tab.truncated),
  );
}

function render(): void {
  const app = document.getElementById('app')!;
  if (model.tabs.length === 0) {
    app.replaceChildren(h('div', { className: 'empty' }, t('Run a statement with Ctrl+Enter (⌘↩ on macOS) in a .sql file attached to a data source.')));
    return;
  }
  const tab = model.tabs.find((x) => x.id === active) ?? model.tabs[model.tabs.length - 1];
  active = tab.id;
  const tabs = h(
    'div',
    { className: 'tabs' },
    ...model.tabs.map((x) =>
      h(
        'div',
        { className: `tab${x.id === tab.id ? ' active' : ''}`, title: x.sql, onClick: () => ((active = x.id), vscode.postMessage({ type: 'select', id: x.id }), render()) },
        x.color && h('span', { className: 'dot', style: `background:${x.color}` }),
        h('span', { className: x.error ? 'error-text' : '' }, `${x.source}: ${x.title}`),
        h('span', { className: 'close icon icon-close', title: t('Close Tab'), onClick: (e: Event) => (e.stopPropagation(), vscode.postMessage({ type: 'close', id: x.id })) }),
      ),
    ),
  );
  const toolbar = h(
    'div',
    { className: 'toolbar' },
    tool('refresh', t('Rerun'), () => vscode.postMessage({ type: 'rerun', id: tab.id }), tab.running),
    tool('debug-stop', t('Cancel Running Statements'), () => vscode.postMessage({ type: 'cancel', id: tab.id }), !tab.running),
    tool('copy', t('Copy'), () => vscode.postMessage({ type: 'copy', id: tab.id }), tab.rows.length === 0),
    tool('export', t('Export to CSV…'), () => vscode.postMessage({ type: 'exportCsv', id: tab.id }), tab.rows.length === 0),
    h('span', { className: `status${tab.error ? ' error-text' : ''}` }, status(tab)),
  );
  const body: HTMLElement[] = [];
  if (tab.table) {
    body.push(renderTableFilters(tab));
  }
  if (tab.error) {
    body.push(h('pre', { className: 'error' }, tab.error));
  } else if (tab.columns.length > 0) {
    body.push(
      h(
        'div',
        { className: 'grid-wrap' },
        h(
          'table',
          { className: 'grid' },
          h('thead', {}, h('tr', {}, h('th', { className: 'num' }), ...tab.columns.map((c) => h('th', {}, c)))),
          h('tbody', {}, ...tab.rows.map((r, i) => h('tr', {}, h('td', { className: 'num' }, String(i + 1 + (tab.table ? tab.table.page * tab.table.pageSize : 0))), ...r.map((v) => h('td', { className: v === 'null' ? 'null' : '' }, v))))),
        ),
      ),
    );
  }
  if (tab.notices.length > 0) {
    body.push(h('pre', { className: 'notices' }, tab.notices.join('\n')));
  }
  app.replaceChildren(...(model.single ? [] : [tabs]), toolbar, ...body);
}

window.addEventListener('message', (event: MessageEvent<ToResultsWebview>) => {
  if (event.data.type === 'model') {
    model = event.data.model;
    active = model.active ?? active;
    render();
  }
});

vscode.postMessage({ type: 'ready' });
render();
