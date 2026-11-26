import * as path from 'node:path';
import * as vscode from 'vscode';
import { getSetting, onSettingsChanged, setSetting } from '../config/settings';
import { NotWritableError, recordPatchedRoot, WorkbenchPatcher } from './patcher';
import { ALIVE_ITEM } from './patchLogic';
import { t } from '../i18n/i18n';

/** Title bar settings written by Islands+ up to 0.3 (now VS Code defaults); restored on disable. */
const SETTINGS_BACKUP_KEY = 'islandsPlus.settingsBackup';
const FAILURE_KEY = 'islandsPlus.failedForVersion';
/** Set once Islands+ was applied, to tell a re-apply after a VS Code update from a first install. */
const APPLIED_KEY = 'islandsPlus.applied';
/**
 * VS Code checks its files against product.json about 5 s after startup, with the checksums it read
 * at startup: patching before that check makes it report a "corrupt installation".
 */
const STARTUP_DELAY_MS = 20000;

/**
 * Keeps VS Code's installation in line with `unintellij.appearance.islandsPlus.enabled`:
 * patches workbench.html when enabled (and again after VS Code updates), reverts when disabled.
 */
export class IslandsPlus implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  /** Present while UnIntelliJ runs: when it is disabled, the injected script turns Islands+ off. */
  private readonly aliveItem: vscode.StatusBarItem;
  private running: Promise<void> = Promise.resolve();

  constructor(
    private readonly state: vscode.Memento,
    private readonly patcher: WorkbenchPatcher,
    private readonly log: vscode.LogOutputChannel,
  ) {
    this.aliveItem = vscode.window.createStatusBarItem(ALIVE_ITEM, vscode.StatusBarAlignment.Right, -100000);
    this.aliveItem.name = 'UnIntelliJ Islands+';
    this.aliveItem.text = 'UnIntelliJ';
    this.disposables.push(
      this.aliveItem,
      onSettingsChanged(['appearance.islandsPlus.enabled'], () => void this.reconcile(true)),
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

  /** On activation: marks a patched workbench as live now, patches or reverts once VS Code's integrity check is done. */
  start(): void {
    void this.updateAliveItem();
    const timer = setTimeout(() => void this.reconcile(), STARTUP_DELAY_MS);
    this.disposables.push({ dispose: () => clearTimeout(timer) });
  }

  /** Brings the installation in line with the setting. `userInitiated` is true for setting changes. */
  reconcile(userInitiated = false): Promise<void> {
    this.running = this.running.then(() => this.doReconcile(userInitiated)).catch((error) => this.log.error(`Islands+: ${String(error)}`));
    return this.running;
  }

  private async doReconcile(userInitiated: boolean): Promise<void> {
    try {
      await this.reconcilePatch(userInitiated);
    } finally {
      await this.updateAliveItem();
    }
  }

  /** The marker exists only in a patched workbench, where islands.css hides it. */
  private async updateAliveItem(): Promise<void> {
    const patched = IslandsPlus.supported() && (await this.patcher.status().catch(() => 'clean')) !== 'clean';
    if (patched) {
      this.aliveItem.show();
    } else {
      this.aliveItem.hide();
    }
  }

  private async reconcilePatch(userInitiated: boolean): Promise<void> {
    const enabled = getSetting('appearance.islandsPlus.enabled');
    if (!IslandsPlus.supported()) {
      if (enabled && userInitiated) {
        void vscode.window.showWarningMessage(t('Islands+ only works in a local VS Code window (not remote or web).'));
      }
      return;
    }
    const status = await this.patcher.status();
    if (status === 'unsupported') {
      if (enabled && userInitiated) {
        void vscode.window.showWarningMessage(t('Islands+ does not support this VS Code version yet.'));
      }
      return;
    }
    if (enabled && status !== 'patched') {
      await this.enable(userInitiated, status === 'clean' && !userInitiated && this.state.get<boolean>(APPLIED_KEY) === true);
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
        const answer = await vscode.window.showWarningMessage(
          t('Islands+ cannot modify VS Code: its installation folder is read-only for your account (typically the "System" installer on Windows). Use the "User" installer or run VS Code once as administrator to apply it. Meanwhile, hide VS Code\'s own branch entry by right-clicking the status bar and unchecking "Source Control".'),
          { detail: error.file },
          t('Disable Islands+'),
        );
        if (answer === t('Disable Islands+')) {
          await setSetting('appearance.islandsPlus.enabled', false);
        }
        return;
      }
      throw error;
    }
    await this.state.update(FAILURE_KEY, undefined);
    await this.state.update(APPLIED_KEY, true);
    await recordPatchedRoot(vscode.env.appRoot, true);
    this.log.info(`Islands+ applied to ${this.patcher.workbenchFile}`);
    const message = afterUpdate ? t('VS Code was updated: Islands+ has been re-applied.') : t('Islands+ is installed.');
    const answer = await vscode.window.showInformationMessage(t('{0} Reload the window to see it.', message), t('Reload Window'));
    if (answer === t('Reload Window')) {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }

  private async disable(): Promise<void> {
    try {
      await this.patcher.revert();
    } catch (error) {
      if (error instanceof NotWritableError) {
        void vscode.window.showErrorMessage(t('Islands+ could not be removed: no write access to {0}.', error.file));
        return;
      }
      throw error;
    }
    await recordPatchedRoot(vscode.env.appRoot, false);
    await this.restoreSettings();
    this.log.info('Islands+ removed');
    const answer = await vscode.window.showInformationMessage(t('Islands+ has been removed. Reload the window to restore the standard look.'), t('Reload Window'));
    if (answer === t('Reload Window')) {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
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

