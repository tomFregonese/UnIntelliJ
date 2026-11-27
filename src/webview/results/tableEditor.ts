/**
 * IntelliJ's table editor in the table data tab: cells are edited in place (an editor per type:
 * text, number, JSON, true/false, enum values, date picker), changes stay pending — modified cells,
 * added and deleted rows are highlighted — until Submit writes them in one transaction.
 */
import { DateKind } from '../../database/dateValue';
import type { EditColumn, FromResultsWebview, ResultTab, RowChange } from '../../database/resultsProtocol';
import { t } from '../../i18n/i18n';
import { mountDateEditor, MountedEditor } from './datePicker';
import { h } from './dom';
import { isolate, keepFocus, place } from './popup';

type Post = (message: FromResultsWebview) => void;

/** Pending changes of a table tab, for the rows of one load (`version`). */
class Pending {
  readonly updates = new Map<number, Map<number, string | null>>();
  readonly inserts: Map<number, string | null>[] = [];
  readonly deletes = new Set<number>();
  constructor(readonly version: number) {}

  /** Changed rows: modified, added or deleted. */
  get count(): number {
    let n = this.deletes.size + this.inserts.length;
    for (const [row, values] of this.updates) {
      n += values.size > 0 && !this.deletes.has(row) ? 1 : 0;
    }
    return n;
  }

  changes(): RowChange[] {
    return [
      ...[...this.deletes].map((row): RowChange => ({ kind: 'delete', row })),
      ...[...this.updates].filter(([row, values]) => values.size > 0 && !this.deletes.has(row)).map(([row, values]): RowChange => ({ kind: 'update', row, values: Object.fromEntries(values) })),
      ...this.inserts.map((values): RowChange => ({ kind: 'insert', values: Object.fromEntries(values) })),
    ];
  }
}

const pendings = new Map<string, Pending>();
/** Selected cell (row index in the grid: loaded rows, then added rows). */
let cursor: { tab: string; row: number; col: number } | undefined;
/** Rows selected with the row header. */
let selectedRows = new Set<number>();
let anchorRow: number | undefined;
let editing: { tab: string; row: number; col: number; draft?: string } | undefined;
let mounted: MountedEditor | undefined;

function pending(tab: ResultTab): Pending {
  const version = tab.edit?.version ?? 0;
  let p = pendings.get(tab.id);
  if (!p || p.version !== version) {
    p = new Pending(version);
    pendings.set(tab.id, p);
    selectedRows = new Set();
    editing = undefined;
  }
  return p;
}

export function pendingCount(tab: ResultTab): number {
  return tab.edit ? pending(tab).count : 0;
}

const editable = (tab: ResultTab): boolean => !!tab.edit && !tab.edit.readOnlyReason && !tab.edit.submitting;
const rowTotal = (tab: ResultTab): number => tab.rows.length + pending(tab).inserts.length;

/** Value of a cell: pending change first, else the loaded value. `undefined` = DEFAULT (added rows). */
function cell(tab: ResultTab, row: number, col: number): { value: string | null | undefined; changed: boolean } {
  const p = pending(tab);
  if (row < tab.rows.length) {
    const changes = p.updates.get(row);
    return changes?.has(col) ? { value: changes.get(col)!, changed: true } : { value: tab.rows[row][col], changed: false };
  }
  const values = p.inserts[row - tab.rows.length];
  return { value: values?.has(col) ? values.get(col)! : undefined, changed: values?.has(col) ?? false };
}

function setCell(tab: ResultTab, row: number, col: number, value: string | null): void {
  const p = pending(tab);
  if (row >= tab.rows.length) {
    p.inserts[row - tab.rows.length]?.set(col, value);
    return;
  }
  const changes = p.updates.get(row) ?? new Map<number, string | null>();
  if (value === tab.rows[row][col]) {
    changes.delete(col);
  } else {
    changes.set(col, value);
  }
  p.updates.set(row, changes);
}

