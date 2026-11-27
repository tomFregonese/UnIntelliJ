/**
 * IntelliJ's table editor: column metadata and the statements that write pending changes back.
 * Values travel as PostgreSQL's text representation and are cast to the column type
 * (`$1::timestamp without time zone`), so what the grid shows is exactly what is written.
 * Pure: no `vscode` import.
 */
import type { EditColumn, EditKind, RowChange } from './resultsProtocol';
import { quoteIdent } from './sqlLogic';

/** One row per column of a table or view, in column order. Parameters: schema, table. */
export const COLUMNS_SQL = `SELECT a.attname AS name,
       format_type(a.atttypid, a.atttypmod) AS type,
       format_type(a.atttypid, NULL) AS cast_type,
       bt.typname AS base,
       bt.typcategory AS category,
       NOT a.attnotnull AS nullable,
       a.atthasdef AS has_default,
       a.attidentity = 'a' OR a.attgenerated <> '' AS generated,
       EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY (i.indkey)) AS key,
       (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = bt.oid) AS enum_values,
       c.relkind AS relkind
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  JOIN pg_type bt ON bt.oid = CASE WHEN t.typtype = 'd' THEN t.typbasetype ELSE t.oid END
 WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
 ORDER BY a.attnum`;

export interface ColumnRow {
  name: string;
  type: string;
  cast_type: string;
  base: string;
  category: string;
  nullable: boolean;
  has_default: boolean;
  generated: boolean;
  key: boolean;
  enum_values: string[] | null;
  relkind: string;
}

/** The editor a column gets, from its base type. */
export function editKind(base: string, category: string): EditKind {
  switch (base) {
    case 'date':
      return 'date';
    case 'timestamp':
    case 'timestamptz':
      return 'timestamp';
    case 'time':
    case 'timetz':
      return 'time';
    case 'json':
    case 'jsonb':
      return 'json';
    case 'bool':
      return 'boolean';
  }
  if (category === 'E') {
    return 'enum';
  }
  return category === 'N' ? 'number' : 'text';
}

export interface TableInfo {
  columns: EditColumn[];
  /** Rows are found by their primary key, else by `ctid` (tables without a key). */
  identity: 'key' | 'ctid';
  /** Why the table cannot be edited (a view, a read-only data source), else undefined. */
  readOnlyReason?: string;
}

/** Columns and editability of a table, from the rows of COLUMNS_SQL. */
export function tableInfo(rows: readonly ColumnRow[]): TableInfo {
  const columns = rows.map((r): EditColumn => ({
    name: r.name,
    type: r.type,
    castType: r.cast_type,
    kind: editKind(r.base, r.category),
    tz: r.base === 'timestamptz' || r.base === 'timetz',
    nullable: r.nullable,
    hasDefault: r.has_default,
    readOnly: r.generated,
    key: r.key,
    enumValues: r.enum_values ?? undefined,
  }));
  const relkind = rows[0]?.relkind;
  return {
    columns,
    identity: columns.some((c) => c.key) ? 'key' : 'ctid',
    readOnlyReason: relkind === 'r' || relkind === 'p' ? undefined : 'view',
  };
}

export interface Statement {
  text: string;
  values: (string | null)[];
  /** UPDATE and DELETE must touch exactly one row, else the row changed meanwhile. */
  expectOneRow: boolean;
}

/**
 * Statements writing `changes` to `schema.table`. `rows` are the current values of the page (text
 * form), `ctids` their ctid when the table has no primary key.
 */
export function changeStatements(schema: string, table: string, info: TableInfo, rows: readonly (readonly (string | null)[])[], ctids: readonly string[], changes: readonly RowChange[]): Statement[] {
  const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const where = (row: number, values: (string | null)[]): string => {
    if (info.identity === 'ctid') {
      values.push(ctids[row]);
      return `ctid = $${values.length}::tid`;
    }
    return info.columns
      .flatMap((c, i) => (c.key ? [{ c, i }] : []))
      .map(({ c, i }) => {
        values.push(rows[row][i]);
        return `${quoteIdent(c.name)} = $${values.length}::${c.castType}`;
      })
      .join(' AND ');
  };
  const set = (index: number, values: (string | null)[], value: string | null): string => {
    values.push(value);
    // Cast without length / precision: assigning to the column then checks them (an explicit
    // `::varchar(40)` would silently cut a longer text).
    return `$${values.length}::${info.columns[index].castType}`;
  };
  // Deletes first (an inserted row may reuse a deleted key), then updates, then inserts.
  const order = { delete: 0, update: 1, insert: 2 } as const;
  return [...changes]
    .sort((a, b) => order[a.kind] - order[b.kind])
    .flatMap((change): Statement[] => {
      const values: (string | null)[] = [];
      if (change.kind === 'delete') {
        return [{ text: `DELETE FROM ${target} WHERE ${where(change.row, values)}`, values, expectOneRow: true }];
      }
      const entries = Object.entries(change.values).map(([i, v]) => [Number(i), v] as const);
      if (change.kind === 'update') {
        if (entries.length === 0) {
          return [];
        }
        const assignments = entries.map(([i, v]) => `${quoteIdent(info.columns[i].name)} = ${set(i, values, v)}`).join(', ');
        return [{ text: `UPDATE ${target} SET ${assignments} WHERE ${where(change.row, values)}`, values, expectOneRow: true }];
      }
      if (entries.length === 0) {
        return [{ text: `INSERT INTO ${target} DEFAULT VALUES`, values, expectOneRow: false }];
      }
      const names = entries.map(([i]) => quoteIdent(info.columns[i].name)).join(', ');
      const params = entries.map(([i, v]) => set(i, values, v)).join(', ');
      return [{ text: `INSERT INTO ${target} (${names}) VALUES (${params})`, values, expectOneRow: false }];
    });
}
