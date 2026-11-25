/**
 * Run/Debug Configurations window (runs in the webview): tree of configurations by type on the
 * left, form on the right, toolbar to add / copy / remove, OK / Cancel / Apply like IntelliJ.
 */
import { newConfigId, NpmConfigData, uniqueName } from '../run/runConfigLogic';
import type { FromRunWebview, RunConfigsModel, ToRunWebview } from '../run/runProtocol';
import { setLanguage, t, type Language } from '../i18n/i18n';

setLanguage((document.body.dataset.lang as Language | undefined) ?? 'en');

declare function acquireVsCodeApi(): { postMessage(message: FromRunWebview): void };
const vscode = acquireVsCodeApi();

let model: RunConfigsModel | undefined;
/** Edited copy of the saved configurations. */
let configs: NpmConfigData[] = [];
let selected: string | undefined;

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

const dirty = (): boolean => JSON.stringify(configs) !== JSON.stringify(model?.configs ?? []);

function current(): NpmConfigData | undefined {
  return configs.find((c) => c.id === selected);
}

function update(patch: Partial<NpmConfigData>): void {
  configs = configs.map((c) => (c.id === selected ? { ...c, ...patch } : c));
  document.querySelector<HTMLButtonElement>('#apply')?.toggleAttribute('disabled', !dirty());
  if ('name' in patch || 'script' in patch) {
    renderTree();
  }
}

function add(copyOf?: NpmConfigData): void {
  const pkg = model?.packages[0];
  const base: NpmConfigData = copyOf ?? { id: '', name: t('Unnamed'), packageJson: pkg?.path ?? '', script: pkg?.scripts[0] ?? '', args: '', env: '' };
  const config = { ...base, id: newConfigId(), name: uniqueName(copyOf ? `${copyOf.name} (copy)` : base.script || base.name, configs.map((c) => c.name)) };
  configs = [...configs, config];
  selected = config.id;
  render();
}

function remove(): void {
  const index = configs.findIndex((c) => c.id === selected);
  if (index < 0) {
    return;
  }
  configs = configs.filter((c) => c.id !== selected);
  selected = configs[Math.min(index, configs.length - 1)]?.id ?? model?.launches[0]?.id;
  render();
}

function save(close: boolean): void {
  vscode.postMessage({ type: 'save', configs, close });
  if (model) {
    model = { ...model, configs };
  }
  document.querySelector<HTMLButtonElement>('#apply')?.toggleAttribute('disabled', true);
}

function treeItem(id: string, label: string, icon: string, child = true): HTMLElement {
  return h(
    'li',
    { className: `${child ? 'child' : ''} ${id === selected ? 'selected' : ''}`, onClick: () => ((selected = id), render()) },
    h('span', { className: `icon icon-${icon}` }),
    ' ',
    label,
  );
}

function renderTree(): void {
  const tree = document.querySelector('.tree');
  if (!tree || !model) {
    return;
  }
  tree.replaceChildren(
    h('li', { className: 'group-label' }, h('span', { className: 'icon icon-chevron-down' }), ' npm'),
    ...configs.map((c) => treeItem(c.id, c.name || t('Unnamed'), 'symbol-package')),
    ...(model.launches.length > 0 ? [h('li', { className: 'group-label' }, h('span', { className: 'icon icon-chevron-down' }), t(' Launch Configurations (launch.json)'))] : []),
    ...model.launches.map((l) => treeItem(l.id, l.name, 'debug-alt')),
  );
}

function row(label: string, control: HTMLElement): HTMLElement {
  return h('div', { className: 'row' }, h('label', {}, label), control);
}

function renderForm(): HTMLElement {
  const config = current();
  const launch = model?.launches.find((l) => l.id === selected);
  if (launch) {
    return h(
      'div',
      { className: 'group' },
      row(t('Name:'), h('input', { type: 'text', value: launch.name, disabled: true })),
      row(t('Type:'), h('input', { type: 'text', value: launch.type, disabled: true })),
      row(t('Folder:'), h('input', { type: 'text', value: launch.folder, disabled: true })),
      h('p', { className: 'muted' }, t('Launch configurations are defined in launch.json.')),
      h('div', { className: 'buttons-inline' }, h('button', { className: 'secondary', onClick: () => vscode.postMessage({ type: 'openLaunch', id: launch.id }) }, t('Open launch.json'))),
    );
  }
  if (!config || !model) {
    return h('p', { className: 'muted' }, t('Click + to add an npm configuration.'));
  }
  const pkg = model.packages.find((p) => p.path === config.packageJson);
  const packageSelect = h(
    'select',
    { onChange: (e: Event) => update({ packageJson: (e.target as HTMLSelectElement).value, script: model?.packages.find((p) => p.path === (e.target as HTMLSelectElement).value)?.scripts[0] ?? "" })  },
    ...model.packages.map((p) => h('option', { value: p.path, selected: p.path === config.packageJson }, p.label)),
  );
  const scriptSelect = h(
    'select',
    { onChange: (e: Event) => update({ script: (e.target as HTMLSelectElement).value }) },
    ...(pkg?.scripts ?? []).map((s) => h('option', { value: s, selected: s === config.script }, s)),
  );
  const input = (key: 'name' | 'args' | 'env', placeholder = '') =>
    h('input', { type: 'text', value: config[key], placeholder, onInput: (e: Event) => update({ [key]: (e.target as HTMLInputElement).value }) });
  return h(
    'div',
    { className: 'group' },
    row(t('Name:'), input('name')),
    row('package.json:', packageSelect),
    row(t('Command:'), h('input', { type: 'text', value: 'run', disabled: true })),
    row(t('Scripts:'), scriptSelect),
    row(t('Arguments:'), input('args', 'e.g. --port 4300')),
    row(t('Environment:'), input('env', 'NAME=value;OTHER=value')),
  );
}

function render(): void {
  const app = document.getElementById('app')!;
  app.className = 'dialog';
  const toolbar = h(
    'div',
    { className: 'toolbar' },
    h('button', { className: 'tool', title: t('Add New Configuration (npm)'), onClick: () => add() }, h('span', { className: 'icon icon-add' })),
    h('button', { className: 'tool', title: t('Remove Configuration'), disabled: !current(), onClick: remove }, h('span', { className: 'icon icon-remove' })),
    h('button', { className: 'tool', title: t('Copy Configuration'), disabled: !current(), onClick: () => add(current()) }, h('span', { className: 'icon icon-copy' })),
  );
  app.replaceChildren(
    h('nav', { className: 'sidebar' }, toolbar, h('ul', { className: 'tree' })),
    h('main', { className: 'content' }, renderForm()),
    h(
      'footer',
      {},
      h('button', { onClick: () => save(true) }, 'OK'),
      h('button', { className: 'secondary', onClick: () => vscode.postMessage({ type: 'cancel' }) }, t('Cancel')),
      h('button', { id: 'apply', className: 'secondary', disabled: !dirty(), onClick: () => save(false) }, t('Apply')),
    ),
  );
  renderTree();
}

window.addEventListener('message', (event: MessageEvent<ToRunWebview>) => {
  if (event.data.type === 'model') {
    model = event.data.model;
    configs = model.configs.map((c) => ({ ...c }));
    selected = model.selected && [...configs.map((c) => c.id), ...model.launches.map((l) => l.id)].includes(model.selected) ? model.selected : (configs[0]?.id ?? model.launches[0]?.id);
    render();
  }
});

vscode.postMessage({ type: 'ready' });