function columnOf(tab: ResultTab, col: number): EditColumn | undefined {
  return tab.edit?.columns[col];
}

/** Display text: booleans as true / false (PostgreSQL writes t / f). */
function display(column: EditColumn | undefined, value: string | null): string {
  if (value === null) {
    return 'null';
  }
  if (column?.kind === 'boolean') {
    return value === 't' ? 'true' : value === 'f' ? 'false' : value;
  }
  return value;
}

/** Toolbar buttons of a table tab: add / delete rows, revert, or why the data is read-only. */
export function toolbarItems(tab: ResultTab, tool: (icon: string, title: string, onClick: () => void, disabled?: boolean) => HTMLElement, rerender: () => void): HTMLElement[] {
  if (!tab.edit) {
    return [];
  }
  if (tab.edit.readOnlyReason) {
    return [h('span', { className: 'read-only', title: tab.edit.readOnlyReason }, h('span', { className: 'icon icon-lock' }), tab.edit.readOnlyReason)];
  }
  const busy = !editable(tab);
  return [
    h('span', { className: 'separator' }),
    tool('add', t('Add Row ({0})', isMac() ? '⌘N' : 'Alt+Insert'), () => addRow(tab, rerender), busy),
    tool('remove', t('Delete Row ({0})', isMac() ? '⌘⌫' : 'Ctrl+Y'), () => deleteRows(tab, rerender), busy || targetRows(tab).length === 0),
    tool('discard', t('Revert Selected ({0})', isMac() ? '⌥⌘Z' : 'Ctrl+Alt+Z'), () => revertRows(tab, rerender), busy || pending(tab).count === 0),
  ];
}

/** Bar above the grid while changes are pending: count, Revert All and Submit. */
export function pendingBar(tab: ResultTab, post: Post, rerender: () => void): HTMLElement | undefined {
  if (!tab.edit) {
    return undefined;
  }
  const count = pending(tab).count;
  const error = tab.edit.submitError;
  if (count === 0 && !error) {
    return undefined;
  }
  return h(
    'div',
    { className: 'pending' },
    error && h('pre', { className: 'error' }, error),
    count > 0 &&
      h(
        'div',
        { className: 'pending-bar' },
        h('span', { className: 'icon icon-edit' }),
        h('span', {}, tab.edit.submitting ? t('Submitting…') : count === 1 ? t('1 pending change') : t('{0} pending changes', count)),
        h('span', { className: 'spacer' }),
        h('button', { className: 'secondary', disabled: tab.edit.submitting, onClick: () => (pendings.delete(tab.id), rerender()) }, t('Revert All')),
        h(
          'button',
          { className: 'primary', disabled: tab.edit.submitting, title: t('Write the changes to the database in one transaction'), onClick: () => submit(tab, post) },
          h('span', { className: 'icon icon-arrow-up' }),
          ` ${t('Submit')}`,
          h('span', { className: 'shortcut' }, isMac() ? '⌘↩' : 'Ctrl+Enter'),
        ),
      ),
  );
}

function submit(tab: ResultTab, post: Post): void {
  if (editing) {
    return;
  }
  const changes = pending(tab).changes();
  if (changes.length > 0 && editable(tab)) {
    post({ type: 'submit', id: tab.id, changes });
  }
}

