import * as vscode from 'vscode';
import { initializeIconThemes } from './appearance/iconThemes';
import { ThemeSync } from './appearance/themeSync';
import { registerEditorCommands } from './editor/commands';
import { detectIntegrations, formatIntegrations, IntegrationStatus } from './integrations';
import { syncDisabledActions } from './keymap/disabledActions';
import { registerNavigationCommands } from './navigation/commands';
import type { TabId } from './search/searchEverywhere';
import { registerSettingsCommands } from './settings/commands';
import { applyPreset, revertPreset } from './settings/preset';
import { applyChanges } from './settings/settingsPanel';
import { RunWidget } from './run/runWidget';
import { NpmView } from './toolWindows/npm';
import { StructureView } from './toolWindows/structure';
import { registerVcsCommands } from './vcs/commands';
import type { CommitViewState } from './vcs/commitProtocol';
import type { VcsService } from './vcs/vcsService';

export interface UnIntelliJApi {
  integrations(): IntegrationStatus[];
  /** Resolves once pending appearance synchronizations are done (used by tests). */
  appearanceIdle(): Promise<void>;
  /** Search Everywhere results for a tab and query, without UI (used by tests). */
  search(tab: TabId, query: string): Promise<vscode.QuickPickItem[]>;
  /** Names of the top-level symbols shown in the Structure tool window (used by tests). */
  structure(): Promise<string[]>;
  /** Version control service and Commit tool window (used by tests). */
  vcs: { service: VcsService; commitState(): CommitViewState };
  /** Settings window operations (used by tests). */
  settings: {
    applyChanges(changes: Record<string, unknown>): Promise<void>;
    applyPreset(): Promise<void>;
    revertPreset(): Promise<void>;
  };
}

export async function activate(context: vscode.ExtensionContext): Promise<UnIntelliJApi> {
  const log = vscode.window.createOutputChannel('UnIntelliJ', { log: true });
  context.subscriptions.push(log);

  const version = (context.extension.packageJSON as { version: string }).version;
  log.info(`UnIntelliJ ${version} activated on VS Code ${vscode.version} (${process.platform})`);

  const logIntegrations = (): void => log.info(`Integrations:\n${formatIntegrations(detectIntegrations())}`);
  logIntegrations();
  context.subscriptions.push(vscode.extensions.onDidChange(logIntegrations));

  // Commands first: a keybinding may be what activated the extension.
  const navigation = registerNavigationCommands(context, log);
  const vcs = registerVcsCommands(context, log);
  context.subscriptions.push(
    ...navigation.disposables,
    ...registerEditorCommands(),
    ...registerSettingsCommands(context, log),
    ...vcs.disposables,
    syncDisabledActions(),
    new RunWidget(context.workspaceState),
    new NpmView(),
  );
  const structure = new StructureView(context.globalState);
  context.subscriptions.push(structure);

  const themeSync = new ThemeSync(context.globalState, log);
  context.subscriptions.push(themeSync);
  await themeSync.initialize();
  await initializeIconThemes(context.globalState, log);

  return {
    integrations: detectIntegrations,
    appearanceIdle: () => themeSync.idle(),
    search: (tab, query) => navigation.searchEverywhere.search(tab, query),
    vcs: { service: vcs.service, commitState: () => vcs.commitView.state() },
    structure: async () => (await structure.whenLoaded()).map((n) => n.symbol.name),
    settings: {
      applyChanges,
      applyPreset: () => applyPreset(context.globalState),
      revertPreset: () => revertPreset(context.globalState),
    },
  };
}

export function deactivate(): void {
  // Nothing to clean up: everything is registered through context.subscriptions.
}
