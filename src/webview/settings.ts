/**
 * Settings window UI (runs in the webview, browser environment). Renders the declarative pages
 * from the extension, keeps edits pending until OK/Apply, like IntelliJ's Settings dialog.
 */
import { formatKey, keyFromEvent } from '../keymap/keymap';
import type { Field, Page } from '../settings/pages';
import type { FromWebview, KeymapRow, SettingsModel, ToWebview } from '../settings/protocol';
import { setLanguage, t, type Language } from '../i18n/i18n';

setLanguage((document.body.dataset.lang as Language | undefined) ?? 'en');

declare function acquireVsCodeApi(): { postMessage(message: FromWebview): void };
const vscode = acquireVsCodeApi();

let model: SettingsModel | undefined;
let currentPage = 'appearance';
let pending: Record<string, unknown> = {};
let search = '';
let keymapSearch = '';
/** Action whose new shortcut is being recorded. */
let recording: string | undefined;

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

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const value = (key: string): unknown => (key in pending ? pending[key] : model?.values[key]);

function setValue(key: string, next: unknown): void {
  if (same(next, model?.values[key])) {
    delete pending[key];
  } else {
    pending[key] = next;
  }
  updateDirtyState();
}

function updateDirtyState(): void {
  const dirty = Object.keys(pending).length > 0;
  document.querySelector<HTMLButtonElement>('#apply')?.toggleAttribute('disabled', !dirty);
  document.querySelectorAll<HTMLElement>('[data-key]').forEach((row) => row.classList.toggle('modified', row.dataset.key! in pending));
}

// --- Search -------------------------------------------------------------------------------------

function matches(text: string | undefined): boolean {
  return search === '' || (text ?? '').toLowerCase().includes(search.toLowerCase());
}

function pageMatches(page: Page): boolean {
  return matches(page.title) || matches(t(page.title)) || matches(page.keywords) || (page.fields ?? []).some((f) => matches(f.label) || matches(f.key));
}

function visiblePages(): Page[] {
  const pages = model!.pages;
  const visible = new Set(pages.filter(pageMatches).map((p) => p.id));
  // Keep parents of matching pages, and children of matching groups.
  for (const p of pages) {
    if (p.parent && visible.has(p.id)) {
      visible.add(p.parent);
    }
  }
  for (const p of pages) {
    if (p.parent && search !== '' && matches(pages.find((q) => q.id === p.parent)?.title)) {
      visible.add(p.id);
    }
  }
  return pages.filter((p) => visible.has(p.id));
}

// --- Fields -------------------------------------------------------------------------------------

function renderField(field: Field): HTMLElement {
  const id = `field-${field.key}`;
  const current = value(field.key);
  let control: HTMLElement;
  switch (field.type) {
    case 'checkbox':
      control = h('input', { type: 'checkbox', id, checked: current === true, onChange: (e: Event) => setValue(field.key, (e.target as HTMLInputElement).checked) });
      return h(
        'div',
        { className: `row checkbox-row${matches(field.label) && search ? ' found' : ''}`, 'data-key': field.key },
        control,
        h('label', { for: id }, t(field.label)),
        field.help && h('div', { className: 'help' }, t(field.help)),
      );
    case 'select': {
      const select = h('select', { id, onChange: (e: Event) => setValue(field.key, field.options[(e.target as HTMLSelectElement).selectedIndex].value) });
      for (const option of field.options) {
        select.append(h('option', { selected: same(option.value, current) }, t(option.label)));
      }
      if (!field.options.some((o) => same(o.value, current))) {
        select.prepend(h('option', { selected: true, disabled: true }, current === undefined ? '' : String(current)));
      }
      control = select;
      break;
    }
    case 'number':
      control = h('input', {
        type: 'number',
        id,
        value: current === undefined ? '' : String(current),
        min: field.min,
        max: field.max,
        step: field.step,
        onInput: (e: Event) => {
          const raw = (e.target as HTMLInputElement).value;
          const parsed = Number(raw);
          if (raw !== '' && Number.isFinite(parsed)) {
            setValue(field.key, parsed);
          }
        },
      });
      break;
    case 'text':
      control = h('input', { type: 'text', id, value: (current as string) ?? '', placeholder: field.placeholder, onInput: (e: Event) => setValue(field.key, (e.target as HTMLInputElement).value) });
      break;
    case 'list':
      control = h(
        'textarea',
        {
          id,
          rows: 5,
          onInput: (e: Event) =>
            setValue(
              field.key,
              (e.target as HTMLTextAreaElement).value
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean),
            ),
        },
        ((current as string[]) ?? []).join('\n'),
      );
      break;
  }
  return h(
    'div',
    { className: `row${matches(field.label) && search ? ' found' : ''}`, 'data-key': field.key },
    h('label', { for: id }, `${t(field.label)}:`),
    control,
    field.help && h('div', { className: 'help' }, t(field.help)),
  );
}

