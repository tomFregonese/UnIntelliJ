/**
 * Commit tool window UI (webview). IntelliJ behavior: check the files to commit, active changelist
 * checked by default, unversioned files unchecked, Amend, Commit / Commit and Push.
 */
import type { CommitViewState, FileItem, FromCommitView, RowContext, ToCommitView } from '../vcs/commitProtocol';
import { setLanguage, t, type Language } from '../i18n/i18n';

setLanguage((document.body.dataset.lang as Language | undefined) ?? 'en');

interface Persisted {
  message: string;
  amend: boolean;
  checked: string[];
  known: string[];
  collapsed: string[];
}

declare function acquireVsCodeApi(): { postMessage(message: FromCommitView): void; getState(): Persisted | undefined; setState(state: Persisted): void };
const vscode = acquireVsCodeApi();

const saved = vscode.getState();
let state: CommitViewState | undefined;
let message = saved?.message ?? '';
let amend = saved?.amend ?? false;
let busy = false;
const checked = new Set(saved?.checked ?? []);
/** Paths already seen, so that the default check state only applies to new changes. */
const known = new Set(saved?.known ?? []);
const collapsed = new Set(saved?.collapsed ?? []);
let selection = new Set<string>();
let anchor: string | undefined;

const UNVERSIONED = '__unversioned__';
const STATUS_TITLES: Record<string, string> = { M: t('Modified'), A: t('Added'), D: t('Deleted'), R: t('Renamed'), U: t('Unversioned'), C: t('Merge conflict') };

function persist(): void {
  vscode.setState({ message, amend, checked: [...checked], known: [...known], collapsed: [...collapsed] });
}

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

interface Group {
  id: string;
  name: string;
  active: boolean;
  files: FileItem[];
}

/** IntelliJ's flat list order: by file name, case-insensitive and natural (file2 before file10), then by folder. */
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const byName = (a: FileItem, b: FileItem): number => collator.compare(a.name, b.name) || collator.compare(a.dir, b.dir);

function groups(): Group[] {
  if (!state) {
    return [];
  }
  const lists: Group[] = state.lists.filter((l) => l.files.length > 0 || state!.changelistsEnabled).map((l) => ({ ...l, files: [...l.files].sort(byName) }));
  if (state.unversioned.length > 0) {
    lists.push({ id: UNVERSIONED, name: t('Unversioned Files'), active: false, files: [...state.unversioned].sort(byName) });
  }
  return lists;
}

/** Visible file paths in display order (for keyboard and shift-selection). */
function visibleFiles(): FileItem[] {
  return groups().flatMap((g) => (collapsed.has(g.id) ? [] : g.files));
}

function applyNewState(next: CommitViewState): void {
  state = next;
  const all = new Set<string>();
  for (const group of groups()) {
    for (const file of group.files) {
      all.add(file.path);
      if (!known.has(file.path)) {
        // IntelliJ checks the active changelist's changes and leaves unversioned files unchecked.
        if (group.active || (!next.changelistsEnabled && group.id !== UNVERSIONED)) {
          checked.add(file.path);
        }
        known.add(file.path);
      }
    }
  }
  for (const path of [...known]) {
    if (!all.has(path)) {
      known.delete(path);
      checked.delete(path);
    }
  }
  selection = new Set([...selection].filter((p) => all.has(p)));
  persist();
}

function contextFor(section: RowContext['webviewSection'], path?: string, changelistId?: string): string {
  const paths = path ? (selection.has(path) ? [...selection] : [path]) : undefined;
  const ctx: RowContext = { webviewSection: section, paths, changelistId, preventDefaultContextMenuItems: true };
  return JSON.stringify(ctx);
}

function select(path: string, event: MouseEvent | KeyboardEvent): void {
  const files = visibleFiles().map((f) => f.path);
  if (event.shiftKey && anchor && files.includes(anchor)) {
    const [from, to] = [files.indexOf(anchor), files.indexOf(path)].sort((a, b) => a - b);
    selection = new Set(files.slice(from, to + 1));
  } else if (event.ctrlKey || event.metaKey) {
    if (selection.has(path)) {
      selection.delete(path);
    } else {
      selection.add(path);
    }
    anchor = path;
  } else {
    selection = new Set([path]);
    anchor = path;
  }
  render();
}

