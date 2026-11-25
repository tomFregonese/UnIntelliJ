import * as vscode from 'vscode';

/**
 * Navigation popups. Until Search Everywhere and the IntelliJ popups exist, they open the closest
 * VS Code built-in so that the keymap already works.
 */
export function registerNavigationCommands(): vscode.Disposable[] {
  const quickOpen = (prefix = '') => () => vscode.commands.executeCommand('workbench.action.quickOpen', prefix);
  return [
    vscode.commands.registerCommand('unintellij.searchEverywhere', quickOpen()),
    vscode.commands.registerCommand('unintellij.findAction', quickOpen('>')),
    vscode.commands.registerCommand('unintellij.gotoClass', quickOpen('#')),
    vscode.commands.registerCommand('unintellij.gotoFile', quickOpen()),
    vscode.commands.registerCommand('unintellij.gotoSymbol', quickOpen('#')),
    vscode.commands.registerCommand('unintellij.fileStructure', quickOpen('@')),
    vscode.commands.registerCommand('unintellij.recentFiles', () =>
      vscode.commands.executeCommand('workbench.action.showAllEditorsByMostRecentlyUsed'),
    ),
    vscode.commands.registerCommand('unintellij.recentLocations', () =>
      vscode.commands.executeCommand('workbench.action.quickOpenPreviousRecentlyUsedEditor'),
    ),
  ];
}
