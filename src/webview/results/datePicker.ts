/**
 * Date picker of the table editor: the value stays editable as text in the cell, and a calendar
 * under it (month navigation, days, hours / minutes / seconds, Today / Now, NULL) changes it.
 */
import { DateKind, DateParts, formatDate, monthGrid, now, parseDate, shiftDate } from '../../database/dateValue';
import { language, t } from '../../i18n/i18n';
import { h } from './dom';
import { isolate, keepFocus, place } from './popup';

export interface DateEditorOptions {
  kind: DateKind;
  tz: boolean;
  nullable: boolean;
  /** Text of the value being edited (null = NULL). */
  value: string | null;
  onInput(text: string): void;
  onCommit(value: string | null): void;
  onCancel(): void;
}

export interface MountedEditor {
  /** Elements belonging to the editor: focus moving to them does not end the edit. */
  contains(node: Node | null): boolean;
  dispose(): void;
}

export function mountDateEditor(cell: HTMLElement, options: DateEditorOptions): MountedEditor {
  const { kind } = options;
  const locale = language() === 'fr' ? 'fr-FR' : 'en-US';
  const firstDay = language() === 'fr' ? 1 : 0;
  const input = h('input', { type: 'text', className: 'cell-editor', spellcheck: 'false', value: options.value ?? '' });
  cell.append(input);

  let parts: DateParts = parseDate(kind, options.value ?? '') ?? now(options.tz);
  /** Month shown by the calendar (may differ from the value's while browsing). */
  let shown = { year: parts.year, month: parts.month };
  const popup = h('div', { className: 'popup date-picker', role: 'dialog' });
  keepFocus(popup);

  const setText = (text: string): void => {
    input.value = text;
    input.classList.toggle('invalid', text.trim() !== '' && !parseDate(kind, text) && !/^-?infinity$|^epoch$|^now$|^today$/i.test(text.trim()));
    options.onInput(text);
  };
  const set = (next: DateParts): void => {
    parts = next;
    shown = { year: next.year, month: next.month };
    setText(formatDate(kind, next));
    render();
  };

  const monthTitle = (year: number, month: number): string => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + ((firstDay + i) % 7), 12))));
  const today = now(false);

  const nav = (label: string, title: string, months: number) =>
    h('button', { className: 'tool nav', title, onClick: () => ((shown = monthOf(shiftDate({ ...parts, ...shown, day: 1 }, 0, months))), render()) }, label.length === 1 ? label : h('span', { className: `icon icon-${label}` }));

  const timeField = (value: number, max: number, title: string, apply: (n: number) => DateParts): HTMLInputElement => {
    const field = h('input', { type: 'text', className: 'time-field', value: String(value).padStart(2, '0'), title, inputmode: 'numeric', maxlength: '2' });
    const commitField = (n: number) => set(apply(((n % (max + 1)) + max + 1) % (max + 1)));
    field.addEventListener('keydown', (e) => {
      isolate(e);
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        commitField(Number(field.value || 0) + (e.key === 'ArrowUp' ? 1 : -1));
        popup.querySelector<HTMLInputElement>(`input[title="${title}"]`)?.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commitField(Number(field.value || 0));
        options.onCommit(input.value.trim() === '' && options.nullable ? null : input.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        options.onCancel();
      }
    });
    field.addEventListener('focus', () => field.select());
    field.addEventListener('change', () => commitField(Number(field.value.replace(/\D/g, '') || 0)));
    return field;
  };

  function render(): void {
    const children: HTMLElement[] = [];
    if (kind !== 'time') {
      children.push(
        h(
          'div',
          { className: 'picker-header' },
          nav('«', t('Previous Year'), -12),
          nav('chevron-left', t('Previous Month'), -1),
          h('span', { className: 'picker-title' }, monthTitle(shown.year, shown.month)),
          nav('chevron-right', t('Next Month'), 1),
          nav('»', t('Next Year'), 12),
        ),
        h(
          'div',
          { className: 'picker-days' },
          ...weekdays.map((d) => h('span', { className: 'weekday' }, d)),
          ...monthGrid(shown.year, shown.month, firstDay).map((d) => {
            const classes = ['day'];
            if (d.month !== shown.month) {classes.push('outside');}
            if (d.year === today.year && d.month === today.month && d.day === today.day) {classes.push('today');}
            if (d.year === parts.year && d.month === parts.month && d.day === parts.day && input.value.trim() !== '') {classes.push('selected');}
            return h(
              'button',
              {
                className: classes.join(' '),
                onClick: () => set({ ...parts, ...d }),
                onDblclick: () => options.onCommit(formatDate(kind, { ...parts, ...d })),
              },
              String(d.day),
            );
          }),
        ),
      );
    }
    if (kind !== 'date') {
      children.push(
        h(
          'div',
          { className: 'picker-time' },
          h('span', { className: 'icon icon-history' }),
          timeField(parts.hour, 23, t('Hours'), (n) => ({ ...parts, hour: n })),
          ':',
          timeField(parts.minute, 59, t('Minutes'), (n) => ({ ...parts, minute: n })),
          ':',
          timeField(parts.second, 59, t('Seconds'), (n) => ({ ...parts, second: n })),
          parts.tail.trim() && h('span', { className: 'muted' }, parts.tail.trim()),
        ),
      );
    }
    children.push(
      h(
        'div',
        { className: 'picker-footer' },
        h('button', { className: 'link', onClick: () => set({ ...now(options.tz), tail: parts.tail || now(options.tz).tail }) }, kind === 'date' ? t('Today') : t('Now')),
        options.nullable && h('button', { className: 'link', onClick: () => options.onCommit(null) }, 'NULL'),
        h('span', { className: 'spacer' }),
        h('button', { className: 'secondary', onClick: () => options.onCancel() }, t('Cancel')),
        h('button', { className: 'primary', onClick: () => options.onCommit(input.value.trim() === '' && options.nullable ? null : input.value) }, 'OK'),
      ),
    );
    popup.replaceChildren(...children);
  }

  input.addEventListener('input', () => {
    setText(input.value);
    const parsed = parseDate(kind, input.value);
    if (parsed) {
      parts = parsed;
      shown = monthOf(parsed);
      render();
    }
  });
  input.addEventListener('keydown', (e) => {
    isolate(e);
    const step = (days: number, months = 0) => {
      e.preventDefault();
      set(shiftDate(parseDate(kind, input.value) ?? parts, days, months));
    };
    if (e.key === 'Enter') {
      e.preventDefault();
      options.onCommit(input.value.trim() === '' && options.nullable ? null : input.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      options.onCancel();
    } else if (kind !== 'time' && e.altKey && e.key === 'ArrowUp') {
      step(-1);
    } else if (kind !== 'time' && e.altKey && e.key === 'ArrowDown') {
      step(1);
    } else if (kind !== 'time' && e.key === 'PageUp') {
      step(0, -1);
    } else if (kind !== 'time' && e.key === 'PageDown') {
      step(0, 1);
    }
  });

  render();
  place(popup, cell);
  input.focus();
  input.select();
  return {
    contains: (node) => !!node && (input.contains(node) || popup.contains(node)),
    dispose: () => {
      input.remove();
      popup.remove();
    },
  };
}

function monthOf(p: { year: number; month: number }): { year: number; month: number } {
  return { year: p.year, month: p.month };
}