/** The grid of a table tab: selectable cells, highlighted pending changes. */
export function grid(tab: ResultTab, startRow: number, rerender: () => void): HTMLElement {
  const p = pending(tab);
  const columns = tab.columns;
  const rows: HTMLElement[] = [];
  for (let r = 0; r < rowTotal(tab); r++) {
    const added = r >= tab.rows.length;
    const deleted = p.deletes.has(r);
    const rowClass = [added ? 'added' : '', deleted ? 'deleted' : '', selectedRows.has(r) ? 'row-selected' : ''].join(' ').trim();
    rows.push(
      h(
        'tr',
        { className: rowClass },
        h('td', { className: 'num', 'data-row': r }, added ? '+' : String(startRow + r + 1)),
        ...columns.map((_, c) => {
          const column = columnOf(tab, c);
          const { value, changed } = cell(tab, r, c);
          const classes: string[] = [];
          if (value === null) {classes.push('null');}
          if (value === undefined) {classes.push('default');}
          if (changed && !added) {classes.push('modified');}
          if (column?.kind === 'number') {classes.push('number');}
          if (cursor?.tab === tab.id && cursor.row === r && cursor.col === c) {classes.push('cursor');}
          const text = value === undefined ? (column?.hasDefault || column?.readOnly ? '<default>' : 'null') : display(column, value);
          return h('td', { className: classes.join(' '), 'data-r': r, 'data-c': c, title: text.length > 60 ? text.slice(0, 2000) : undefined }, text);
        }),
      ),
    );
  }
  const table = h(
    'table',
    { className: 'grid editable' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { className: 'num' }),
        ...columns.map((name, c) => {
          const column = columnOf(tab, c);
          return h('th', { title: column ? `${column.type}${column.nullable ? '' : ' NOT NULL'}${column.hasDefault ? ' DEFAULT' : ''}` : undefined }, column?.key ? h('span', { className: 'icon icon-symbol-key key' }) : null, name);
        }),
      ),
    ),
    h('tbody', {}, ...rows),
  );
  const wrap = h('div', { className: 'grid-wrap', tabindex: '0' }, table);
  wrap.addEventListener('mousedown', (e) => {
    const target = (e.target as HTMLElement).closest('td');
    if (!target || mounted?.contains(e.target as Node)) {
      return;
    }
    if (editing) {
      // Clicking another cell applies the edit in progress (what was typed), like IntelliJ.
      const { draft, col } = editing;
      const column = columnOf(tab, col);
      finishEdit(tab, draft === undefined ? undefined : draft === '' && column?.nullable && column.kind !== 'text' && column.kind !== 'json' ? null : draft, () => undefined);
    }
    if (target.dataset.row !== undefined) {
      selectRow(Number(target.dataset.row), e.shiftKey, e.metaKey || e.ctrlKey);
      e.preventDefault();
      wrap.focus();
      rerender();
      return;
    }
    if (target.dataset.r !== undefined) {
      cursor = { tab: tab.id, row: Number(target.dataset.r), col: Number(target.dataset.c) };
      if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
        selectedRows = new Set();
      }
      e.preventDefault();
      wrap.focus();
      rerender();
    }
  });
  wrap.addEventListener('dblclick', (e) => {
    const target = (e.target as HTMLElement).closest('td');
    if (target?.dataset.r !== undefined) {
      startEdit(tab, Number(target.dataset.r), Number(target.dataset.c), rerender);
    }
  });
  return wrap;
}

function selectRow(row: number, range: boolean, toggle: boolean): void {
  if (range && anchorRow !== undefined) {
    selectedRows = new Set(Array.from({ length: Math.abs(row - anchorRow) + 1 }, (_, i) => Math.min(row, anchorRow!) + i));
    return;
  }
  if (toggle) {
    if (!selectedRows.delete(row)) {
      selectedRows.add(row);
    }
  } else {
    selectedRows = new Set([row]);
  }
  anchorRow = row;
}

/** Rows an action applies to: the selected rows, else the row of the selected cell. */
function targetRows(tab: ResultTab): number[] {
  if (selectedRows.size > 0) {
    return [...selectedRows].filter((r) => r < rowTotal(tab)).sort((a, b) => a - b);
  }
  return cursor?.tab === tab.id && cursor.row < rowTotal(tab) ? [cursor.row] : [];
}

function addRow(tab: ResultTab, rerender: () => void): void {
  if (!editable(tab)) {
    return;
  }
  pending(tab).inserts.push(new Map());
  const row = rowTotal(tab) - 1;
  const first = tab.edit!.columns.findIndex((c) => !c.readOnly && !(c.hasDefault && c.key));
  selectedRows = new Set();
  cursor = { tab: tab.id, row, col: Math.max(0, first) };
  startEdit(tab, row, Math.max(0, first), rerender);
}

