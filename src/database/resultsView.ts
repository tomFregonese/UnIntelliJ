import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { language, t } from '../i18n/i18n';
import { Connections, QueryResult } from './connections';
import { COLOR_VALUES, DataSource } from './dataSourceLogic';
import type { FromResultsWebview, ResultTab, ToResultsWebview } from './resultsProtocol';
import { formatValue, quoteIdent, toCsv } from './sqlLogic';

/** Rows shown in a grid (IntelliJ also fetches the first 500 rows). */
export const MAX_ROWS = 500;

interface TabState {
  tab: ResultTab;
  source: DataSource;
  schema?: string;
  /** Raw values of the shown rows, for CSV export and copy. */
  raw: unknown[][];
  /** For table data tabs. */
  table?: { schema: string; name: string };
}

/** Bottom panel with one tab per executed query, like IntelliJ's Services › Database results. */
export class ResultsView implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'unintellij.dbResults';
  private view: vscode.WebviewView | undefined;
  private readonly tabs: TabState[] = [];
  private active: string | undefined;
  private counter = 0;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly connections: Connections,
  ) {
    this.disposables.push(
      vscode.window.registerWebviewViewProvider(ResultsView.viewId, this, { webviewOptions: { retainContextWhenHidden: true } }),
      connections.onNotice(({ sourceId, message }) => {
        const tab = [...this.tabs].reverse().find((s) => s.source.id === sourceId && s.tab.running) ?? [...this.tabs].reverse().find((s) => s.source.id === sourceId);
        if (tab) {
          tab.tab.notices.push(message);
          this.post();
        }
      }),
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist'), vscode.Uri.joinPath(this.extensionUri, 'media')] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((m: FromResultsWebview) => void this.onMessage(m));
    view.onDidDispose(() => (this.view = undefined));
  }

  private post(): void {
    void this.view?.webview.postMessage({ type: 'model', model: { tabs: this.tabs.map((s) => s.tab), active: this.active } } satisfies ToResultsWebview);
  }

  private async reveal(): Promise<void> {
    await vscode.commands.executeCommand(`${ResultsView.viewId}.focus`, { preserveFocus: true });
  }

  /** Runs `sql` on `source` in a new tab (or `reuse`), resolves with the result or rejects with the server error. */
  async run(source: DataSource, sql: string, schema?: string, title?: string): Promise<QueryResult> {
    const state = this.newTab(source, sql, schema, title ?? firstLine(sql));
    return this.execute(state);
  }

  /** IntelliJ's table editor (double-click on a table): first page, filter and sort server side. */
  async openTable(source: DataSource, schema: string, name: string): Promise<void> {
    const state = this.newTab(source, '', schema, name);
    state.table = { schema, name };
    state.tab.table = { where: '', orderBy: '', page: 0, pageSize: MAX_ROWS };
    state.tab.sql = this.tableSql(state);
    await this.execute(state).catch(() => undefined);
  }

  private tableSql(state: TabState): string {
    const table = state.tab.table!;
    const name = `${quoteIdent(state.table!.schema)}.${quoteIdent(state.table!.name)}`;
    return `SELECT * FROM ${name}${table.where.trim() ? ` WHERE ${table.where}` : ''}${table.orderBy.trim() ? ` ORDER BY ${table.orderBy}` : ''} LIMIT ${table.pageSize + 1} OFFSET ${table.page * table.pageSize}`;
  }

  private newTab(source: DataSource, sql: string, schema: string | undefined, title: string): TabState {
    const id = `r${++this.counter}`;
    const state: TabState = {
      source,
      schema,
      raw: [],
      tab: {
        id,
        title,
        source: source.name,
        color: source.color !== 'none' ? COLOR_VALUES[source.color] : undefined,
        sql,
        columns: [],
        rows: [],
        rowCount: null,
        truncated: false,
        command: '',
        durationMs: 0,
        notices: [],
        running: true,
      },
    };
    this.tabs.push(state);
    // IntelliJ keeps a bounded number of result tabs.
    while (this.tabs.length > 20) {
      this.tabs.shift();
    }
    this.active = id;
    return state;
  }

  private async execute(state: TabState): Promise<QueryResult> {
    const tab = state.tab;
    tab.running = true;
    tab.error = undefined;
    this.post();
    void this.reveal();
    try {
      const result = await this.connections.query(state.source, tab.sql, state.schema);
      const limit = tab.table ? tab.table.pageSize : MAX_ROWS;
      state.raw = result.rows.slice(0, limit);
      tab.columns = result.columns;
      tab.rows = state.raw.map((r) => r.map(formatValue));
      tab.truncated = result.rows.length > limit;
      tab.rowCount = result.rowCount;
      tab.command = result.command;
      tab.durationMs = result.durationMs;
      return result;
    } catch (error) {
      tab.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      tab.running = false;
      this.post();
    }
  }

  private find(id: string): TabState | undefined {
    return this.tabs.find((s) => s.tab.id === id);
  }

  private async onMessage(message: FromResultsWebview): Promise<void> {
    const state = 'id' in message ? this.find(message.id) : undefined;
    switch (message.type) {
      case 'ready':
        this.post();
        break;
      case 'select':
        this.active = message.id;
        break;
      case 'close': {
        const index = this.tabs.findIndex((s) => s.tab.id === message.id);
        if (index >= 0) {
          this.tabs.splice(index, 1);
          this.active = this.tabs[Math.min(index, this.tabs.length - 1)]?.tab.id;
          this.post();
        }
        break;
      }
      case 'exportCsv': {
        if (!state) {
          return;
        }
        const target = await vscode.window.showSaveDialog({ filters: { CSV: ['csv'] }, defaultUri: vscode.Uri.file(`${state.tab.title.replace(/[^\w.-]+/g, '_') || 'result'}.csv`) });
        if (target) {
          await vscode.workspace.fs.writeFile(target, Buffer.from(toCsv(state.tab.columns, state.raw), 'utf8'));
          vscode.window.setStatusBarMessage(t('{0} rows exported to {1}', state.raw.length, vscode.workspace.asRelativePath(target)), 3000);
        }
        break;
      }
      case 'copy':
        if (state) {
          // Tab-separated, pasteable in a spreadsheet like IntelliJ's "Copy" of a selection.
          await vscode.env.clipboard.writeText([state.tab.columns.join('\t'), ...state.tab.rows.map((r) => r.join('\t'))].join('\n'));
          vscode.window.setStatusBarMessage(t('{0} rows copied', state.tab.rows.length), 2000);
        }
        break;
      case 'rerun':
        if (state) {
          await this.execute(state).catch(() => undefined);
        }
        break;
      case 'cancel':
        if (state) {
          await this.connections.cancel(state.source);
        }
        break;
      case 'table':
        if (state?.tab.table) {
          state.tab.table = { ...state.tab.table, where: message.where, orderBy: message.orderBy, page: Math.max(0, message.page) };
          state.tab.sql = this.tableSql(state);
          await this.execute(state).catch(() => undefined);
        }
        break;
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const uri = (...segments: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...segments));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('media', 'product-icons.css')}">
<link rel="stylesheet" href="${uri('media', 'results.css')}">
</head>
<body data-lang="${language()}">
<div id="app"></div>
<script nonce="${nonce}" src="${uri('dist', 'webview', 'results.js')}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

function firstLine(sql: string): string {
  const line = sql.replace(/--[^\n]*\n/g, '').trim().split('\n')[0];
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}