function toggle(paths: readonly string[], value?: boolean): void {
  const target = value ?? !paths.every((p) => checked.has(p));
  for (const p of paths) {
    if (target) {
      checked.add(p);
    } else {
      checked.delete(p);
    }
  }
  persist();
  render();
}

function icon(name: string): HTMLElement {
  return h('span', { className: `icon icon-${name}`, 'aria-hidden': 'true' });
}

function renderFile(file: FileItem, section: RowContext['webviewSection']): HTMLElement {
  const box = h('input', { type: 'checkbox', checked: checked.has(file.path), tabindex: -1, onClick: (e: Event) => (e.stopPropagation(), toggle(selection.has(file.path) ? [...selection] : [file.path], (e.target as HTMLInputElement).checked)) });
  return h(
    'div',
    {
      className: `row file${selection.has(file.path) ? ' selected' : ''}`,
      title: `${STATUS_TITLES[file.status]}: ${file.dir ? `${file.dir}/` : ''}${file.name}`,
      'data-path': file.path,
      'data-vscode-context': contextFor(section, file.path),
      onMousedown: (e: MouseEvent) => {
        if (e.button === 2 && !selection.has(file.path)) {
          select(file.path, e);
        }
      },
      onClick: (e: MouseEvent) => {
        select(file.path, e);
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && e.detail === 1) {
          preview(file.path);
        }
      },
      onDblclick: () => (clearTimeout(previewTimer), vscode.postMessage({ type: 'diff', path: file.path })),
    },
    box,
    file.icon && h('img', { className: 'file-icon dark', src: file.icon.dark, alt: '' }),
    file.icon && h('img', { className: 'file-icon light', src: file.icon.light, alt: '' }),
    h('span', { className: `name status-${file.status}` }, file.name),
    file.dir && h('span', { className: 'dir' }, file.dir),
  );
}

function renderGroup(group: Group): HTMLElement[] {
  const paths = group.files.map((f) => f.path);
  const allChecked = paths.length > 0 && paths.every((p) => checked.has(p));
  const someChecked = paths.some((p) => checked.has(p));
  const box = h('input', { type: 'checkbox', checked: allChecked, tabindex: -1, onClick: (e: Event) => (e.stopPropagation(), toggle(paths, (e.target as HTMLInputElement).checked)) });
  box.indeterminate = someChecked && !allChecked;
  box.disabled = paths.length === 0;
  const isCollapsed = collapsed.has(group.id);
  const section: RowContext['webviewSection'] = group.id === UNVERSIONED ? 'unversioned' : 'changelist';
  const header = h(
    'div',
    {
      className: `row group${group.active && state!.changelistsEnabled ? ' active' : ''}`,
      'data-vscode-context': group.id === UNVERSIONED ? contextFor('unversioned') : contextFor('changelist', undefined, group.id),
      onClick: () => {
        if (isCollapsed) {
          collapsed.delete(group.id);
        } else {
          collapsed.add(group.id);
        }
        persist();
        render();
      },
    },
    icon(isCollapsed ? 'chevron-right' : 'chevron-down'),
    box,
    h('span', { className: 'group-name' }, group.name),
    group.active && state!.changelistsEnabled && h('span', { className: 'active-label' }, t('(active)')),
    h('span', { className: 'count' }, group.files.length === 1 ? t('1 file') : t('{0} files', group.files.length)),
  );
  return [header, ...(isCollapsed ? [] : group.files.map((f) => renderFile(f, section === 'unversioned' ? 'unversioned' : 'file')))];
}

function commit(push: boolean): void {
  if (busy) {
    return;
  }
  const paths = groups()
    .flatMap((g) => g.files)
    .map((f) => f.path)
    .filter((p) => checked.has(p));
  vscode.postMessage({ type: 'commit', paths, message, amend, push });
}