function deleteRows(tab: ResultTab, rerender: () => void): void {
  if (!editable(tab)) {
    return;
  }
  const p = pending(tab);
  // Added rows just go away (from the last one, so indexes stay right); loaded rows are marked.
  for (const row of targetRows(tab).reverse()) {
    if (row >= tab.rows.length) {
      p.inserts.splice(row - tab.rows.length, 1);
    } else {
      p.deletes.add(row);
    }
  }
  selectedRows = new Set();
  if (cursor && cursor.row >= rowTotal(tab)) {
    cursor = rowTotal(tab) > 0 ? { ...cursor, row: rowTotal(tab) - 1 } : undefined;
  }
  rerender();
}

function revertRows(tab: ResultTab, rerender: () => void): void {
  const p = pending(tab);
  const rows = targetRows(tab);
  if (rows.length === 0) {
    return;
  }
  for (const row of [...rows].reverse()) {
    if (row >= tab.rows.length) {
      p.inserts.splice(row - tab.rows.length, 1);
    } else if (selectedRows.size === 0 && cursor && p.updates.get(row)?.has(cursor.col) && !p.deletes.has(row)) {
      p.updates.get(row)!.delete(cursor.col); // Just the selected cell.
    } else {
      p.updates.delete(row);
      p.deletes.delete(row);
    }
  }
  rerender();
}

function startEdit(tab: ResultTab, row: number, col: number, rerender: () => void, draft?: string): void {
  const column = columnOf(tab, col);
  if (!editable(tab) || !column || column.readOnly || pending(tab).deletes.has(row)) {
    return;
  }
  cursor = { tab: tab.id, row, col };
  editing = { tab: tab.id, row, col, draft };
  rerender();
}

function finishEdit(tab: ResultTab, value: string | null | undefined, rerender: () => void): void {
  if (!editing) {
    return;
  }
  const { row, col } = editing;
  editing = undefined;
  mounted?.dispose();
  mounted = undefined;
  if (value !== undefined) {
    setCell(tab, row, col, value);
  }
  rerender();
}

