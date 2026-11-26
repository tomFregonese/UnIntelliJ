import * as vscode from 'vscode';
import { t } from '../i18n/i18n';
import { Connections, DataSourceStore } from './connections';
import { COLOR_VALUES, DataSource, describeSource, inDatabase, shownDatabases, visibleSchemas } from './dataSourceLogic';

type Folder = 'tables' | 'views' | 'functions' | 'sequences' | 'keys' | 'indexes';

/** Nodes under a database carry the source moved to that database (`inDatabase`). */
export type DbNode =
  | { kind: 'source'; source: DataSource }
  | { kind: 'database'; source: DataSource }
  | { kind: 'schema'; source: DataSource; schema: string }
  | { kind: 'folder'; source: DataSource; schema: string; folder: Folder; table?: string }
  | { kind: 'table'; source: DataSource; schema: string; name: string; view: boolean }
  | { kind: 'leaf'; source: DataSource; label: string; description?: string; icon: string; tooltip?: string; schema?: string; name?: string }
  | { kind: 'error'; message: string };

const FOLDER_LABELS: Record<Folder, string> = { tables: 'tables', views: 'views', functions: 'routines', sequences: 'sequences', keys: 'keys', indexes: 'indexes' };

/** IntelliJ's Database tool window: data source › database › schema › tables / views / routines / sequences › columns, keys, indexes. */
export class DatabaseView implements vscode.TreeDataProvider<DbNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<DbNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  readonly view: vscode.TreeView<DbNode>;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: DataSourceStore,
    private readonly connections: Connections,
  ) {
    this.view = vscode.window.createTreeView('unintellij.database', { treeDataProvider: this, showCollapseAll: true, canSelectMany: false });
    this.disposables.push(this.view, this.changed, store.onDidChange(() => this.refresh()), connections.onDidChangeState(() => this.refresh()));
  }

  refresh(): void {
    this.changed.fire(undefined);
  }

  icon(name: string): { light: vscode.Uri; dark: vscode.Uri } {
    const file = (theme: string) => vscode.Uri.joinPath(this.extensionUri, 'media', 'database', `${name}-${theme}.svg`);
    return { light: file('light'), dark: file('dark') };
  }

  getTreeItem(node: DbNode): vscode.TreeItem {
    const collapsed = vscode.TreeItemCollapsibleState.Collapsed;
    switch (node.kind) {
      case 'source': {
        const item = new vscode.TreeItem(node.source.name, collapsed);
        item.description = describeSource(node.source) + (node.source.readOnly ? ` · ${t('read-only')}` : '');
        item.iconPath = this.icon('database');
        item.contextValue = this.connections.isConnected(node.source.id) ? 'source connected' : 'source';
        item.tooltip = new vscode.MarkdownString(`**${node.source.name}**  \n${describeSource(node.source)}${node.source.color !== 'none' ? `  \n<span style="color:${COLOR_VALUES[node.source.color]}">■</span> ${t(node.source.color)}` : ''}`);
        item.tooltip.supportHtml = true;
        item.id = `source:${node.source.id}`;
        return item;
      }
      case 'database': {
        const item = new vscode.TreeItem(node.source.database, collapsed);
        item.iconPath = this.icon('database');
        const filter = visibleSchemas(node.source);
        item.description = filter ? (filter.length === 1 ? t('1 schema') : t('{0} schemas', filter.length)) : undefined;
        item.tooltip = t('Right-click › Choose Schemas… to pick the schemas shown');
        item.contextValue = 'database';
        item.id = `database:${node.source.id}:${node.source.database}`;
        return item;
      }
      case 'schema': {
        const item = new vscode.TreeItem(node.schema, collapsed);
        item.iconPath = this.icon('dataSchema');
        item.contextValue = 'schema';
        item.id = `schema:${node.source.id}:${node.source.database}:${node.schema}`;
        return item;
      }
      case 'folder': {
        const item = new vscode.TreeItem(t(FOLDER_LABELS[node.folder]), collapsed);
        item.iconPath = this.icon(node.folder === 'functions' ? 'function' : node.folder === 'sequences' ? 'sequence' : node.folder === 'keys' ? 'key' : node.folder === 'indexes' ? 'index' : 'dataTables');
        item.contextValue = 'folder';
        item.id = `folder:${node.source.id}:${node.source.database}:${node.schema}:${node.table ?? ''}:${node.folder}`;
        return item;
      }
      case 'table': {
        const item = new vscode.TreeItem(node.name, collapsed);
        item.iconPath = this.icon(node.view ? 'view' : 'table');
        item.contextValue = 'table';
        // Double-click opens the table data (see unintellij.database.click).
        item.command = { command: 'unintellij.database.click', title: t('Open Table Data'), arguments: [node] };
        item.id = `table:${node.source.id}:${node.source.database}:${node.schema}:${node.name}`;
        return item;
      }
      case 'leaf': {
        const item = new vscode.TreeItem(node.label);
        item.description = node.description;
        item.iconPath = this.icon(node.icon);
        item.tooltip = node.tooltip;
        item.contextValue = node.icon;
        return item;
      }
      case 'error': {
        const item = new vscode.TreeItem(node.message);
        item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
        return item;
      }
    }
  }

  async getChildren(node?: DbNode): Promise<DbNode[]> {
    if (!node) {
      return this.store.all.map((source) => ({ kind: 'source', source }));
    }
    try {
      return await this.children(node);
    } catch (error) {
      return [{ kind: 'error', message: error instanceof Error ? error.message : String(error) }];
    }
  }

  private async rows(source: DataSource, sql: string, values: unknown[] = []): Promise<unknown[][]> {
    return (await this.connections.query(source, sql, undefined, values)).rows;
  }

  /** Non-system schemas of the source's database, public first. */
  async schemas(source: DataSource): Promise<string[]> {
    const rows = await this.rows(source, `SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY nspname = 'public' DESC, nspname`);
    return rows.map((r) => String(r[0]));
  }

  /** Databases of the server that accept connections (templates excluded). */
  async databases(source: DataSource): Promise<string[]> {
    const rows = await this.rows(source, 'SELECT datname FROM pg_database WHERE NOT datistemplate AND datallowconn ORDER BY datname');
    return rows.map((r) => String(r[0]));
  }

  private async children(node: DbNode): Promise<DbNode[]> {
    switch (node.kind) {
      case 'source':
        return shownDatabases(node.source).map((database) => ({ kind: 'database', source: inDatabase(node.source, database) }));
      case 'database': {
        const filter = visibleSchemas(node.source);
        const schemas = await this.schemas(node.source);
        return schemas.filter((s) => !filter || filter.includes(s)).map((schema) => ({ kind: 'schema', source: node.source, schema }));
      }
      case 'schema':
        return (['tables', 'views', 'functions', 'sequences'] as const).map((folder) => ({ kind: 'folder', source: node.source, schema: node.schema, folder }));
      case 'folder':
        return this.folderChildren(node);
      case 'table': {
        const columns = await this.rows(
          node.source,
          `SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
                  EXISTS (SELECT 1 FROM information_schema.key_column_usage k JOIN information_schema.table_constraints tc
                          ON tc.constraint_name = k.constraint_name AND tc.table_schema = k.table_schema
                          WHERE tc.constraint_type = 'PRIMARY KEY' AND k.table_schema = c.table_schema AND k.table_name = c.table_name AND k.column_name = c.column_name)
             FROM information_schema.columns c WHERE c.table_schema = $1 AND c.table_name = $2 ORDER BY c.ordinal_position`,
          [node.schema, node.name],
        );
        const leaves: DbNode[] = columns.map((r) => ({
          kind: 'leaf',
          source: node.source,
          label: String(r[0]),
          description: `${String(r[1])}${r[2] === 'NO' ? ` ${t('not null')}` : ''}${r[3] ? ` = ${String(r[3])}` : ''}`,
          icon: r[4] ? 'key' : 'dataColumn',
        }));
        if (!node.view) {
          leaves.push({ kind: 'folder', source: node.source, schema: node.schema, folder: 'keys', table: node.name }, { kind: 'folder', source: node.source, schema: node.schema, folder: 'indexes', table: node.name });
        }
        return leaves;
      }
      default:
        return [];
    }
  }

  private async folderChildren(node: Extract<DbNode, { kind: 'folder' }>): Promise<DbNode[]> {
    const { source, schema } = node;
    switch (node.folder) {
      case 'tables':
      case 'views': {
        const types = node.folder === 'tables' ? `('BASE TABLE', 'FOREIGN', 'LOCAL TEMPORARY')` : `('VIEW')`;
        const rows = await this.rows(source, `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type IN ${types} ORDER BY table_name`, [schema]);
        const matviews = node.folder === 'views' ? await this.rows(source, 'SELECT matviewname FROM pg_matviews WHERE schemaname = $1 ORDER BY 1', [schema]) : [];
        return [...rows, ...matviews].map((r) => ({ kind: 'table', source, schema, name: String(r[0]), view: node.folder === 'views' }));
      }
      case 'functions': {
        const rows = await this.rows(
          source,
          `SELECT p.proname, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid)
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = $1 AND p.prokind IN ('f', 'p') ORDER BY 1, 2`,
          [schema],
        );
        return rows.map((r) => ({ kind: 'leaf', source, label: `${String(r[0])}(${String(r[1])})`, description: r[2] ? `: ${String(r[2])}` : t('procedure'), icon: 'function' }));
      }
      case 'sequences': {
        const rows = await this.rows(source, 'SELECT sequence_name, data_type FROM information_schema.sequences WHERE sequence_schema = $1 ORDER BY 1', [schema]);
        return rows.map((r) => ({ kind: 'leaf', source, label: String(r[0]), description: String(r[1]), icon: 'sequence' }));
      }
      case 'keys': {
        const rows = await this.rows(
          source,
          `SELECT conname, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = $1 AND t.relname = $2 AND c.contype IN ('p', 'f', 'u') ORDER BY c.contype, conname`,
          [schema, node.table],
        );
        return rows.map((r) => ({ kind: 'leaf', source, label: String(r[0]), description: String(r[1]), icon: 'key', tooltip: String(r[1]) }));
      }
      case 'indexes': {
        const rows = await this.rows(source, 'SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY 1', [schema, node.table]);
        return rows.map((r) => ({ kind: 'leaf', source, label: String(r[0]), description: String(r[1]).replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ USING /, '$1'), icon: 'index', tooltip: String(r[1]) }));
      }
    }
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
