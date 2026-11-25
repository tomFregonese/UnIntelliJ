import * as vscode from 'vscode';
import { getSetting } from '../config/settings';

/** Version control actions. The Commit tool window and branches popup replace these in later lots. */
export function registerVcsCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('unintellij.commit', () => vscode.commands.executeCommand('workbench.view.scm')),
    vscode.commands.registerCommand('unintellij.push', () => vscode.commands.executeCommand('git.push')),
    vscode.commands.registerCommand('unintellij.updateProject', () =>
      vscode.commands.executeCommand(getSetting('vcs.updateMethod') === 'rebase' ? 'git.pullRebase' : 'git.pull'),
    ),
    vscode.commands.registerCommand('unintellij.vcsOperations', () =>
      vscode.commands.executeCommand('workbench.action.quickOpen', '>Git: '),
    ),
    vscode.commands.registerCommand('unintellij.branches', () => vscode.commands.executeCommand('git.checkout')),
  ];
}