/** After the grid is in the page: opens the editor of the edited cell, keeps the selection visible. */
export function afterRender(tab: ResultTab, rerender: () => void): void {
  mounted?.dispose();
  mounted = undefined;
  const wrap = document.querySelector<HTMLElement>('.grid-wrap');
  if (!wrap || !tab.edit) {
    return;
  }
  const target = (r: number, c: number) => wrap.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`);
  if (editing?.tab === tab.id) {
    const td = target(editing.row, editing.col);
    if (td) {
      td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      mounted = mountEditor(tab, td, rerender);
      return;
    }
    editing = undefined;
  }
  if (cursor?.tab === tab.id) {
    target(cursor.row, cursor.col)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (document.activeElement === document.body) {
      wrap.focus({ preventScroll: true });
    }
  }
}

function mountEditor(tab: ResultTab, td: HTMLElement, rerender: () => void): MountedEditor {
  const { row, col, draft } = editing!;
  const column = columnOf(tab, col)!;
  const current = cell(tab, row, col).value ?? null;
  const commit = (value: string | null) => finishEdit(tab, value, rerender);
  const cancel = () => finishEdit(tab, undefined, rerender);
  let editor: MountedEditor;
  if (column.kind === 'date' || column.kind === 'timestamp' || column.kind === 'time') {
    editor = mountDateEditor(td, {
      kind: column.kind as DateKind,
      tz: column.tz,
      nullable: column.nullable,
      value: draft ?? current,
      onInput: (text) => editing && (editing.draft = text),
      onCommit: commit,
      onCancel: cancel,
    });
  } else if (column.kind === 'boolean' || column.kind === 'enum') {
    const values = column.kind === 'boolean' ? ['t', 'f'] : (column.enumValues ?? []);
    editor = mountChoice(td, [...values, ...(column.nullable ? [null] : [])], current, (v) => display(column, v), commit, cancel);
  } else {
    editor = mountText(td, column, draft ?? current ?? '', commit, cancel);
  }
  // Clicking elsewhere applies the edit, like IntelliJ.
  const onFocusOut = (e: FocusEvent) => {
    if (editing && !editor.contains(e.relatedTarget as Node | null)) {
      const field = td.querySelector<HTMLInputElement | HTMLTextAreaElement>('.cell-editor');
      if (field && e.relatedTarget !== null) {
        commit(field.value === '' && column.nullable && column.kind !== 'text' && column.kind !== 'json' ? null : field.value);
      }
    }
  };
  td.addEventListener('focusout', onFocusOut);
  return {
    contains: editor.contains,
    dispose: () => {
      td.removeEventListener('focusout', onFocusOut);
      editor.dispose();
    },
  };
}

/** Text, number and JSON editor: grows with the text; Enter applies, Shift+Enter adds a line. */
function mountText(td: HTMLElement, column: EditColumn, value: string, commit: (v: string | null) => void, cancel: () => void): MountedEditor {
  const area = h('textarea', { className: `cell-editor${column.kind === 'number' ? ' number' : ''}`, spellcheck: 'false', rows: '1' });
  area.value = value;
  td.append(area);
  const valid = (): boolean => {
    const text = area.value.trim();
    if (text === '') {
      return true;
    }
    if (column.kind === 'number') {
      return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$|^[-+]?(NaN|Infinity)$/i.test(text);
    }
    if (column.kind === 'json') {
      try {
        JSON.parse(text);
      } catch {
        return false;
      }
    }
    return true;
  };
  const resize = () => {
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 240)}px`;
    area.classList.toggle('invalid', !valid());
  };
  const hint = h(
    'div',
    { className: 'popup editor-hint' },
    h('span', {}, column.kind === 'number' ? t('Enter: apply · Esc: cancel') : t('Enter: apply · Shift+Enter: new line · Esc: cancel')),
    column.nullable && h('button', { className: 'link', onClick: () => commit(null) }, t('Set NULL')),
  );
  keepFocus(hint);
  area.addEventListener('input', () => {
    resize();
    if (editing) {
      editing.draft = area.value;
    }
  });
  area.addEventListener('keydown', (e) => {
    isolate(e);
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (valid()) {
        commit(area.value === '' && column.nullable && column.kind !== 'text' && column.kind !== 'json' ? null : area.value);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });
  resize();
  place(hint, area);
  area.focus();
  area.setSelectionRange(area.value.length, area.value.length);
  return {
    contains: (node) => !!node && (area.contains(node) || hint.contains(node)),
    dispose: () => {
      area.remove();
      hint.remove();
    },
  };
}

/** true / false / enum values: a list under the cell. */
function mountChoice(td: HTMLElement, values: (string | null)[], current: string | null, label: (v: string | null) => string, commit: (v: string | null) => void, cancel: () => void): MountedEditor {
  let index = Math.max(0, values.indexOf(current));
  const list = h('div', { className: 'popup choice', tabindex: '0', role: 'listbox' });
  keepFocus(list);
  const render = () =>
    list.replaceChildren(
      ...values.map((v, i) =>
        h(
          'div',
          { className: `option${i === index ? ' active' : ''}${v === null ? ' null' : ''}${v === current ? ' current' : ''}`, role: 'option', onMousedown: () => commit(v), onMousemove: () => i !== index && ((index = i), render()) },
          v === current ? h('span', { className: 'icon icon-check' }) : h('span', { className: 'icon' }),
          label(v),
        ),
      ),
    );
  list.addEventListener('keydown', (e) => {
    isolate(e);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      index = (index + (e.key === 'ArrowDown' ? 1 : -1) + values.length) % values.length;
      render();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(values[index]);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      cancel();
    } else if (e.key.length === 1) {
      // Typing jumps to the next value starting with that letter.
      const start = values.findIndex((v, i) => i > index && label(v).toLowerCase().startsWith(e.key.toLowerCase()));
      const found = start >= 0 ? start : values.findIndex((v) => label(v).toLowerCase().startsWith(e.key.toLowerCase()));
      if (found >= 0) {
        index = found;
        render();
      }
    }
  });
  list.addEventListener('focusout', (e) => {
    if (!list.contains(e.relatedTarget as Node | null)) {
      cancel();
    }
  });
  render();
  td.classList.add('editing');
  place(list, td);
  list.style.minWidth = `${td.getBoundingClientRect().width}px`;
  list.focus();
  return {
    contains: (node) => !!node && list.contains(node),
    dispose: () => {
      td.classList.remove('editing');
      list.remove();
    },
  };
}

