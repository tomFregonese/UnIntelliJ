import * as vscode from 'vscode';
import { getSetting, setSetting } from '../config/settings';
import { hasJetBrainsMono, installJetBrainsMono } from '../appearance/fonts';
import { themeIdFromLabel } from '../appearance/themeLogic';
import { t } from '../i18n/i18n';

/** Set once the user was offered to replace their own (non-Islands) theme. */
const THEME_OFFERED_KEY = 'settings.themeOffered';
/** Set once the bottom panel was aligned to the left (IntelliJ layout). */
const LAYOUT_KEY = 'settings.layoutApplied';
/** Set when installing JetBrains Mono automatically failed, so the user is told only once. */
const FONT_FAILED_KEY = 'settings.fontInstallFailed';

/**
 * Startup setup. The IntelliJ-like VS Code settings themselves are contributed as defaults (they come
 * and go with the extension); this only does what defaults cannot: install JetBrains Mono for the
 * user, align the bottom panel left once, and offer Islands to users who picked another theme.
 */
export class SetupPrompt {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  /** Called on activation, never blocks it. */
  async onStartup(): Promise<void> {
    const state = this.context.globalState;
    if (!state.get(LAYOUT_KEY)) {
      // Bottom tool windows start at the left edge, under the Project view (a layout state, not a setting).
      await Promise.resolve(vscode.commands.executeCommand('workbench.action.alignPanelLeft')).catch(() => undefined);
      await state.update(LAYOUT_KEY, true);
    }
    await this.ensureFontIfUsed();
    await this.offerTheme();
  }

  /** The editor font is JetBrains Mono (the default) but the font is missing: install it for the user. */
  private async ensureFontIfUsed(): Promise<void> {
    const family = vscode.workspace.getConfiguration('editor').get<string>('fontFamily') ?? '';
    if (!/JetBrains Mono/i.test(family) || (await hasJetBrainsMono())) {
      return;
    }
    if (this.context.globalState.get(FONT_FAILED_KEY)) {
      return;
    }
    try {
      await installJetBrainsMono(this.context.extensionUri, this.log);
    } catch (error) {
      this.log.error(`Could not install JetBrains Mono: ${String(error)}`);
      await this.context.globalState.update(FONT_FAILED_KEY, true);
      await this.checkFont();
      return;
    }
    await this.offerRestart(t('JetBrains Mono, the IntelliJ editor font, was installed for your account. Restart VS Code to use it in the editor and the terminal.'));
  }

  /** Once: the user chose a non-Islands theme themselves; ask instead of replacing it. */
  private async offerTheme(): Promise<void> {
    const state = this.context.globalState;
    const own = vscode.workspace.getConfiguration('workbench').inspect<string>('colorTheme')?.globalValue;
    if (state.get(THEME_OFFERED_KEY) || own === undefined || themeIdFromLabel(own)) {
      return;
    }
    await state.update(THEME_OFFERED_KEY, true);
    const light = t('Islands Light');
    const dark = t('Islands Dark');
    const answer = await vscode.window.showInformationMessage(t('UnIntelliJ: your VS Code theme is "{0}". Switch to an IntelliJ Islands theme?', own), light, dark, t('Keep My Theme'));
    if (answer === light || answer === dark) {
      await this.setTheme(answer === light ? 'islandsLight' : 'islandsDark');
    }
  }

  private async setTheme(theme: 'islandsLight' | 'islandsDark'): Promise<void> {
    await setSetting('appearance.syncWithOs', false);
    await setSetting('appearance.theme', theme);
  }

  /** "Set Up IntelliJ-like Settings" command: theme choice, layout, font. */
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
    await this.setTheme(theme.id);
    await Promise.resolve(vscode.commands.executeCommand('workbench.action.alignPanelLeft')).catch(() => undefined);
    this.log.info(`Setup: ${theme.label}`);
    await this.context.globalState.update(FONT_FAILED_KEY, undefined);
    if (!(await hasJetBrainsMono())) {
      await this.checkFont();
    }
  }

  private async offerRestart(message: string): Promise<void> {
    const restart = t('Restart Now');
    if ((await vscode.window.showInformationMessage(message, restart, t('Later'))) === restart) {
      await vscode.commands.executeCommand('workbench.action.quit');
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
      await this.offerRestart(t('JetBrains Mono installed. Restart VS Code to use it.'));
    }
  }
}
