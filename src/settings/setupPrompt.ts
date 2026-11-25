import * as vscode from 'vscode';
import { getSetting } from '../config/settings';
import { hasJetBrainsMono, installJetBrainsMono } from '../appearance/fonts';
import { applyPreset, appliedPresetVersion, PRESET_VERSION } from './preset';
import { t } from '../i18n/i18n';

/** Set when the user answered "Don't ask again" for this preset version. */
const DISMISSED_KEY = 'settings.setupDismissedVersion';

/**
 * IntelliJ-like first run: offers to apply the IntelliJ-like VS Code settings (again when a new
 * version changes them), lets the user pick Islands Light or Dark, and makes sure JetBrains Mono
 * is installed.
 */
export class SetupPrompt {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  /** Called on activation: asks only when the preset was never applied or has changed. */
  async maybeAsk(): Promise<void> {
    const state = this.context.globalState;
    if (appliedPresetVersion(state) >= PRESET_VERSION || state.get<number>(DISMISSED_KEY) === PRESET_VERSION) {
      // Nothing to propose: still make sure the editor font exists.
      await this.checkFontOnStartup();
      return;
    }
    const isUpdate = appliedPresetVersion(state) > 0;
    const apply = t('Apply');
    const details = t('See Details');
    const never = t("Don't Ask Again");
    const answer = await vscode.window.showInformationMessage(
      isUpdate
        ? t('UnIntelliJ: the IntelliJ-like settings were updated (editor font size and line spacing, terminal). Apply them?')
        : t('UnIntelliJ: apply IntelliJ-like settings? Installs the JetBrains Mono font for your account and sets font sizes, autosave and the Islands theme.'),
      apply,
      details,
      t('Later'),
      never,
    );
    if (answer === apply) {
      await this.run();
    } else if (answer === details) {
      await vscode.commands.executeCommand('unintellij.showSettings', 'editorGeneral');
    } else if (answer === never) {
      await state.update(DISMISSED_KEY, PRESET_VERSION);
    }
  }

  /** Full setup: theme choice, settings, font. Also available as a command. */
  async run(): Promise<void> {
    const current = getSetting('appearance.theme');
    const theme = await vscode.window.showQuickPick(
      [
        { label: t('Islands Light'), id: 'islandsLight' as const, picked: current === 'islandsLight' },
        { label: t('Islands Dark'), id: 'islandsDark' as const, picked: current === 'islandsDark' },
      ].sort((a) => (a.picked ? -1 : 1)),
      { title: t('UnIntelliJ: Theme'), placeHolder: t('Choose the IntelliJ theme') },
    );
    if (!theme) {
      return;
    }
    await vscode.workspace.getConfiguration('unintellij').update('appearance.syncWithOs', false, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('unintellij').update('appearance.theme', theme.id, vscode.ConfigurationTarget.Global);
    await applyPreset(this.context.globalState);
    this.log.info(`Setup: preset v${PRESET_VERSION} applied with ${theme.label}`);
    // The preset's editor font: without it VS Code falls back to another font.
    await this.ensureFont();
  }

  /** Installs the bundled JetBrains Mono for the current user when missing, then offers a restart. */
  async ensureFont(): Promise<void> {
    if (await hasJetBrainsMono()) {
      return;
    }
    try {
      await installJetBrainsMono(this.context.extensionUri, this.log);
    } catch (error) {
      this.log.error(`Could not install JetBrains Mono: ${String(error)}`);
      await this.checkFont();
      return;
    }
    const restart = t('Restart Now');
    const answer = await vscode.window.showInformationMessage(t('JetBrains Mono was installed for your account. Restart VS Code to use it in the editor and the terminal.'), restart, 'Later');
    if (answer === restart) {
      await vscode.commands.executeCommand('workbench.action.quit');
    }
  }

  /** On startup: the editor font is set to JetBrains Mono but the font is missing. */
  async checkFontOnStartup(): Promise<void> {
    const family = vscode.workspace.getConfiguration('editor').get<string>('fontFamily') ?? '';
    if (/JetBrains Mono/i.test(family)) {
      await this.checkFont();
    }
  }

  /** Offers to install the bundled JetBrains Mono for the current user when it is missing. */
  async checkFont(): Promise<void> {
    if (await hasJetBrainsMono()) {
      return;
    }
    const install = t('Install for Me');
    const download = t('Download Page');
    const answer = await vscode.window.showWarningMessage(
      t('JetBrains Mono, the IntelliJ editor font, is not installed. UnIntelliJ can install it for your user account only (no admin rights needed).'),
      install,
      download,
    );
    if (answer === download) {
      await vscode.env.openExternal(vscode.Uri.parse('https://www.jetbrains.com/lp/mono/'));
    } else if (answer === install) {
      try {
        await installJetBrainsMono(this.context.extensionUri, this.log);
      } catch (error) {
        this.log.error(`Could not install JetBrains Mono: ${String(error)}`);
        void vscode.window.showErrorMessage(t('Could not install JetBrains Mono: {0}', String(error)));
        return;
      }
      const reload = t('Restart Now');
      if ((await vscode.window.showInformationMessage(t('JetBrains Mono installed. Restart VS Code to use it.'), reload)) === reload) {
        await vscode.commands.executeCommand('workbench.action.quit');
      }
    }
  }
}
