import * as vscode from 'vscode';
import { FileIndex } from '../search/fileIndex';
import { NavigationHistory } from '../search/history';
import { RecentPopups, showFileStructure } from '../search/popups';
import { SearchEverywhere, TabId } from '../search/searchEverywhere';
import { JavaServer } from '../settings/javaServer';

export interface Navigation {
  searchEverywhere: SearchEverywhere;
  history: NavigationHistory;
  disposables: vscode.Disposable[];
}

/** Search Everywhere, Go to Class/File/Symbol, Find Action, Recent Files/Locations, File Structure. */
export function registerNavigationCommands(context: vscode.ExtensionContext, log: vscode.LogOutputChannel, javaServer: JavaServer): Navigation {
  const fileIndex = new FileIndex();
  const history = new NavigationHistory(context.workspaceState);
  const searchEverywhere = new SearchEverywhere(context.extensionUri, fileIndex, history, log, () => javaServer.searchHint());
  const recent = new RecentPopups(context.extensionUri, history);
  const open = (tab: TabId) => () => searchEverywhere.show(tab);
  return {
    searchEverywhere,
    history,
    disposables: [
      fileIndex,
      history,
      searchEverywhere,
      vscode.commands.registerCommand('unintellij.searchEverywhere', open('all')),
      vscode.commands.registerCommand('unintellij.gotoClass', open('classes')),
      vscode.commands.registerCommand('unintellij.gotoFile', open('files')),
      vscode.commands.registerCommand('unintellij.gotoSymbol', open('symbols')),
      vscode.commands.registerCommand('unintellij.findAction', open('actions')),
      vscode.commands.registerCommand('unintellij.searchEverywhere.text', open('text')),
      vscode.commands.registerCommand('unintellij.searchEverywhere.nextTab', () => searchEverywhere.cycleTab(1)),
      vscode.commands.registerCommand('unintellij.searchEverywhere.previousTab', () => searchEverywhere.cycleTab(-1)),
      vscode.commands.registerCommand('unintellij.recentFiles', () => recent.showRecentFiles()),
      vscode.commands.registerCommand('unintellij.recentLocations', () => recent.showRecentLocations()),
      vscode.commands.registerCommand('unintellij.fileStructure', () => showFileStructure(context.extensionUri)),
    ],
  };
}
