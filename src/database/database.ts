import * as vscode from 'vscode';
import { t } from '../i18n/i18n';
import { Connections, DataSourceStore } from './connections';
import { DataSourcesPanel } from './dataSourcesPanel';
import { DatabaseView, DbNode } from './databaseView';
import { ResultsView } from './resultsView';
import { SqlEditor } from './sqlEditor';
import { quoteIdent } from './sqlLogic';

/** PostgreSQL support (IntelliJ's Database tool window, data sources, SQL consoles, results). */
export function registerDatabase(context: vscode.ExtensionContext): vscode.Disposable[] {
  const store = new DataSourceStore(context.globalState, context.secrets);
  const connections = new Connections(store);
  const panel = new DataSourcesPanel(context.extensionUri, store);
  const view = new DatabaseView(context.extensionUri, store, connections);
  const results = new ResultsView(context.extensionUri, connections);
  const sql = new SqlEditor(context.workspaceState, store, connections, results);
  const selectedSource = (node?: DbNode) => (node && 'source' in node ? node.source : view.view.selection.find((n): n is Extract<DbNode, { source: unknown }> => 'source' in n)?.source);
  return [
    store,
    connections,
    panel,
    view,
    results,
    sql,
    vscode.commands.registerCommand('unintellij.database.addSource', () => panel.show(undefined, true)),
    vscode.commands.registerCommand('unintellij.database.editSources', (node?: DbNode) => panel.show(selectedSource(node)?.id)),
    vscode.commands.registerCommand('unintellij.database.refresh', () => view.refresh()),
    vscode.commands.registerCommand('unintellij.database.disconnect', async (node?: DbNode) => {
      const source = selectedSource(node);
      if (source) {
        await connections.disconnect(source.id);
      } else {
        await Promise.all(store.all.map((s) => connections.disconnect(s.id)));
      }
    }),
    vscode.commands.registerCommand('unintellij.database.newConsole', async (node?: DbNode) => {
      const source = selectedSource(node) ?? (store.all.length === 1 ? store.all[0] : undefined);
      if (!source) {
        void vscode.window.showInformationMessage(t('Select a data source in the Database tool window first.'));
        return;
      }
      await sql.newConsole(source, node && 'schema' in node ? node.schema : undefined);
    }),
    vscode.commands.registerCommand('unintellij.database.openTable', async (node?: DbNode) => {
      if (node?.kind === 'table') {
        await results.openTable(node.source, node.schema, node.name);
      }
    }),
    vscode.commands.registerCommand('unintellij.database.copyName', async (node?: DbNode) => {
      const name = node?.kind === 'table' ? `${quoteIdent(node.schema)}.${quoteIdent(node.name)}` : node?.kind === 'schema' ? quoteIdent(node.schema) : node?.kind === 'leaf' ? node.label : undefined;
      if (name) {
        await vscode.env.clipboard.writeText(name);
      }
    }),
  ];
}