/** Keys of the table editor (when its grid has the focus). Returns true when handled. */
export function onKey(e: KeyboardEvent, tab: ResultTab, post: Post, rerender: () => void): boolean {
  if (!tab.edit) {
    return false;
  }
  const mod = isMac() ? e.metaKey : e.ctrlKey;
  if (mod && e.key === 'Enter') {
    submit(tab, post);
    return true;
  }
  if (editing || !(document.activeElement as HTMLElement | null)?.classList.contains('grid-wrap')) {
    return false;
  }
  if ((isMac() && e.metaKey && e.key.toLowerCase() === 'n') || (!isMac() && e.altKey && e.key === 'Insert')) {
    addRow(tab, rerender);
    return true;
  }
  if ((isMac() && e.metaKey && e.key === 'Backspace') || (!isMac() && e.ctrlKey && e.key.toLowerCase() === 'y')) {
    deleteRows(tab, rerender);
    return true;
  }
  if (e.altKey && mod && e.key.toLowerCase() === 'z') {
    revertRows(tab, rerender);
    return true;
  }
  if (!cursor || cursor.tab !== tab.id) {
    if (e.key.startsWith('Arrow') && rowTotal(tab) > 0) {
      cursor = { tab: tab.id, row: 0, col: 0 };
      rerender();
      return true;
    }
    return false;
  }
  const move = (row: number, col: number) => {
    cursor = { tab: tab.id, row: Math.max(0, Math.min(rowTotal(tab) - 1, row)), col: Math.max(0, Math.min(tab.columns.length - 1, col)) };
    selectedRows = new Set();
    rerender();
  };
  const { row, col } = cursor;
  switch (e.key) {
    case 'ArrowUp':
      move(row - 1, col);
      return true;
    case 'ArrowDown':
      move(row + 1, col);
      return true;
    case 'ArrowLeft':
      move(row, col - 1);
      return true;
    case 'ArrowRight':
      move(row, col + 1);
      return true;
    case 'Tab':
      move(row, col + (e.shiftKey ? -1 : 1));
      return true;
    case 'Home':
      move(mod ? 0 : row, 0);
      return true;
    case 'End':
      move(mod ? rowTotal(tab) - 1 : row, tab.columns.length - 1);
      return true;
    case 'Enter':
    case 'F2':
      startEdit(tab, row, col, rerender);
      return true;
    case 'Escape':
      selectedRows = new Set();
      rerender();
      return true;
    case 'Delete':
    case 'Backspace': {
      const column = columnOf(tab, col);
      if (column?.nullable && !column.readOnly && editable(tab) && !pending(tab).deletes.has(row)) {
        setCell(tab, row, col, null);
        rerender();
      }
      return true;
    }
  }
  // Typing starts editing text-like cells with that character, like a spreadsheet.
  const kind = columnOf(tab, col)?.kind;
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && kind !== 'boolean' && kind !== 'enum') {
    startEdit(tab, row, col, rerender, kind === 'date' || kind === 'timestamp' || kind === 'time' ? undefined : e.key);
    return true;
  }
  return false;
}

function isMac(): boolean {
  return navigator.platform.toUpperCase().includes('MAC');
}
