/**
 * Runs against a real PostgreSQL when UNINTELLIJ_TEST_PG_PORT is set (CI service, or locally:
 * `docker run --rm -e POSTGRES_HOST_AUTH_METHOD=trust -p 55432:5432 postgres:16-alpine`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { DataSource, inDatabase } from '../../src/database/dataSourceLogic';
import { openClient } from '../../src/database/pgClient';
import { splitStatements } from '../../src/database/sqlLogic';
import { changeStatements, ColumnRow, COLUMNS_SQL, tableInfo } from '../../src/database/tableEdit';

const port = Number(process.env.UNINTELLIJ_TEST_PG_PORT);
const source: DataSource = { id: 't', name: 'test', host: 'localhost', port, database: 'postgres', user: 'postgres', ssl: 'prefer', readOnly: false, color: 'none' };

describe.skipIf(!port)('PostgreSQL (live)', () => {
  let client: Client;

  beforeAll(async () => {
    // "prefer" falls back to a plain connection on servers without SSL.
    client = await openClient(source, process.env.UNINTELLIJ_TEST_PG_PASSWORD);
  });

  afterAll(async () => {
    await client?.end();
  });

  it('runs every statement of a script with functions and dollar quotes', async () => {
    const script = `drop schema if exists ut cascade; create schema ut;
create table ut.t (id int primary key, label text);
insert into ut.t values (1, 'a;b'), (2, 'c');
create function ut.two() returns int language plpgsql as $$ begin return 2; end; $$;
select ut.two() as v, count(*) as n from ut.t`;
    let last: unknown[] = [];
    for (const statement of splitStatements(script)) {
      last = (await client.query({ text: statement.text, rowMode: 'array' })).rows;
    }
    expect(last).toEqual([[2, '2']]);
  });

  it('reports the error position inside the statement', async () => {
    await expect(client.query('select * from ut.missing')).rejects.toMatchObject({ position: '15' });
  });

  it('cancels a running statement from a second connection', async () => {
    const running = client.query('select pg_sleep(10)').then(() => undefined, (error: Error) => error);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const canceller = await openClient(source, process.env.UNINTELLIJ_TEST_PG_PASSWORD);
    await canceller.query('select pg_cancel_backend($1)', [(client as unknown as { processID: number }).processID]);
    await canceller.end();
    expect(String(await running)).toMatch(/cancel/i);
  });

  it('enforces read-only sessions on the server', async () => {
    const ro = await openClient(source, process.env.UNINTELLIJ_TEST_PG_PASSWORD);
    await ro.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    await expect(ro.query("insert into ut.t values (3, 'x')")).rejects.toThrow(/read-only/);
    await ro.end();
  });

  it('connects to another database of the server chosen in the tree', async () => {
    await client.query('DROP DATABASE IF EXISTS unintellij_other');
    await client.query('CREATE DATABASE unintellij_other');
    const listed = (await client.query<{ datname: string }>('SELECT datname FROM pg_database WHERE NOT datistemplate AND datallowconn ORDER BY datname')).rows.map((r) => r.datname);
    expect(listed).toContain('unintellij_other');
    const other = await openClient(inDatabase(source, 'unintellij_other'), process.env.UNINTELLIJ_TEST_PG_PASSWORD);
    try {
      expect((await other.query<{ db: string }>('SELECT current_database() AS db')).rows[0].db).toBe('unintellij_other');
    } finally {
      await other.end();
    }
    await client.query('DROP DATABASE unintellij_other');
  });

  it('table editor: reads every type as text and writes it back, by key and by ctid', async () => {
    await client.query(`drop schema if exists ed cascade; create schema ed;
create type ed.mood as enum ('sad', 'ok', 'happy');
create table ed.t (id serial primary key, name varchar(20) not null, at timestamp, atz timestamptz, d date, tm time,
  ok boolean, m ed.mood, amount numeric(10,2), doc jsonb, tags text[], gen int generated always as (id * 2) stored);
insert into ed.t (name, at, atz, d, tm, ok, m, amount, doc, tags)
  values ('first', '2024-05-01 10:00:00.5', '2024-05-01 10:00:00+02', '2024-05-01', '08:30:00', true, 'ok', 12.5, '{"a": 1}', '{x,y}');
create table ed.nokey (label text);
insert into ed.nokey values ('a'), ('b');`);
    const meta = await client.query<ColumnRow>(COLUMNS_SQL, ['ed', 't']);
    const info = tableInfo(meta.rows);
    expect(info.columns.map((c) => c.kind)).toEqual(['number', 'text', 'timestamp', 'timestamp', 'date', 'time', 'boolean', 'enum', 'number', 'json', 'text', 'number']);
    expect(info.columns.find((c) => c.name === 'm')?.enumValues).toEqual(['sad', 'ok', 'happy']);
    expect(info.columns.find((c) => c.name === 'gen')?.readOnly).toBe(true);
    const raw = { getTypeParser: () => (v: string) => v };
    const read = async () => (await client.query({ text: 'SELECT * FROM ed.t ORDER BY id', rowMode: 'array', types: raw })).rows as (string | null)[][];
    const rows = await read();
    expect(rows[0].slice(0, 11)).toEqual(['1', 'first', '2024-05-01 10:00:00.5', expect.stringMatching(/^2024-05-01 \d{2}:00:00[+-]\d{2}/), '2024-05-01', '08:30:00', 't', 'ok', '12.50', '{"a": 1}', '{x,y}']);
    const apply = async (statements: ReturnType<typeof changeStatements>) => {
      await client.query('BEGIN');
      for (const s of statements) {
        const result = await client.query(s.text, s.values);
        if (s.expectOneRow) {expect(result.rowCount).toBe(1);}
      }
      await client.query('COMMIT');
    };
    await apply(
      changeStatements('ed', 't', info, rows, [], [
        { kind: 'update', row: 0, values: { 1: 'renamed', 2: '2025-01-02 03:04:05', 4: null, 6: 'f', 7: 'happy', 8: '99.99', 9: '{"b": [1, 2]}', 10: '{z}' } },
        { kind: 'insert', values: { 1: 'second', 5: '23:59:59' } },
      ]),
    );
    const after = await read();
    expect(after[0].slice(1, 11)).toEqual(['renamed', '2025-01-02 03:04:05', rows[0][3], null, '08:30:00', 'f', 'happy', '99.99', '{"b": [1, 2]}', '{z}']);
    expect(after[1].slice(0, 2)).toEqual(['2', 'second']);
    expect(after[1][11]).toBe('4');
    await apply(changeStatements('ed', 't', info, after, [], [{ kind: 'delete', row: 1 }]));
    expect(await read()).toHaveLength(1);
    // Too long for varchar(20): refused, never cut.
    await expect(apply(changeStatements('ed', 't', info, await read(), [], [{ kind: 'update', row: 0, values: { 1: 'x'.repeat(25) } }]))).rejects.toThrow(/too long/);
    await client.query('ROLLBACK');

    const noKeyInfo = tableInfo((await client.query<ColumnRow>(COLUMNS_SQL, ['ed', 'nokey'])).rows);
    const noKey = (await client.query({ text: 'SELECT ctid, * FROM ed.nokey ORDER BY label', rowMode: 'array', types: raw })).rows as string[][];
    await apply(changeStatements('ed', 'nokey', noKeyInfo, noKey.map((r) => r.slice(1)), noKey.map((r) => r[0]), [{ kind: 'update', row: 1, values: { 0: 'B' } }]));
    expect((await client.query('SELECT label FROM ed.nokey ORDER BY label')).rows.map((r) => r.label)).toEqual(['B', 'a']);
  });
});
