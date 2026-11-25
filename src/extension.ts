import * as vscode from 'vscode';
import { initializeIconThemes } from './appearance/iconThemes';
import { getSetting, onSettingsChanged } from './config/settings';
import { setLanguage, t } from './i18n/i18n';
import { ThemeSync } from './appearance/themeSync';
import { registerEditorCommands } from './editor/commands';
import { StatusDetails } from './editor/statusDetails';
import { detectIntegrations, formatIntegrations, IntegrationStatus } from './integrations';
import { syncDisabledActions } from './keymap/disabledActions';
import { UserKeybindings } from './keymap/userKeybindings';
import { IslandsPlus } from './islandsPlus/islandsPlus';
import { registerNavigationCommands } from './navigation/commands';
import type { TabId } from './search/searchEverywhere';
import { registerSettingsCommands } from './settings/commands';
import { SetupPrompt } from './settings/setupPrompt';
import { applyPreset, revertPreset } from './settings/preset';
import { applyChanges } from './settings/settingsPanel';
import { ProjectView } from './project/projectView';
import { RunWidget } from './run/runWidget';
import { GutterRunner } from './testing/gutterRunner';
import { registerVcsCommands } from './vcs/commands';
import type { CommitViewState } from './vcs/commitProtocol';
import type { GitLogView } from './vcs/gitLogView';
import type { VcsService } from './vcs/vcsService';

export interface UnIntelliJApi {
  integrations(): IntegrationStatus[];
  /** Resolves once pending appearance synchronizations are done (used by tests). */
  appearanceIdle(): Promise<void>;
  /** Search Everywhere results for a tab and query, without UI (used by tests). */
  search(tab: TabId, query: string): Promise<vscode.QuickPickItem[]>;
  /** Version control service and Commit tool window (used by tests). */
  vcs: { service: VcsService; commitState(): CommitViewState; gitLog: GitLogView };
  /** User keybindings written for reassigned shortcuts (used by tests). */
  keymap: { file: string; sync(): Promise<void> };
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
  // Before anything shows text: every UI string goes through t().
  setLanguage(getSetting('appearance.language'));
  context.subscriptions.push(
    onSettingsChanged(['appearance.language'], async () => {
      setLanguage(getSetting('appearance.language'));
      const reload = t('Reload Window');
      if ((await vscode.window.showInformationMessage(t('UnIntelliJ language changed. Reload the window to apply it everywhere.'), reload)) === reload) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    }),
  );

  const version = (context.extension.packageJSON as { version: string }).version;
  log.info(`UnIntelliJ ${version} activated on VS Code ${vscode.version} (${process.platform})`);

  const logIntegrations = (): void => log.info(`Integrations:\n${formatIntegrations(detectIntegrations())}`);
  logIntegrations();
  context.subscriptions.push(vscode.extensions.onDidChange(logIntegrations));

  // Commands first: a keybinding may be what activated the extension.
  const userKeybindings = new UserKeybindings(context, log);
  void userKeybindings.sync();
  const navigation = registerNavigationCommands(context, log);
  const vcs = registerVcsCommands(context, log);
  const setup = new SetupPrompt(context, log);
  context.subscriptions.push(
    ...navigation.disposables,
    ...registerEditorCommands(),
    ...registerSettingsCommands(context, log, setup),
    ...vcs.disposables,
    syncDisabledActions(),
    userKeybindings,
    new RunWidget(context.workspaceState, context.extensionUri),
    new GutterRunner(log),
    new StatusDetails(),
    new ProjectView(context, vcs.service),
  );
  const islandsPlus = IslandsPlus.create(context, log);
  context.subscriptions.push(islandsPlus);
  // Not awaited: patching may prompt the user and must not delay activation.
  void islandsPlus.reconcile();

  const themeSync = new ThemeSync(context.globalState, log);
  context.subscriptions.push(themeSync);
  await themeSync.initialize();
  await initializeIconThemes(context.globalState, log);
  // Not awaited: the notification stays until the user answers. Skipped in extension tests.
  if (context.extensionMode !== vscode.ExtensionMode.Test) {
    void setup.maybeAsk();
  }

  return {
    integrations: detectIntegrations,
    appearanceIdle: () => themeSync.idle(),
    search: (tab, query) => navigation.searchEverywhere.search(tab, query),
    vcs: { service: vcs.service, commitState: () => vcs.commitView.state(), gitLog: vcs.gitLog },
    keymap: { file: userKeybindings.file, sync: () => userKeybindings.sync() },
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
