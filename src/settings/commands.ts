import * as vscode from 'vscode';
import { SettingsPanel } from './settingsPanel';

/** Settings window (Ctrl+Alt+S) and its entry points. */
export function registerSettingsCommands(context: vscode.ExtensionContext, log: vscode.LogOutputChannel): vscode.Disposable[] {
  const panel = new SettingsPanel(context, log);
  return [
    panel,
    vscode.commands.registerCommand('unintellij.showSettings', (page?: string) => panel.show(typeof page === 'string' ? page : undefined)),
    vscode.commands.registerCommand('unintellij.showKeymapSettings', () => panel.show('keymap')),
    vscode.commands.registerCommand('unintellij.applyRecommendedSettings', () => panel.show('editorGeneral')),
  ];
}
