import * as vscode from 'vscode';
import { SettingsPanel } from './settingsPanel';
import { SetupPrompt } from './setupPrompt';
import { JavaExtensions } from './javaExtensions';

/** Settings window (Ctrl+Alt+S) and its entry points. */
export function registerSettingsCommands(context: vscode.ExtensionContext, log: vscode.LogOutputChannel, setup: SetupPrompt, java: JavaExtensions): vscode.Disposable[] {
  const panel = new SettingsPanel(context, log);
  return [
    panel,
    vscode.commands.registerCommand('unintellij.showSettings', (page?: string) => panel.show(typeof page === 'string' ? page : undefined)),
    vscode.commands.registerCommand('unintellij.showKeymapSettings', () => panel.show('keymap')),
    vscode.commands.registerCommand('unintellij.applyRecommendedSettings', () => setup.run()),
    vscode.commands.registerCommand('unintellij.installJavaExtensions', () => java.choose()),
  ];
}
