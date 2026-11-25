import { Client, QueryArrayResult } from 'pg';
import { openClient } from './pgClient';
import * as vscode from 'vscode';
import { t } from '../i18n/i18n';
import { DataSource } from './dataSourceLogic';

const SECRET_PREFIX = 'unintellij.database.password.';
const STORE_KEY = 'database.dataSources';

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  /** Rows affected by INSERT / UPDATE / DELETE, or returned by SELECT. */
  rowCount: number | null;
  command: string;
  durationMs: number;
}

/** Data sources (global, like IntelliJ's global data sources) and their passwords. */
export class DataSourceStore implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  constructor(
    private readonly state: vscode.Memento,
    private readonly secrets: vscode.SecretStorage,
  ) {}

  get all(): DataSource[] {
    return this.state.get<DataSource[]>(STORE_KEY, []);
  }

  get(id: string): DataSource | undefined {
    return this.all.find((s) => s.id === id);
  }

  async save(sources: DataSource[], passwords: Record<string, string | null>): Promise<void> {
    const removed = this.all.filter((s) => !sources.some((n) => n.id === s.id));
    for (const source of removed) {
      await this.secrets.delete(SECRET_PREFIX + source.id);
    }
    for (const [id, password] of Object.entries(passwords)) {
      if (password === null) {
        await this.secrets.delete(SECRET_PREFIX + id);
      } else {
        await this.secrets.store(SECRET_PREFIX + id, password);
      }
    }
    await this.state.update(STORE_KEY, sources);
    this.changed.fire();
  }

  password(id: string): Thenable<string | undefined> {
    return this.secrets.get(SECRET_PREFIX + id);
  }

  dispose(): void {
    this.changed.dispose();
  }
}

/** One open session per data source, created on first use (IntelliJ's "connect on demand"). */
export class Connections implements vscode.Disposable {
  private readonly sessions = new Map<string, Promise<Client>>();
  private readonly notices = new vscode.EventEmitter<{ sourceId: string; message: string }>();
  readonly onNotice = this.notices.event;
  private readonly states = new vscode.EventEmitter<string>();
  /** Fired with a source id when it connects or disconnects. */
  readonly onDidChangeState = this.states.event;

  constructor(private readonly store: DataSourceStore) {}

  isConnected(id: string): boolean {
    return this.sessions.has(id);
  }

  private client(source: DataSource): Promise<Client> {
    let session = this.sessions.get(source.id);
    if (!session) {
      session = (async () => {
        const client = await openClient(source, await this.store.password(source.id));
        client.on('notice', (n) => this.notices.fire({ sourceId: source.id, message: `${n.severity ?? 'NOTICE'}: ${n.message}` }));
        client.on('error', () => void this.disconnect(source.id));
        client.on('end', () => {
          this.sessions.delete(source.id);
          this.states.fire(source.id);
        });
        if (source.readOnly) {
          // Enforced by the server: every transaction of this session is read-only.
          await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
        }
        return client;
      })();
      this.sessions.set(source.id, session);
      session.then(
        () => this.states.fire(source.id),
        () => this.sessions.delete(source.id),
      );
    }
    return session;
  }

  /** Runs one statement; `schema` becomes the search path first (the file's schema selector). */
  async query(source: DataSource, sql: string, schema?: string, values?: unknown[]): Promise<QueryResult> {
    const client = await this.client(source);
    if (schema) {
      await client.query(`SET search_path TO ${schema.split(',').map((s) => `"${s.trim().replace(/"/g, '""')}"`).join(', ')}, public`);
    }
    const started = Date.now();
    const result = (await client.query({ text: sql, values, rowMode: 'array' })) as QueryArrayResult | QueryArrayResult[];
    // A simple-protocol multi-statement query returns one result per statement: show the last one.
    const last = Array.isArray(result) ? result[result.length - 1] : result;
    return {
      columns: (last.fields ?? []).map((f) => f.name),
      rows: last.rows ?? [],
      rowCount: last.rowCount,
      command: last.command ?? '',
      durationMs: Date.now() - started,
    };
  }

  /** Cancels the running statement of a source from a second connection (pg_cancel_backend). */
  async cancel(source: DataSource): Promise<void> {
    const session = this.sessions.get(source.id);
    if (!session) {
      return;
    }
    const pid = ((await session) as unknown as { processID?: number }).processID;
    if (!pid) {
      return;
    }
    const canceller = await openClient(source, await this.store.password(source.id));
    try {
      await canceller.query('SELECT pg_cancel_backend($1)', [pid]);
    } finally {
      await canceller.end().catch(() => undefined);
    }
  }

  async disconnect(id: string): Promise<void> {
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    if (session) {
      await session.then((c) => c.end()).catch(() => undefined);
      this.states.fire(id);
    }
  }

  /** Test Connection: opens and closes a separate client, returns the server version. */
  static async test(source: DataSource, password: string | undefined): Promise<string> {
    const client = await openClient(source, password, 8000);
    try {
      const result = await client.query<{ version: string }>('SELECT version()');
      return result.rows[0]?.version.split(',')[0] ?? t('Connected');
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  dispose(): void {
    for (const id of [...this.sessions.keys()]) {
      void this.disconnect(id);
    }
    this.notices.dispose();
    this.states.dispose();
  }
}
