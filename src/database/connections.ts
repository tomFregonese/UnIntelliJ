import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client, QueryArrayResult } from 'pg';
import { openClient } from './pgClient';
import * as vscode from 'vscode';
import { t } from '../i18n/i18n';
import { DataSource, normalizeSource, sessionKey } from './dataSourceLogic';

/** Type parsers returning PostgreSQL's text output unchanged. */
const RAW_TEXT = { getTypeParser: () => (value: string) => value } as const;

const SECRET_PREFIX = 'unintellij.database.password.';
/** Before 0.6.3 the data sources were in the extension's global state, lost when its id changed. */
const STORE_KEY = 'database.dataSources';
/**
 * Data sources (without passwords), in the user's home: shared by every VS Code window and
 * profile, kept when UnIntelliJ is reinstalled. UNINTELLIJ_DATA_DIR moves it (test instances).
 */
export const DATA_SOURCES_FILE = path.join(process.env.UNINTELLIJ_DATA_DIR ?? path.join(os.homedir(), '.unintellij'), 'data-sources.json');

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  /** Rows affected by INSERT / UPDATE / DELETE, or returned by SELECT. */
  rowCount: number | null;
  command: string;
  durationMs: number;
}

/**
 * Data sources (global, like IntelliJ's global data sources), in their order in the Database
 * tool window, and their passwords (in VS Code's secret storage: the system keychain).
 */
export class DataSourceStore implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private readonly watcher: vscode.FileSystemWatcher;

  constructor(
    state: vscode.Memento,
    private readonly secrets: vscode.SecretStorage,
    private readonly file = DATA_SOURCES_FILE,
  ) {
    const previous = state.get<DataSource[]>(STORE_KEY, []);
    if (!existsSync(file) && previous.length > 0) {
      this.write(previous);
    }
    // Another window changed them: refresh the tree here too.
    this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file)));
    this.watcher.onDidChange(() => this.changed.fire());
    this.watcher.onDidCreate(() => this.changed.fire());
  }

  get all(): DataSource[] {
    try {
      const data: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      return Array.isArray(data) ? (data as DataSource[]).filter((s) => typeof s?.id === 'string').map(normalizeSource) : [];
    } catch {
      return [];
    }
  }

  private write(sources: readonly DataSource[]): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(sources, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, this.file);
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
    this.write(sources);
    this.changed.fire();
  }

  password(id: string): Thenable<string | undefined> {
    return this.secrets.get(SECRET_PREFIX + id);
  }

  dispose(): void {
    this.watcher.dispose();
    this.changed.dispose();
  }
}

/** One open session per data source and database, created on first use (IntelliJ's "connect on demand"). */
export class Connections implements vscode.Disposable {
  private readonly sessions = new Map<string, Promise<Client>>();
  private readonly notices = new vscode.EventEmitter<{ sourceId: string; message: string }>();
  readonly onNotice = this.notices.event;
  private readonly states = new vscode.EventEmitter<string>();
  /** Fired with a source id when it connects or disconnects. */
  readonly onDidChangeState = this.states.event;

  constructor(private readonly store: DataSourceStore) {}

  /** Whether a session is open on any database of the source. */
  isConnected(id: string): boolean {
    return [...this.sessions.keys()].some((key) => key.startsWith(`${id}/`));
  }

  private client(source: DataSource): Promise<Client> {
    const key = sessionKey(source);
    let session = this.sessions.get(key);
    if (!session) {
      session = (async () => {
        const client = await openClient(source, await this.store.password(source.id));
        client.on('notice', (n) => this.notices.fire({ sourceId: source.id, message: `${n.severity ?? 'NOTICE'}: ${n.message}` }));
        client.on('error', () => void this.disconnectSession(key));
        client.on('end', () => {
          this.sessions.delete(key);
          this.states.fire(source.id);
        });
        if (source.readOnly) {
          // Enforced by the server: every transaction of this session is read-only.
          await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
        }
        return client;
      })();
      this.sessions.set(key, session);
      session.then(
        () => this.states.fire(source.id),
        () => this.sessions.delete(key),
      );
    }
    return session;
  }

  /**
   * Runs one statement; `schema` becomes the search path first (the file's schema selector).
   * `rawText` returns every value as PostgreSQL's text output (the table editor writes it back).
   */
  async query(source: DataSource, sql: string, schema?: string, values?: unknown[], rawText = false): Promise<QueryResult> {
    const client = await this.client(source);
    if (schema) {
      await client.query(`SET search_path TO ${schema.split(',').map((s) => `"${s.trim().replace(/"/g, '""')}"`).join(', ')}, public`);
    }
    const started = Date.now();
    const result = (await client.query({ text: sql, values, rowMode: 'array', ...(rawText && { types: RAW_TEXT }) })) as QueryArrayResult | QueryArrayResult[];
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

  /**
   * Runs statements in one transaction: all or nothing. A statement marked `expectOneRow` that
   * changes another number of rows rolls everything back.
   */
  async transaction(source: DataSource, statements: readonly { text: string; values: unknown[]; expectOneRow: boolean }[]): Promise<number> {
    const client = await this.client(source);
    await client.query('BEGIN');
    try {
      let changed = 0;
      for (const statement of statements) {
        const result = await client.query(statement.text, statement.values);
        if (statement.expectOneRow && result.rowCount !== 1) {
          throw new Error(`${t('{0} rows matched instead of 1: the row was changed or deleted meanwhile. Nothing was saved.', result.rowCount ?? 0)}\n${statement.text}`);
        }
        changed += result.rowCount ?? 0;
      }
      await client.query('COMMIT');
      return changed;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }

  /** Cancels the running statement of a source from a second connection (pg_cancel_backend). */
  async cancel(source: DataSource): Promise<void> {
    const session = this.sessions.get(sessionKey(source));
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

  /** Closes every session of the source (all its databases). */
  async disconnect(id: string): Promise<void> {
    await Promise.all([...this.sessions.keys()].filter((key) => key.startsWith(`${id}/`)).map((key) => this.disconnectSession(key)));
  }

  private async disconnectSession(key: string): Promise<void> {
    const session = this.sessions.get(key);
    this.sessions.delete(key);
    if (session) {
      await session.then((c) => c.end()).catch(() => undefined);
      this.states.fire(key.slice(0, key.indexOf('/')));
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
    for (const key of [...this.sessions.keys()]) {
      void this.disconnectSession(key);
    }
    this.notices.dispose();
    this.states.dispose();
  }
}
