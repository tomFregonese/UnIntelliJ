/**
 * Data Sources window (runs in the webview): PostgreSQL sources on the left, the selected one's
 * connection form on the right, Test Connection, OK / Cancel / Apply like IntelliJ.
 */
import { COLOR_VALUES, DataSource, describeSource, newDataSource, SOURCE_COLORS, SSL_MODES, SourceColor, SslMode, validateDataSource } from '../database/dataSourceLogic';
import type { DataSourcesModel, FromDataSourcesWebview, ToDataSourcesWebview } from '../database/dataSourcesProtocol';
import { setLanguage, t, type Language } from '../i18n/i18n';

setLanguage((document.body.dataset.lang as Language | undefined) ?? 'en');

declare function acquireVsCodeApi(): { postMessage(message: FromDataSourcesWebview): void };
const vscode = acquireVsCodeApi();

let model: DataSourcesModel | undefined;
let sources: DataSource[] = [];
/** Passwords typed in this window: value, or null to forget the stored one. */
let passwords: Record<string, string | null> = {};
let selected: string | undefined;
let testStatus: { ok: boolean; message: string } | 'running' | undefined;

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
    } else if (name === 'checked') {
      (el as HTMLInputElement).checked = Boolean(value);
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

const current = (): DataSource | undefined => sources.find((s) => s.id === selected);
const dirty = (): boolean => JSON.stringify(sources) !== JSON.stringify(model?.sources ?? []) || Object.keys(passwords).length > 0;
const problems = (): string[] => sources.flatMap((s) => validateDataSource(s).map((p) => `${s.name || t('Unnamed')}: ${t(p)}`));

function update(patch: Partial<DataSource>): void {
  sources = sources.map((s) => (s.id === selected ? { ...s, ...patch } : s));
  testStatus = undefined;
  refreshFooter();
  if ('name' in patch || 'color' in patch || 'host' in patch || 'database' in patch || 'user' in patch || 'port' in patch) {
    renderList();
  }
}

function add(): void {
  const id = `ds-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  sources = [...sources, newDataSource(id, sources.map((s) => s.name))];
  selected = id;
  testStatus = undefined;
  render();
}

function duplicate(): void {
  const source = current();
  if (!source) {
    return;
  }
  const id = `ds-${Date.now().toString(36)}`;
  sources = [...sources, { ...source, id, name: `${source.name} (${t('copy')})` }];
  selected = id;
  render();
}

function remove(): void {
  const index = sources.findIndex((s) => s.id === selected);
  if (index < 0) {
    return;
  }
  sources = sources.filter((s) => s.id !== selected);
  delete passwords[selected!];
  selected = sources[Math.min(index, sources.length - 1)]?.id;
  render();
}

function save(close: boolean): void {
  if (problems().length > 0) {
    refreshFooter();
    return;
  }
  vscode.postMessage({ type: 'save', sources, passwords, close });
  if (model) {
    model = { ...model, sources, withPassword: [...new Set([...model.withPassword, ...Object.entries(passwords).filter(([, p]) => p !== null).map(([id]) => id)])].filter((id) => passwords[id] !== null) };
  }
  passwords = {};
  refreshFooter();
}

function renderList(): void {
  const list = document.querySelector('.tree');
  if (!list) {
    return;
  }
  list.replaceChildren(
    h('li', { className: 'group-label' }, h('span', { className: 'icon icon-chevron-down' }), ` ${t('Data Sources')}`),
    ...sources.map((s) =>
      h(
        'li',
        { className: `child${s.id === selected ? ' selected' : ''}`, title: describeSource(s), onClick: () => ((selected = s.id), (testStatus = undefined), render()) },
        s.name || t('Unnamed'),
        s.color !== 'none' && h('span', { className: 'color-dot', style: `background:${COLOR_VALUES[s.color]}` }),
      ),
    ),
  );
}

function row(label: string, control: HTMLElement, help?: string): HTMLElement {
  return h('div', { className: 'row' }, h('label', {}, label), control, help && h('div', { className: 'help' }, help));
}

function input(key: 'name' | 'host' | 'database' | 'user', value: string, placeholder = ''): HTMLInputElement {
  return h('input', { type: 'text', value, placeholder, onInput: (e: Event) => update({ [key]: (e.target as HTMLInputElement).value }) });
}

function renderForm(): HTMLElement {
  const source = current();
  if (!source) {
    return h('p', { className: 'muted' }, t('Click + to add a PostgreSQL data source.'));
  }
  const stored = model?.withPassword.includes(source.id) && passwords[source.id] !== null;
  const password = h('input', {
    type: 'password',
    value: passwords[source.id] ?? '',
    placeholder: stored ? t('<stored securely>') : t('<empty>'),
    onInput: (e: Event) => {
      passwords[source.id] = (e.target as HTMLInputElement).value;
      testStatus = undefined;
      refreshFooter();
    },
  });
  const ssl = h('select', { onChange: (e: Event) => update({ ssl: (e.target as HTMLSelectElement).value as SslMode }) }, ...SSL_MODES.map((m) => h('option', { value: m, selected: m === source.ssl }, m)));
  const color = h('select', { onChange: (e: Event) => update({ color: (e.target as HTMLSelectElement).value as SourceColor }) }, ...SOURCE_COLORS.map((c) => h('option', { value: c, selected: c === source.color }, t(c === 'none' ? 'No color' : c[0].toUpperCase() + c.slice(1)))));
  const status =
    testStatus === 'running'
      ? h('span', { className: 'muted' }, t('Testing…'))
      : testStatus && h('span', { className: testStatus.ok ? 'test-ok' : 'test-error' }, testStatus.ok ? `✓ ${testStatus.message}` : `✗ ${testStatus.message}`);
  return h(
    'div',
    { className: 'group' },
    row(t('Name:'), input('name', source.name)),
    row(t('Host:'), input('host', source.host, 'localhost')),
    row(t('Port:'), h('input', { type: 'number', value: source.port, min: 1, max: 65535, onInput: (e: Event) => update({ port: Number((e.target as HTMLInputElement).value) }) })),
    row(t('Database:'), input('database', source.database, 'postgres'), t('Connection database. Other databases and the schemas shown are chosen in the Database tool window: right-click › Choose Databases… / Choose Schemas…')),
    row(t('User:'), input('user', source.user, 'postgres')),
    row(t('Password:'), password, t('Stored in the operating system keychain, never in settings files.')),
    stored && h('div', { className: 'buttons-inline' }, h('button', { className: 'secondary', onClick: () => ((passwords[source.id] = null), render()) }, t('Forget Password'))),
    row(t('SSL mode:'), ssl),
    row(t('Color:'), color, t('Tints SQL editors attached to this data source, like IntelliJ (red for production).')),
    h(
      'div',
      { className: 'row checkbox-row' },
      h('input', { type: 'checkbox', id: 'readonly', checked: source.readOnly, onChange: (e: Event) => update({ readOnly: (e.target as HTMLInputElement).checked }) }),
      h('label', { for: 'readonly' }, t('Read-only')),
      h('div', { className: 'help' }, t('The server refuses any change made through this data source.')),
    ),
    h(
      'div',
      { className: 'buttons-inline' },
      h(
        'button',
        {
          className: 'secondary',
          onClick: () => {
            testStatus = 'running';
            render();
            // The form edits `sources` in place: test the current values, not those of the last render.
            const edited = current() ?? source;
            vscode.postMessage({ type: 'test', source: edited, password: passwords[edited.id] ?? undefined });
          },
        },
        t('Test Connection'),
      ),
      status,
    ),
  );
}

function refreshFooter(): void {
  document.querySelector<HTMLButtonElement>('#apply')?.toggleAttribute('disabled', !dirty());
  const errors = document.querySelector('.errors');
  if (errors) {
    errors.textContent = problems().join(' · ');
  }
}

function render(): void {
  const app = document.getElementById('app')!;
  app.className = 'dialog';
  const toolbar = h(
    'div',
    { className: 'toolbar' },
    h('button', { className: 'tool', title: t('Add PostgreSQL Data Source'), onClick: add }, h('span', { className: 'icon icon-add' })),
    h('button', { className: 'tool', title: t('Remove'), disabled: !current(), onClick: remove }, h('span', { className: 'icon icon-remove' })),
    h('button', { className: 'tool', title: t('Duplicate'), disabled: !current(), onClick: duplicate }, h('span', { className: 'icon icon-copy' })),
  );
  app.replaceChildren(
    h('nav', { className: 'sidebar' }, toolbar, h('ul', { className: 'tree' })),
    h('main', { className: 'content' }, renderForm()),
    h(
      'footer',
      {},
      h('span', { className: 'errors' }),
      h('button', { onClick: () => save(true) }, t('OK')),
      h('button', { className: 'secondary', onClick: () => vscode.postMessage({ type: 'cancel' }) }, t('Cancel')),
      h('button', { id: 'apply', className: 'secondary', disabled: !dirty(), onClick: () => save(false) }, t('Apply')),
    ),
  );
  renderList();
  refreshFooter();
}

window.addEventListener('message', (event: MessageEvent<ToDataSourcesWebview>) => {
  const data = event.data;
  if (data.type === 'model') {
    model = data.model;
    sources = model.sources.map((s) => ({ ...s }));
    passwords = {};
    if (model.selected === '__new__') {
      add();
      return;
    }
    selected = model.selected && sources.some((s) => s.id === model!.selected) ? model.selected : sources[0]?.id;
    render();
  } else if (data.type === 'testResult') {
    testStatus = { ok: data.ok, message: data.message };
    render();
  }
});

vscode.postMessage({ type: 'ready' });
