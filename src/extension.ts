import * as vscode from 'vscode';
import { getSetting, onSettingsChanged } from './config/settings';
import { setLanguage, t } from './i18n/i18n';
import { ThemeSync } from './appearance/themeSync';
import { registerDatabase } from './database/database';
import { registerEditorCommands } from './editor/commands';
import { StatusDetails } from './editor/statusDetails';
import { detectIntegrations, formatIntegrations, IntegrationStatus } from './integrations';
import { syncDisabledActions } from './keymap/disabledActions';
import { UserKeybindings } from './keymap/userKeybindings';
import { IslandsPlus } from './islandsPlus/islandsPlus';
import { ProjectWidget } from './project/projectWidget';
import { SpringProperties } from './spring/springProperties';
import { registerNavigationCommands } from './navigation/commands';
import { JavaServer } from './settings/javaServer';
import type { TabId } from './search/searchEverywhere';
import { registerSettingsCommands } from './settings/commands';
import { SetupPrompt } from './settings/setupPrompt';
import { JavaExtensions } from './settings/javaExtensions';
import { MavenView } from './maven/mavenView';
import { revertPreset } from './settings/preset';
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
    revertPreset(): Promise<void>;
  };
}

/** Extension id before the publisher became TomFregonese (≤ 0.5.2). */
const OLD_EXTENSION_ID = 'unintellij.unintellij';

export async function activate(context: vscode.ExtensionContext): Promise<UnIntelliJApi | undefined> {
  // Before anything shows text: every UI string goes through t().
  setLanguage(getSetting('appearance.language'));
  // Both copies would register the same commands: remove the old one and wait for the reload.
  // TODO: remove once nobody runs ≤ 0.5.2 any more.
  if (vscode.extensions.getExtension(OLD_EXTENSION_ID)) {
    await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', OLD_EXTENSION_ID);
    const reload = t('Reload Window');
    if ((await vscode.window.showInformationMessage(t('UnIntelliJ now comes from the publisher TomFregonese: the previous copy was uninstalled. Reload the window to finish.'), reload)) === reload) {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
    return undefined;
  }
  const log = vscode.window.createOutputChannel('UnIntelliJ', { log: true });
  context.subscriptions.push(log);
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
  const javaServer = new JavaServer(context.workspaceState);
  const navigation = registerNavigationCommands(context, log, javaServer);
  const vcs = registerVcsCommands(context, log);
  const setup = new SetupPrompt(context, log);
  const java = new JavaExtensions(context.globalState);
  context.subscriptions.push(
    javaServer,
    ...navigation.disposables,
    ...registerEditorCommands(),
    ...registerSettingsCommands(context, log, setup, java),
    ...vcs.disposables,
    syncDisabledActions(),
    userKeybindings,
    new RunWidget(context.workspaceState, context.extensionUri),
    new GutterRunner(log),
    new StatusDetails(),
    ...registerDatabase(context),
    new ProjectView(context, vcs.service),
    new ProjectWidget(),
    new MavenView(context.workspaceState),
    new SpringProperties(log),
  );
  const islandsPlus = IslandsPlus.create(context, log);
  context.subscriptions.push(islandsPlus);
  // Not awaited: patching may prompt the user and must not delay activation. Extension tests never
  // patch the VS Code installation running them.
  if (context.extensionMode !== vscode.ExtensionMode.Test) {
    islandsPlus.start();
  }

  const themeSync = new ThemeSync(context.globalState, log);
  context.subscriptions.push(themeSync);
  await themeSync.initialize();
  // Not awaited: the notification stays until the user answers. Skipped in extension tests.
  if (context.extensionMode !== vscode.ExtensionMode.Test) {
    void setup.onStartup();
    void java.onStartup();
    javaServer.onStartup();
  }

  return {
    integrations: detectIntegrations,
    appearanceIdle: () => themeSync.idle(),
    search: (tab, query) => navigation.searchEverywhere.search(tab, query),
    vcs: { service: vcs.service, commitState: () => vcs.commitView.state(), gitLog: vcs.gitLog },
    keymap: { file: userKeybindings.file, sync: () => userKeybindings.sync() },
    settings: {
      applyChanges,
      revertPreset: () => revertPreset(context.globalState),
    },
  };
}

export function deactivate(): void {
  // Nothing to clean up: everything is registered through context.subscriptions.
}