// --- Custom pages -------------------------------------------------------------------------------

function keymapOs(): 'windows' | 'macos' {
  const layout = value('unintellij.keymap.layout');
  return layout === 'windows' || layout === 'macos' ? layout : model!.autoKeymapOs;
}

function renderKeymap(): HTMLElement {
  const os = keymapOs();
  const disabled = new Set((value('unintellij.keymap.disabledActions') as string[]) ?? []);
  const custom = (): Record<string, string> => ({ ...((value('unintellij.keymap.customShortcuts') as Record<string, string>) ?? {}) });
  const tbody = h('tbody');
  const fill = (): void => {
    tbody.replaceChildren();
    const query = keymapSearch.toLowerCase();
    const customs = custom();
    const shortcutText = (row: KeymapRow): string => (customs[row.id] ? formatKey(customs[row.id], os) : (row[os] ?? ''));
    const rows = model!.keymap.filter((row: KeymapRow) => [row.name, row.id, row.category, shortcutText(row)].some((t) => (t ?? '').toLowerCase().includes(query)));
    for (const row of rows) {
      const toggle = h('input', {
        type: 'checkbox',
        checked: !disabled.has(row.id),
        title: t('Enabled'),
        onChange: (e: Event) => {
          if ((e.target as HTMLInputElement).checked) {
            disabled.delete(row.id);
          } else {
            disabled.add(row.id);
          }
          setValue('unintellij.keymap.disabledActions', [...disabled].sort());
          fill();
        },
      });
      const isCustom = Boolean(customs[row.id]);
      const shortcut =
        recording === row.id
          ? h('span', { className: 'recording' }, t('Press a shortcut… (Esc: cancel, Backspace: reset)'))
          : h('kbd', { className: isCustom ? 'custom-key' : '', title: isCustom ? t('Default: {0}', row[os] ?? 'none') : '' }, shortcutText(row));
      const edit = h(
        'button',
        {
          className: 'tool edit',
          title: t('Change shortcut'),
          onClick: () => {
            recording = row.id;
            fill();
          },
        },
        '✎',
      );
      tbody.append(
        h(
          'tr',
          { className: disabled.has(row.id) ? 'disabled' : '', 'data-action': row.id },
          h('td', {}, toggle),
          h('td', {}, t(row.name)),
          h('td', {}, shortcut, ' ', edit),
          h('td', { className: 'muted' }, row.category),
          h('td', { className: 'muted mono' }, row.id),
        ),
      );
    }
  };
  recordShortcut = (event: KeyboardEvent): void => {
    if (!recording) {
      return;
    }
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
    const customs = custom();
    if (plain && event.code === 'Escape') {
      recording = undefined;
    } else if (plain && event.code === 'Backspace') {
      delete customs[recording];
      setValue('unintellij.keymap.customShortcuts', customs);
      recording = undefined;
    } else {
      const key = keyFromEvent(event, model!.platform);
      if (!key) {
        return; // modifier only: wait for the full combination
      }
      customs[recording] = key;
      setValue('unintellij.keymap.customShortcuts', customs);
      recording = undefined;
    }
    event.preventDefault();
    event.stopPropagation();
    fill();
  };
  fill();
  return h(
    'div',
    { className: 'custom keymap', 'data-key': 'unintellij.keymap.disabledActions' },
    h('input', {
      type: 'search',
      className: 'filter',
      placeholder: t('Search by action name, ID or shortcut'),
      value: keymapSearch,
      onInput: (e: Event) => {
        keymapSearch = (e.target as HTMLInputElement).value;
        fill();
      },
    }),
    h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, t('Action')), h('th', {}, t('Shortcut')), h('th', {}, t('Group')), h('th', {}, 'ID'))), tbody),
  );
}

let recordShortcut: ((event: KeyboardEvent) => void) | undefined;
window.addEventListener('keydown', (event) => recordShortcut?.(event), true);

function renderPreset(): HTMLElement {
  const { applied, entries } = model!.preset;
  const status = (e: (typeof entries)[number]): HTMLElement =>
    e.userValue === undefined
      ? h('td', { className: 'muted' }, t('Automatic'))
      : h(
          'td',
          {},
          h('span', { className: 'mono' }, t('Your value: {0}', JSON.stringify(e.userValue))),
          ' ',
          h('button', { className: 'link', onClick: () => vscode.postMessage({ type: 'useIntelliJValue', key: e.key }) }, t('Use IntelliJ value')),
        );
  return h(
    'div',
    { className: 'custom preset' },
    h('h3', {}, t('IntelliJ-like VS Code settings')),
    h('p', { className: 'help' }, t('Applied automatically while UnIntelliJ is enabled and removed when it is disabled. Values you set yourself always take priority.')),
    h(
      'table',
      {},
      h('tbody', {}, ...entries.map((e) => h('tr', {}, h('td', { className: 'mono' }, e.key), h('td', { className: 'mono' }, JSON.stringify(e.value)), status(e), h('td', { className: 'muted' }, t(e.reason))))),
    ),
    applied &&
      h(
        'div',
        { className: 'buttons-inline' },
        h('button', { className: 'secondary', onClick: () => vscode.postMessage({ type: 'revertPreset' }) }, t('Restore the values I had before "Apply"')),
      ),
  );
}

