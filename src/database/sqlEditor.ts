import * as vscode from 'vscode';
import { t } from '../i18n/i18n';
import { Connections, DataSourceStore } from './connections';
import { COLOR_VALUES, DataSource, describeSource } from './dataSourceLogic';
import { ResultsView } from './resultsView';
import { isModification, isUnsafeModification, splitStatements, Statement, statementAt } from './sqlLogic';

const ATTACH_KEY = 'database.attachedFiles';

interface Attachment {
  sourceId: string;
  schema?: string;
}

const isSql = (document: vscode.TextDocument | undefined): document is vscode.TextDocument => !!document && (document.languageId === 'sql' || /\.(sql|pgsql|psql)$/i.test(document.fileName));

/**
 * SQL files and consoles attached to a data source, like IntelliJ: source › schema selector,
 * Ctrl+Enter runs the statement at the caret, ▶ in the gutter on each statement, results in the
 * bottom panel, editor tinted with the source color, manual transactions.
 */
export class SqlEditor implements vscode.Disposable {
  private readonly selector: vscode.StatusBarItem;
  private readonly transaction: vscode.StatusBarItem;
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('unintellij-sql');
  private readonly tints = new Map<string, vscode.TextEditorDecorationType>();
  private readonly controller = vscode.tests.createTestController('unintellij.sql', 'SQL');
  private readonly statementsOf = new WeakMap<vscode.TestItem, { uri: vscode.Uri; statement: Statement }>();
  /** Sources in manual-commit mode, and those with an open transaction. */
  private readonly manual = new Set<string>();
  private readonly inTransaction = new Set<string>();
  private readonly completionCache = new Map<string, Promise<vscode.CompletionItem[]>>();
  private readonly disposables: vscode.Disposable[] = [];
  private gutterTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly state: vscode.Memento,
    private readonly store: DataSourceStore,
    private readonly connections: Connections,
    private readonly results: ResultsView,
  ) {
    this.selector = vscode.window.createStatusBarItem('unintellij.database.source', vscode.StatusBarAlignment.Right, 1000);
    this.selector.name = t('SQL Data Source');
    this.selector.command = 'unintellij.database.selectSource';
    this.transaction = vscode.window.createStatusBarItem('unintellij.database.transaction', vscode.StatusBarAlignment.Right, 999);
    this.transaction.name = t('Transaction Mode');
    this.transaction.command = 'unintellij.database.toggleAutoCommit';
    this.controller.createRunProfile(t('Run'), vscode.TestRunProfileKind.Run, (request) => this.runFromGutter(request), true);
    this.disposables.push(
      this.selector,
      this.transaction,
      this.diagnostics,
      this.controller,
      vscode.window.onDidChangeActiveTextEditor(() => this.update()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.tintEditors()),
      vscode.workspace.onDidOpenTextDocument((d) => this.scheduleGutter(d)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        this.diagnostics.delete(e.document.uri);
        this.scheduleGutter(e.document);
      }),
      vscode.workspace.onDidCloseTextDocument((d) => this.controller.items.delete(d.uri.toString())),
      store.onDidChange(() => {
        this.completionCache.clear();
        this.update();
      }),
      vscode.languages.registerCompletionItemProvider({ language: 'sql' }, { provideCompletionItems: (d) => this.complete(d) }, '.'),
      vscode.commands.registerCommand('unintellij.database.selectSource', () => this.selectSource()),
      vscode.commands.registerCommand('unintellij.database.execute', () => this.executeAtCaret()),
      vscode.commands.registerCommand('unintellij.database.executeFile', () => this.executeFile()),
      vscode.commands.registerCommand('unintellij.database.cancel', () => this.cancel()),
      vscode.commands.registerCommand('unintellij.database.toggleAutoCommit', () => this.toggleAutoCommit()),
      vscode.commands.registerCommand('unintellij.database.commit', () => this.endTransaction('COMMIT')),
      vscode.commands.registerCommand('unintellij.database.rollback', () => this.endTransaction('ROLLBACK')),
    );
    vscode.workspace.textDocuments.forEach((d) => this.scheduleGutter(d, 0));
    this.update();
  }

  // --- Attachment ------------------------------------------------------------------------------

  private attachments(): Record<string, Attachment> {
    return this.state.get<Record<string, Attachment>>(ATTACH_KEY, {});
  }

  attachment(uri: vscode.Uri): { source: DataSource; schema?: string } | undefined {
    const a = this.attachments()[uri.toString()];
    const source = a && this.store.get(a.sourceId);
    return source ? { source, schema: a.schema } : undefined;
  }

  async attach(uri: vscode.Uri, sourceId: string, schema?: string): Promise<void> {
    await this.state.update(ATTACH_KEY, { ...this.attachments(), [uri.toString()]: { sourceId, schema } });
    this.completionCache.clear();
    this.update();
  }

  /** IntelliJ's "New Console": an untitled SQL editor already attached to the source. */
  async newConsole(source: DataSource, schema?: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument({ language: 'sql', content: '' });
    await this.attach(document.uri, source.id, schema);
    await vscode.window.showTextDocument(document);
  }

  private async selectSource(): Promise<void> {
    const document = vscode.window.activeTextEditor?.document;
    if (!isSql(document)) {
      return;
    }
    const sources = this.store.all;
    if (sources.length === 0) {
      const add = t('Add Data Source…');
      if ((await vscode.window.showInformationMessage(t('No PostgreSQL data source yet.'), add)) === add) {
        await vscode.commands.executeCommand('unintellij.database.addSource');
      }
      return;
    }
    const current = this.attachment(document.uri);
    const source = await vscode.window.showQuickPick(
      sources.map((s) => ({ label: `$(database) ${s.name}`, description: describeSource(s), picked: s.id === current?.source.id, source: s })),
      { title: t('Data Source for {0}', vscode.workspace.asRelativePath(document.uri)), placeHolder: t('Choose the data source') },
    );
    if (!source) {
      return;
    }
    let schemas: string[] = [];
    try {
      schemas = (await this.connections.query(source.source, `SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY 1`)).rows.map((r) => String(r[0]));
    } catch (error) {
      void vscode.window.showErrorMessage(t('Cannot connect to {0}: {1}', source.source.name, error instanceof Error ? error.message : String(error)));
    }
    const schema =
      schemas.length > 0
        ? await vscode.window.showQuickPick(
            schemas.map((s) => ({ label: s, picked: s === (current?.schema ?? 'public') })),
            { title: t('Schema'), placeHolder: t('Choose the default schema (search_path)') },
          )
        : undefined;
    await this.attach(document.uri, source.source.id, schema?.label);
  }

  // --- UI state --------------------------------------------------------------------------------

  private update(): void {
    const document = vscode.window.activeTextEditor?.document;
    if (!isSql(document)) {
      this.selector.hide();
      this.transaction.hide();
      void vscode.commands.executeCommand('setContext', 'unintellij.sqlAttached', false);
      this.tintEditors();
      return;
    }
    const attached = this.attachment(document.uri);
    this.selector.text = attached ? `$(database) ${attached.source.name}${attached.schema ? ` › ${attached.schema}` : ''} $(chevron-down)` : `$(database) ${t('<no data source>')}`;
    this.selector.tooltip = attached ? `${describeSource(attached.source)}\n${t('Click to change the data source or schema')}` : t('Choose a data source to run this file');
    this.selector.backgroundColor = attached ? undefined : new vscode.ThemeColor('statusBarItem.warningBackground');
    this.selector.show();
    if (attached) {
      const manual = this.manual.has(attached.source.id);
      this.transaction.text = manual ? `$(git-commit) ${t('Tx: Manual')}` : `${t('Tx: Auto')}`;
      this.transaction.tooltip = manual ? t('Manual commit: use Commit / Rollback. Click for auto-commit.') : t('Auto-commit. Click for manual commit.');
      this.transaction.show();
    } else {
      this.transaction.hide();
    }
    void vscode.commands.executeCommand('setContext', 'unintellij.sqlAttached', !!attached);
    this.tintEditors();
  }

  /** IntelliJ tints editors of colored data sources (red production…). */
  private tintEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const attached = isSql(editor.document) ? this.attachment(editor.document.uri) : undefined;
      for (const [color, type] of this.tints) {
        if (!attached || attached.source.color !== color) {
          editor.setDecorations(type, []);
        }
      }
      if (attached && attached.source.color !== 'none') {
        const color = attached.source.color;
        let type = this.tints.get(color);
        if (!type) {
          type = vscode.window.createTextEditorDecorationType({ backgroundColor: `${COLOR_VALUES[color]}14`, isWholeLine: true });
          this.tints.set(color, type);
        }
        editor.setDecorations(type, [new vscode.Range(0, 0, editor.document.lineCount, 0)]);
      }
    }
  }

  // --- Execution -------------------------------------------------------------------------------

  private async target(document: vscode.TextDocument): Promise<{ source: DataSource; schema?: string } | undefined> {
    let attached = this.attachment(document.uri);
    if (!attached) {
      await this.selectSource();
      attached = this.attachment(document.uri);
    }
    return attached;
  }

  private async executeAtCaret(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isSql(editor.document)) {
      return;
    }
    const document = editor.document;
    const text = document.getText();
    const selection = editor.selection;
    const statement: Statement | undefined = selection.isEmpty
      ? statementAt(text, document.offsetAt(selection.active))
      : { text: document.getText(selection).trim(), start: document.offsetAt(selection.start), end: document.offsetAt(selection.end) };
    if (statement?.text) {
      await this.executeStatements(document, selection.isEmpty ? [statement] : splitStatements(statement.text).map((s) => ({ ...s, start: s.start + statement.start, end: s.end + statement.start })));
    }
  }

  private async executeFile(): Promise<void> {
    const document = vscode.window.activeTextEditor?.document;
    if (isSql(document)) {
      await this.executeStatements(document, splitStatements(document.getText()));
    }
  }

  private async executeStatements(document: vscode.TextDocument, statements: Statement[]): Promise<boolean> {
    const target = await this.target(document);
    if (!target || statements.length === 0) {
      return false;
    }
    this.diagnostics.delete(document.uri);
    for (const statement of statements) {
      if (target.source.readOnly && isModification(statement.text)) {
        void vscode.window.showErrorMessage(t('{0} is read-only: this statement modifies data.', target.source.name));
        return false;
      }
      if (isUnsafeModification(statement.text)) {
        const run = t('Execute');
        const answer = await vscode.window.showWarningMessage(t('Unsafe query: {0} without WHERE modifies every row. Execute anyway?', statement.text.trim().split(/\s+/)[0].toUpperCase()), { modal: true }, run);
        if (answer !== run) {
          return false;
        }
      }
      try {
        if (this.manual.has(target.source.id) && !this.inTransaction.has(target.source.id)) {
          await this.connections.query(target.source, 'BEGIN');
          this.inTransaction.add(target.source.id);
        }
        await this.results.run(target.source, statement.text, target.schema);
      } catch (error) {
        this.reportError(document, statement, error);
        return false;
      }
    }
    return true;
  }

  /** Puts the server error on the failing statement (PostgreSQL gives a 1-based character position). */
  private reportError(document: vscode.TextDocument, statement: Statement, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const position = Number((error as { position?: string }).position);
    const startOffset = statement.start + (Number.isFinite(position) && position > 0 ? position - 1 : 0);
    const start = document.positionAt(startOffset);
    const range = Number.isFinite(position) && position > 0 ? document.getWordRangeAtPosition(start) ?? new vscode.Range(start, start.translate(0, 1)) : new vscode.Range(document.positionAt(statement.start), document.positionAt(statement.end));
    this.diagnostics.set(document.uri, [new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error)]);
  }

  private async cancel(): Promise<void> {
    const document = vscode.window.activeTextEditor?.document;
    const attached = document && this.attachment(document.uri);
    if (attached) {
      await this.connections.cancel(attached.source);
    }
  }

  private async toggleAutoCommit(): Promise<void> {
    const document = vscode.window.activeTextEditor?.document;
    const attached = document && this.attachment(document.uri);
    if (!attached) {
      return;
    }
    const id = attached.source.id;
    if (this.manual.has(id)) {
      if (this.inTransaction.has(id)) {
        const commit = t('Commit');
        const rollback = t('Rollback');
        const answer = await vscode.window.showWarningMessage(t('A transaction is open on {0}.', attached.source.name), { modal: true }, commit, rollback);
        if (!answer) {
          return;
        }
        await this.endTransaction(answer === commit ? 'COMMIT' : 'ROLLBACK');
      }
      this.manual.delete(id);
    } else {
      this.manual.add(id);
    }
    this.update();
  }

  private async endTransaction(command: 'COMMIT' | 'ROLLBACK'): Promise<void> {
    const document = vscode.window.activeTextEditor?.document;
    const attached = document && this.attachment(document.uri);
    if (!attached || !this.inTransaction.has(attached.source.id)) {
      vscode.window.setStatusBarMessage(t('No open transaction'), 2000);
      return;
    }
    await this.connections.query(attached.source, command);
    this.inTransaction.delete(attached.source.id);
    vscode.window.setStatusBarMessage(command === 'COMMIT' ? t('Transaction committed') : t('Transaction rolled back'), 3000);
  }

  // --- Gutter ▶ (Testing API, see GutterRunner) -------------------------------------------------

  private scheduleGutter(document: vscode.TextDocument, delay = 400): void {
    if (!isSql(document)) {
      return;
    }
    clearTimeout(this.gutterTimer);
    this.gutterTimer = setTimeout(() => {
      const id = document.uri.toString();
      const statements = splitStatements(document.getText());
      if (statements.length === 0) {
        this.controller.items.delete(id);
        return;
      }
      const root = this.controller.items.get(id) ?? this.controller.createTestItem(id, vscode.workspace.asRelativePath(document.uri), document.uri);
      root.children.replace(
        statements.map((statement, i) => {
          const item = this.controller.createTestItem(`${id}#${i}`, statement.text.split('\n')[0].slice(0, 60), document.uri);
          const start = document.positionAt(statement.start);
          item.range = new vscode.Range(start, start);
          this.statementsOf.set(item, { uri: document.uri, statement });
          return item;
        }),
      );
      this.controller.items.add(root);
    }, delay);
  }

  private async runFromGutter(request: vscode.TestRunRequest): Promise<void> {
    const run = this.controller.createTestRun(request, undefined, false);
    for (const item of request.include ?? []) {
      const target = this.statementsOf.get(item);
      if (!target) {
        continue;
      }
      const document = await vscode.workspace.openTextDocument(target.uri);
      run.started(item);
      const ok = await this.executeStatements(document, [target.statement]);
      if (ok) {
        run.passed(item);
      } else {
        run.failed(item, new vscode.TestMessage(t('Statement failed, see the Database results.')));
      }
    }
    run.end();
  }

  // --- Completion ------------------------------------------------------------------------------

  private complete(document: vscode.TextDocument): Thenable<vscode.CompletionItem[]> | vscode.CompletionItem[] {
    const attached = this.attachment(document.uri);
    if (!attached) {
      return [];
    }
    const key = `${attached.source.id}|${attached.schema ?? 'public'}`;
    let items = this.completionCache.get(key);
    if (!items) {
      items = this.connections
        .query(
          attached.source,
          `SELECT c.table_name, c.column_name, c.data_type, t.table_type FROM information_schema.columns c
             JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
            WHERE c.table_schema = $1 ORDER BY c.table_name, c.ordinal_position`,
          undefined,
          [attached.schema ?? 'public'],
        )
        .then((r) => {
          const tables = new Map<string, string>();
          const result: vscode.CompletionItem[] = [];
          for (const [table, column, type, tableType] of r.rows as string[][]) {
            if (!tables.has(table)) {
              tables.set(table, tableType);
              const item = new vscode.CompletionItem(table, tableType === 'VIEW' ? vscode.CompletionItemKind.Interface : vscode.CompletionItemKind.Struct);
              item.detail = tableType === 'VIEW' ? t('view') : t('table');
              result.push(item);
            }
            const item = new vscode.CompletionItem({ label: column, description: `${table} · ${type}` }, vscode.CompletionItemKind.Field);
            result.push(item);
          }
          return result;
        })
        .catch(() => []);
      this.completionCache.set(key, items);
    }
    return items;
  }

  dispose(): void {
    clearTimeout(this.gutterTimer);
    this.tints.forEach((d) => d.dispose());
    this.disposables.forEach((d) => d.dispose());
  }
}
