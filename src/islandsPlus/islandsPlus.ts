import * as path from 'node:path';
import * as vscode from 'vscode';
import { getSetting, onSettingsChanged, setSetting } from '../config/settings';
import { NotWritableError, WorkbenchPatcher } from './patcher';

/** VS Code settings Islands+ adjusts to get IntelliJ's title bar; previous values are restored on disable. */
const TITLE_BAR_SETTINGS: readonly { key: string; value: unknown; platforms?: NodeJS.Platform[] }[] = [
  { key: 'window.titleBarStyle', value: 'custom' },
  { key: 'window.commandCenter', value: false },
  // IntelliJ's New UI hides the main menu behind a hamburger button.
  { key: 'window.menuBarVisibility', value: 'compact', platforms: ['win32', 'linux'] },
];

const SETTINGS_BACKUP_KEY = 'islandsPlus.settingsBackup';
const FAILURE_KEY = 'islandsPlus.failedForVersion';

/**
 * Keeps VS Code's installation in line with `unintellij.appearance.islandsPlus.enabled`:
 * patches workbench.html when enabled (and again after VS Code updates), reverts when disabled.
 */
export class IslandsPlus implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly projectItem: vscode.StatusBarItem;
  private running: Promise<void> = Promise.resolve();

  constructor(
    private readonly state: vscode.Memento,
    private readonly patcher: WorkbenchPatcher,
    private readonly log: vscode.LogOutputChannel,
  ) {
    // IntelliJ's project widget, shown in the title bar by Islands+.
    this.projectItem = vscode.window.createStatusBarItem('unintellij.project', vscode.StatusBarAlignment.Left, 105);
    this.projectItem.name = 'Project';
    this.projectItem.command = 'workbench.action.openRecent';
    this.projectItem.tooltip = 'Recent Projects';
    this.disposables.push(
      this.projectItem,
      onSettingsChanged(['appearance.islandsPlus.enabled'], () => void this.reconcile(true)),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.updateProjectItem()),
    );
  }

  /** Whether patching applies here: a local desktop window (not remote, not web). */
  static supported(): boolean {
    return vscode.env.uiKind === vscode.UIKind.Desktop && vscode.env.remoteName === undefined;
  }

  static create(context: vscode.ExtensionContext, log: vscode.LogOutputChannel): IslandsPlus {
    const assets = path.join(context.extensionUri.fsPath, 'media', 'islands-plus');
    return new IslandsPlus(context.globalState, new WorkbenchPatcher(vscode.env.appRoot, assets), log);
  }

  /** Brings the installation in line with the setting. `userInitiated` is true for setting changes. */
  reconcile(userInitiated = false): Promise<void> {
    this.running = this.running.then(() => this.doReconcile(userInitiated)).catch((error) => this.log.error(`Islands+: ${String(error)}`));
    return this.running;
  }

  private updateProjectItem(): void {
    const name = vscode.workspace.name;
    if (getSetting('appearance.islandsPlus.enabled') && name) {
      this.projectItem.text = `$(folder) ${name.replace(/ \(Workspace\)$/, '')} $(chevron-down)`;
      this.projectItem.show();
    } else {
      this.projectItem.hide();
    }
  }

  private async doReconcile(userInitiated: boolean): Promise<void> {
    this.updateProjectItem();
    const enabled = getSetting('appearance.islandsPlus.enabled');
    if (!IslandsPlus.supported()) {
      if (enabled && userInitiated) {
        void vscode.window.showWarningMessage('Islands+ only works in a local VS Code window (not remote or web).');
      }
      return;
    }
    const status = await this.patcher.status();
    if (status === 'unsupported') {
      if (enabled && userInitiated) {
        void vscode.window.showWarningMessage('Islands+ does not support this VS Code version yet.');
      }
      return;
    }
    if (enabled && status !== 'patched') {
      await this.enable(userInitiated, status === 'clean' && !userInitiated);
    } else if (!enabled && status !== 'clean') {
      await this.disable();
    } else if (!enabled && userInitiated) {
      await this.restoreSettings();
    }
  }

  private async enable(userInitiated: boolean, afterUpdate: boolean): Promise<void> {
    if (!userInitiated && this.state.get(FAILURE_KEY) === vscode.version) {
      return; // Already reported for this VS Code version.
    }
    try {
      await this.patcher.apply();
    } catch (error) {
      await this.state.update(FAILURE_KEY, vscode.version);
      if (error instanceof NotWritableError) {
        const answer = await vscode.window.showErrorMessage(
          'Islands+ cannot modify VS Code: its installation folder is read-only for your account (typically the "System" installer on Windows). Use the "User" installer or run VS Code once as administrator to apply it.',
          { detail: error.file },
          'Disable Islands+',
        );
        if (answer === 'Disable Islands+') {
          await setSetting('appearance.islandsPlus.enabled', false);
        }
        return;
      }
      throw error;
    }
    await this.state.update(FAILURE_KEY, undefined);
    await this.applySettings();
    this.log.info(`Islands+ applied to ${this.patcher.workbenchFile}`);
    const message = afterUpdate ? 'VS Code was updated: Islands+ has been re-applied.' : 'Islands+ is installed.';
    const answer = await vscode.window.showInformationMessage(`${message} Reload the window to see it.`, 'Reload Window');
    if (answer === 'Reload Window') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }

  private async disable(): Promise<void> {
    try {
      await this.patcher.revert();
    } catch (error) {
      if (error instanceof NotWritableError) {
        void vscode.window.showErrorMessage(`Islands+ could not be removed: no write access to ${error.file}.`);
        return;
      }
      throw error;
    }
    await this.restoreSettings();
    this.log.info('Islands+ removed');
    const answer = await vscode.window.showInformationMessage('Islands+ has been removed. Reload the window to restore the standard look.', 'Reload Window');
    if (answer === 'Reload Window') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }

  private async applySettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const backup: Record<string, unknown> = this.state.get(SETTINGS_BACKUP_KEY) ?? {};
    for (const { key, value, platforms } of TITLE_BAR_SETTINGS) {
      if (platforms && !platforms.includes(process.platform)) {
        continue;
      }
      if (!(key in backup)) {
        backup[key] = config.inspect(key)?.globalValue ?? null;
      }
      await config.update(key, value, vscode.ConfigurationTarget.Global);
    }
    await this.state.update(SETTINGS_BACKUP_KEY, backup);
  }

  private async restoreSettings(): Promise<void> {
    const backup = this.state.get<Record<string, unknown>>(SETTINGS_BACKUP_KEY);
    if (!backup) {
      return;
    }
    const config = vscode.workspace.getConfiguration();
    for (const [key, value] of Object.entries(backup)) {
      await config.update(key, value === null ? undefined : value, vscode.ConfigurationTarget.Global);
    }
    await this.state.update(SETTINGS_BACKUP_KEY, undefined);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
