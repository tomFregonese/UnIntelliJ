import * as vscode from 'vscode';
import { t } from '../i18n/i18n';
import { Connections, DataSourceStore } from './connections';
import { DataSourcesPanel } from './dataSourcesPanel';
import { DatabaseView, DbNode } from './databaseView';
import { ResultsView } from './resultsView';
import { SqlEditor } from './sqlEditor';
import { quoteIdent } from './sqlLogic';
import { DataSource, shownDatabases, visibleSchemas, withDatabases, withSchemas } from './dataSourceLogic';

/** PostgreSQL support (IntelliJ's Database tool window, data sources, SQL consoles, results). */
export function registerDatabase(context: vscode.ExtensionContext): vscode.Disposable[] {
  const store = new DataSourceStore(context.globalState, context.secrets);
  const connections = new Connections(store);
  const panel = new DataSourcesPanel(context.extensionUri, store);
  const view = new DatabaseView(context.extensionUri, store, connections);
  const results = new ResultsView(context.extensionUri, connections);
  const sql = new SqlEditor(context.workspaceState, store, connections, results);
  const replace = async (updated: DataSource): Promise<void> => {
    await store.save(
      store.all.map((s) => (s.id === updated.id ? updated : s)),
      {},
    );
  };
  const failed = (source: DataSource, error: unknown) =>
    void vscode.window.showErrorMessage(t('Cannot connect to {0}: {1}', source.name, error instanceof Error ? error.message : String(error)));
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
    // IntelliJ: data source › "N of M" databases, database › "N of M" schemas, chosen with checkboxes.
    vscode.commands.registerCommand('unintellij.database.chooseDatabases', async (node?: DbNode) => {
      const source = node?.kind === 'source' ? node.source : selectedSource(node) && store.get(selectedSource(node)!.id);
      if (!source) {
        return;
      }
      let all: string[];
      try {
        all = await view.databases(source);
      } catch (error) {
        failed(source, error);
        return;
      }
      const shown = shownDatabases(source);
      pickLive(
        all.map((d) => ({ label: d, description: d === source.database ? t('connection database') : undefined, picked: shown.includes(d) })),
        t('Databases shown for {0}', source.name),
        t('Check the databases to show'),
        async (chosen) => {
          const current = store.get(source.id);
          if (current) {
            await replace(withDatabases(current, chosen));
          }
        },
      );
    }),
    vscode.commands.registerCommand('unintellij.database.chooseSchemas', async (node?: DbNode) => {
      if (node?.kind !== 'database') {
        return;
      }
      const base = store.get(node.source.id);
      if (!base) {
        return;
      }
      let all: string[];
      try {
        all = await view.schemas(node.source);
      } catch (error) {
        failed(node.source, error);
        return;
      }
      const shown = visibleSchemas(base, node.source.database);
      const database = node.source.database;
      pickLive(
        all.map((s) => ({ label: s, picked: !shown || shown.includes(s) })),
        t('Schemas shown for {0}', `${base.name} › ${database}`),
        t('Check the schemas to show'),
        async (chosen) => {
          const current = store.get(base.id);
          if (current) {
            await replace(withSchemas(current, database, chosen, all));
          }
        },
      );
    }),
    vscode.commands.registerCommand('unintellij.database.openTable', async (node?: DbNode) => {
      if (node?.kind === 'table') {
        await results.openTable(node.source, node.schema, node.name, view.icon(node.view ? 'view' : 'table'));
      }
    }),
    // VS Code trees only report single clicks: two on the same table within 500 ms open it (IntelliJ double-click).
    vscode.commands.registerCommand('unintellij.database.click', async (node?: DbNode) => {
      if (node?.kind !== 'table') {
        return;
      }
      if (await view.click(node)) {
        await vscode.commands.executeCommand('unintellij.database.openTable', node);
      }
    }),
    vscode.commands.registerCommand('unintellij.database.speedSearch', (action: Parameters<DatabaseView['speedSearch']>[0]) => view.speedSearch(action ?? {})),
    vscode.commands.registerCommand('unintellij.database.copyName', async (node?: DbNode) => {
      const name = node?.kind === 'table' ? `${quoteIdent(node.schema)}.${quoteIdent(node.name)}` : node?.kind === 'schema' ? quoteIdent(node.schema) : node?.kind === 'leaf' ? node.label : undefined;
      if (name) {
        await vscode.env.clipboard.writeText(name);
      }
    }),
  ];
}

/**
 * Checkbox list applied as soon as a box is checked or unchecked, like IntelliJ's popups: no OK
 * needed, clicking outside (or Escape) closes it with the changes kept. Saves run one at a time.
 */
function pickLive(items: (vscode.QuickPickItem & { picked: boolean })[], title: string, placeholder: string, save: (chosen: string[]) => Promise<void>): void {
  const pick = vscode.window.createQuickPick<vscode.QuickPickItem>();
  pick.canSelectMany = true;
  pick.title = title;
  pick.placeholder = placeholder;
  pick.items = items;
  pick.selectedItems = items.filter((i) => i.picked);
  let last = JSON.stringify(pick.selectedItems.map((i) => i.label));
  let queue = Promise.resolve();
  pick.onDidChangeSelection((selected) => {
    const chosen = selected.map((i) => i.label);
    const key = JSON.stringify(chosen);
    if (key === last) {
      return;
    }
    last = key;
    queue = queue.then(() => save(chosen)).catch((error: unknown) => void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)));
  });
  pick.onDidAccept(() => pick.hide());
  pick.onDidHide(() => pick.dispose());
  pick.show();
}