function render(): void {
  const app = document.getElementById('app')!;
  if (!state) {
    return;
  }
  if (!state.available) {
    app.replaceChildren(h('div', { className: 'empty' }, state.reason ?? t('Version control is not available.')));
    return;
  }
  const selected = [...selection];
  const toolbar = h(
    'div',
    { className: 'toolbar' },
    h('button', { className: 'tool', title: t('Refresh'), onClick: () => vscode.postMessage({ type: 'refresh' }) }, icon('refresh')),
    h('button', { className: 'tool', title: t('Rollback…'), disabled: selected.length === 0, onClick: () => vscode.postMessage({ type: 'rollback', paths: selected }) }, icon('discard')),
    h('button', { className: 'tool', title: t('Show Diff'), disabled: selected.length !== 1, onClick: () => vscode.postMessage({ type: 'diff', path: selected[0] }) }, icon('diff')),
    state.changelistsEnabled && h('button', { className: 'tool', title: t('New Changelist…'), onClick: () => vscode.postMessage({ type: 'newChangelist' }) }, icon('add')),
    h('span', { className: 'branch', title: `${state.repository} · ${state.branch ?? ''}` }, icon('git-branch'), ` ${state.branch ?? ''}`),
  );

  const list = h('div', { className: 'changes', tabindex: 0, onKeydown: onListKey }, ...groups().flatMap(renderGroup));
  if (groups().every((g) => g.files.length === 0)) {
    list.append(h('div', { className: 'empty' }, t('No changes')));
  }

  const textarea = h('textarea', {
    id: 'message',
    placeholder: t('Commit Message'),
    rows: 4,
    onInput: (e: Event) => {
      message = (e.target as HTMLTextAreaElement).value;
      persist();
    },
    onKeydown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commit(false);
      }
    },
  });
  textarea.value = message;
  const total = groups()
    .flatMap((g) => g.files)
    .filter((f) => checked.has(f.path)).length;
  const commitArea = h(
    'div',
    { className: 'commit' },
    h(
      'label',
      { className: 'amend' },
      h('input', {
        type: 'checkbox',
        checked: amend,
        onChange: (e: Event) => {
          amend = (e.target as HTMLInputElement).checked;
          persist();
          vscode.postMessage({ type: 'amend', enabled: amend, message });
          render();
        },
      }),
      t(' Amend'),
    ),
    textarea,
    h(
      'div',
      { className: 'buttons' },
      h('button', { id: 'commit', disabled: busy, title: state.commitShortcut ? t('Commit ({0} / Ctrl+Enter)', state.commitShortcut) : t('Commit (Ctrl+Enter)'), onClick: () => commit(false) }, amend ? t('Amend Commit') : t('Commit')),
      h('button', { className: 'secondary', disabled: busy, onClick: () => commit(true) }, amend ? t('Amend Commit and Push…') : t('Commit and Push…')),
      h('span', { className: 'count' }, total === 1 ? t('1 file selected') : t('{0} files selected', total)),
    ),
  );

  const focusedId = document.activeElement?.id;
  const hadListFocus = document.activeElement?.classList.contains('changes');
  app.replaceChildren(toolbar, list, commitArea);
  if (focusedId === 'message') {
    const area = document.getElementById('message') as HTMLTextAreaElement;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  } else if (hadListFocus) {
    (document.querySelector('.changes') as HTMLElement).focus();
  }
}

let previewTimer: ReturnType<typeof setTimeout> | undefined;

/** IntelliJ's diff preview: follows the selection, the list keeps the focus (debounced for arrow keys). */
function preview(path: string): void {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => vscode.postMessage({ type: 'preview', path }), 120);
}

function onListKey(e: KeyboardEvent): void {
  const files = visibleFiles();
  if (files.length === 0) {
    return;
  }
  const current = anchor ? files.findIndex((f) => f.path === anchor) : -1;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = files[Math.min(files.length - 1, Math.max(0, current + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (e.shiftKey) {
      select(next.path, e);
    } else {
      selection = new Set([next.path]);
      anchor = next.path;
      render();
      preview(next.path);
    }
  } else if (e.key === ' ') {
    e.preventDefault();
    toggle([...selection]);
  } else if (e.key === 'Enter' && anchor) {
    e.preventDefault();
    vscode.postMessage({ type: 'diff', path: anchor });
  } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    selection = new Set(files.map((f) => f.path));
    render();
  }
}

window.addEventListener('message', (event: MessageEvent<ToCommitView>) => {
  const data = event.data;
  switch (data.type) {
    case 'state':
      applyNewState(data.state);
      render();
      break;
    case 'setMessage':
      message = data.message;
      persist();
      render();
      break;
    case 'committed':
      message = '';
      amend = false;
      persist();
      render();
      break;
    case 'busy':
      busy = data.busy;
      render();
      break;
    case 'focusMessage':
      document.getElementById('message')?.focus();
      break;
  }
});

vscode.postMessage({ type: 'ready' });