function renderPlugins(): HTMLElement {
  return h(
    'div',
    { className: 'custom plugins' },
    h('p', { className: 'help' }, t('UnIntelliJ works without any of these; each one enables more IntelliJ features when installed.')),
    ...model!.integrations.map((i) =>
      h(
        'div',
        { className: 'plugin' },
        h('div', { className: 'plugin-name' }, i.name, h('span', { className: `badge ${i.active ? 'active' : i.installed ? 'installed' : 'missing'}` }, i.active ? t('Active') : i.installed ? t('Installed') : t('Not installed'))),
        h('div', { className: 'muted' }, `${i.extensionId}${i.version ? ` · ${i.version}` : ''}`),
        h('div', {}, i.purpose),
        !i.extensionId.startsWith('vscode.') && h('button', { className: 'secondary', onClick: () => vscode.postMessage({ type: 'showExtension', id: i.extensionId }) }, i.installed ? t('Details') : t('Show in Marketplace')),
      ),
    ),
  );
}

// --- Layout -------------------------------------------------------------------------------------

function render(): void {
  if (!model) {
    return;
  }
  const pages = visiblePages();
  if (!pages.some((p) => p.id === currentPage) && pages.length > 0) {
    currentPage = (pages.find((p) => p.fields || p.custom) ?? pages[0]).id;
  }
  const page = model.pages.find((p) => p.id === currentPage) ?? model.pages[0];

  const tree = h('ul', { className: 'tree' });
  for (const p of pages) {
    tree.append(
      h(
        'li',
        { className: `${p.parent ? 'child' : 'root'}${p.id === page.id ? ' selected' : ''}`, tabindex: 0, onClick: () => ((currentPage = p.id), render()) },
        t(p.title),
      ),
    );
  }

  const searchBox = h('input', {
    type: 'search',
    className: 'search',
    placeholder: t('Search settings'),
    value: search,
    onInput: (e: Event) => {
      search = (e.target as HTMLInputElement).value;
      render();
      const box = document.querySelector<HTMLInputElement>('.search');
      box?.focus();
      box?.setSelectionRange(search.length, search.length);
    },
  });

  const parent = page.parent ? model.pages.find((p) => p.id === page.parent) : undefined;
  const content = h('main', { className: 'content' }, h('header', { className: 'breadcrumb' }, parent ? `${t(parent.title)} › ` : '', h('strong', {}, t(page.title))));
  if (!page.fields && !page.custom) {
    // Group page: list its children, like IntelliJ.
    const children = model.pages.filter((p) => p.parent === page.id);
    content.append(h('div', { className: 'group' }, ...children.map((c) => h('a', { href: '#', onClick: (e: Event) => (e.preventDefault(), (currentPage = c.id), render()) }, t(c.title)))));
  }
  const fields = h('div', { className: 'fields' }, ...(page.fields ?? []).map(renderField));
  content.append(fields);
  if (page.custom === 'keymap') {
    content.append(renderKeymap());
  } else if (page.custom === 'preset') {
    content.append(renderPreset());
  } else if (page.custom === 'plugins') {
    content.append(renderPlugins());
  }

  const footer = h(
    'footer',
    {},
    h('button', { id: 'ok', onClick: () => vscode.postMessage({ type: 'apply', changes: pending, close: true }) }, 'OK'),
    h('button', { className: 'secondary', onClick: () => vscode.postMessage({ type: 'cancel' }) }, t('Cancel')),
    h('button', { id: 'apply', className: 'secondary', disabled: Object.keys(pending).length === 0, onClick: () => vscode.postMessage({ type: 'apply', changes: pending, close: false }) }, t('Apply')),
  );

  const app = document.getElementById('app')!;
  app.className = 'dialog';
  app.replaceChildren(h('aside', { className: 'sidebar' }, searchBox, tree), content, footer);
  updateDirtyState();
}

window.addEventListener('message', (event: MessageEvent<ToWebview>) => {
  const message = event.data;
  if (message.type === 'model') {
    const first = model === undefined;
    model = message.model;
    if (first) {
      currentPage = model.initialPage;
    }
    // Drop pending edits that now match the saved value.
    for (const key of Object.keys(pending)) {
      if (same(pending[key], model.values[key])) {
        delete pending[key];
      }
    }
    render();
  } else if (message.type === 'navigate') {
    currentPage = message.page;
    search = '';
    render();
  } else if (message.type === 'applied') {
    pending = {};
    updateDirtyState();
  }
});

vscode.postMessage({ type: 'ready' });
