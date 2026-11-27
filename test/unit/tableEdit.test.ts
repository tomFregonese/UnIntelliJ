import { describe, expect, it } from 'vitest';
import { daysInMonth, formatDate, monthGrid, now, parseDate, shiftDate } from '../../src/database/dateValue';
import { changeStatements, ColumnRow, editKind, tableInfo } from '../../src/database/tableEdit';

const column = (name: string, type: string, base: string, extra: Partial<ColumnRow> = {}): ColumnRow => ({
  name,
  type,
  cast_type: type.replace(/\(\d+(,\d+)?\)/, ''),
  base,
  category: base === 'int4' ? 'N' : 'S',
  nullable: true,
  has_default: false,
  generated: false,
  key: false,
  enum_values: null,
  relkind: 'r',
  ...extra,
});

const keyed = tableInfo([
  column('id', 'integer', 'int4', { key: true, nullable: false, has_default: true }),
  column('label', 'character varying(40)', 'varchar'),
  column('created', 'timestamp without time zone', 'timestamp'),
]);
const rows = [
  ['1', 'a', '2024-05-01 10:00:00'],
  ['2', 'b', null],
];

describe('tableInfo', () => {
  it('finds the key, kinds and editability', () => {
    expect(keyed.identity).toBe('key');
    expect(keyed.columns.map((c) => c.kind)).toEqual(['number', 'text', 'timestamp']);
    expect(keyed.readOnlyReason).toBeUndefined();
    expect(tableInfo([column('x', 'text', 'text', { relkind: 'v' })]).readOnlyReason).toBe('view');
    expect(tableInfo([column('x', 'text', 'text')]).identity).toBe('ctid');
  });

  it('maps base types to editors', () => {
    expect(editKind('timestamptz', 'D')).toBe('timestamp');
    expect(editKind('date', 'D')).toBe('date');
    expect(editKind('timetz', 'D')).toBe('time');
    expect(editKind('bool', 'B')).toBe('boolean');
    expect(editKind('jsonb', 'U')).toBe('json');
    expect(editKind('mood', 'E')).toBe('enum');
    expect(editKind('numeric', 'N')).toBe('number');
    expect(editKind('uuid', 'U')).toBe('text');
  });
});

describe('changeStatements', () => {
  it('updates by primary key with typed parameters', () => {
    const [update] = changeStatements('public', 'Items', keyed, rows, [], [{ kind: 'update', row: 1, values: { 1: 'x', 2: '2024-06-01 08:30:00' } }]);
    expect(update).toEqual({
      text: 'UPDATE public."Items" SET label = $1::character varying, created = $2::timestamp without time zone WHERE id = $3::integer',
      values: ['x', '2024-06-01 08:30:00', '2'],
      expectOneRow: true,
    });
  });

  it('writes NULL, inserts only the set columns, deletes first', () => {
    const statements = changeStatements('s', 't', keyed, rows, [], [
      { kind: 'insert', values: { 1: 'new' } },
      { kind: 'update', row: 0, values: { 2: null } },
      { kind: 'delete', row: 1 },
      { kind: 'insert', values: {} },
    ]);
    expect(statements.map((s) => s.text)).toEqual([
      'DELETE FROM s.t WHERE id = $1::integer',
      'UPDATE s.t SET created = $1::timestamp without time zone WHERE id = $2::integer',
      'INSERT INTO s.t (label) VALUES ($1::character varying)',
      'INSERT INTO s.t DEFAULT VALUES',
    ]);
    expect(statements[1].values).toEqual([null, '1']);
    expect(statements[2].expectOneRow).toBe(false);
  });

  it('finds rows by ctid without a primary key', () => {
    const info = tableInfo([column('label', 'text', 'text')]);
    const [statement] = changeStatements('s', 't', info, [['a']], ['(0,1)'], [{ kind: 'update', row: 0, values: { 0: 'b' } }]);
    expect(statement.text).toBe('UPDATE s.t SET label = $1::text WHERE ctid = $2::tid');
    expect(statement.values).toEqual(['b', '(0,1)']);
  });

  it('skips updates without values', () => {
    expect(changeStatements('s', 't', keyed, rows, [], [{ kind: 'update', row: 0, values: {} }])).toEqual([]);
  });
});

describe('dateValue', () => {
  it('parses and formats PostgreSQL values, keeping fraction and offset', () => {
    const ts = parseDate('timestamp', '2024-02-29 13:05:09.123456+05:30')!;
    expect(ts).toMatchObject({ year: 2024, month: 2, day: 29, hour: 13, minute: 5, second: 9, fraction: '.123456', tail: '+05:30' });
    expect(formatDate('timestamp', { ...ts, day: 28 })).toBe('2024-02-28 13:05:09.123456+05:30');
    expect(formatDate('date', parseDate('date', '2024-12-31')!)).toBe('2024-12-31');
    expect(formatDate('time', parseDate('time', '08:30')!)).toBe('08:30:00');
    expect(parseDate('date', '2023-02-29')).toBeUndefined();
    expect(parseDate('timestamp', 'infinity')).toBeUndefined();
  });

  it('builds month grids and moves dates', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    const grid = monthGrid(2024, 5, 1); // May 2024 starts on a Wednesday
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ year: 2024, month: 4, day: 29 });
    expect(grid[2]).toEqual({ year: 2024, month: 5, day: 1 });
    expect(monthGrid(2024, 5, 0)[3]).toEqual({ year: 2024, month: 5, day: 1 });
    const jan31 = parseDate('date', '2024-01-31')!;
    expect(formatDate('date', shiftDate(jan31, 0, 1))).toBe('2024-02-29');
    expect(formatDate('date', shiftDate(jan31, 1))).toBe('2024-02-01');
    expect(formatDate('date', shiftDate(jan31, 0, -13))).toBe('2022-12-31');
  });

  it('writes the local offset like PostgreSQL', () => {
    const value = now(true, new Date());
    expect(value.tail).toMatch(/^[+-]\d{2}(:\d{2})?$/);
    expect(now(false).tail).toBe('');
  });
});
