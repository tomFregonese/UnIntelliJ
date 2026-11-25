/**
 * Runs against a real PostgreSQL when UNINTELLIJ_TEST_PG_PORT is set (CI service, or locally:
 * `docker run --rm -e POSTGRES_HOST_AUTH_METHOD=trust -p 55432:5432 postgres:16-alpine`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { DataSource } from '../../src/database/dataSourceLogic';
import { openClient } from '../../src/database/pgClient';
import { splitStatements } from '../../src/database/sqlLogic';

const port = Number(process.env.UNINTELLIJ_TEST_PG_PORT);
const source: DataSource = { id: 't', name: 'test', host: 'localhost', port, database: 'postgres', user: 'postgres', ssl: 'prefer', readOnly: false, color: 'none', schemas: '' };

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
});
