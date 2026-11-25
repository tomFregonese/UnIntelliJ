import * as vscode from 'vscode';

/** Settings entry point. The IntelliJ-style Settings window replaces this in a later lot. */
export function registerSettingsCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('unintellij.showSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${context.extension.id}`),
    ),
  ];
}
