/**
 * PostgreSQL date / timestamp / time text values (ISO DateStyle, the server default) for the
 * table editor's date picker. The parts the picker does not change (fractional seconds, time zone
 * offset, ` BC`) are kept as they are. Pure: no DOM, no `vscode`.
 */

export type DateKind = 'date' | 'timestamp' | 'time';

export interface DateParts {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** `.123456` or empty. */
  fraction: string;
  /** Offset (`+01`, `-05:30`) and/or ` BC`, as written. */
  tail: string;
}

const DATE = /^(\d{4,})-(\d{2})-(\d{2})/;
const TIME = /^(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?/;

/** Parses a value of the given kind; undefined when it is not a regular date (`infinity`, typo). */
export function parseDate(kind: DateKind, text: string): DateParts | undefined {
  let rest = text.trim();
  const parts: DateParts = { year: 2000, month: 1, day: 1, hour: 0, minute: 0, second: 0, fraction: '', tail: '' };
  if (kind !== 'time') {
    const date = DATE.exec(rest);
    if (!date) {
      return undefined;
    }
    parts.year = Number(date[1]);
    parts.month = Number(date[2]);
    parts.day = Number(date[3]);
    rest = rest.slice(date[0].length);
    if (kind === 'timestamp') {
      rest = rest.replace(/^[ T]/, '');
    }
  }
  if (kind !== 'date') {
    const time = TIME.exec(rest);
    if (time) {
      parts.hour = Number(time[1]);
      parts.minute = Number(time[2]);
      parts.second = Number(time[3] ?? 0);
      parts.fraction = time[4] ?? '';
      rest = rest.slice(time[0].length);
    } else if (kind === 'time') {
      return undefined;
    }
  }
  parts.tail = rest;
  return isValid(parts) ? parts : undefined;
}

function isValid(p: DateParts): boolean {
  return p.month >= 1 && p.month <= 12 && p.day >= 1 && p.day <= daysInMonth(p.year, p.month) && p.hour <= 24 && p.minute <= 59 && p.second <= 60;
}

const pad = (n: number, size = 2): string => String(n).padStart(size, '0');

export function formatDate(kind: DateKind, p: DateParts): string {
  const date = `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
  const time = `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${p.fraction}`;
  return (kind === 'date' ? date : kind === 'time' ? time : `${date} ${time}`) + p.tail;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The 42 days (6 weeks) shown for a month, starting on `firstDay` (0 = Sunday, 1 = Monday). */
export function monthGrid(year: number, month: number, firstDay: number): { year: number; month: number; day: number }[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() - firstDay + 7) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1, 1 - offset + i));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  });
}

/** Moves a date by days or months, keeping the time; the day is clamped to the target month. */
export function shiftDate(p: DateParts, days: number, months = 0): DateParts {
  if (months !== 0) {
    const index = p.year * 12 + (p.month - 1) + months;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    return { ...p, year, month, day: Math.min(p.day, daysInMonth(year, month)) };
  }
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return { ...p, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Now, in local time; `tz` adds the local offset as PostgreSQL writes it (`+01`, `+05:30`). */
export function now(tz: boolean, date = new Date()): DateParts {
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const tail = tz ? `${sign}${pad(Math.floor(abs / 60))}${abs % 60 ? `:${pad(abs % 60)}` : ''}` : '';
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds(), fraction: '', tail };
}
