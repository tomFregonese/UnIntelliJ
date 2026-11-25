import * as vscode from 'vscode';
import { Branches } from './branches';
import { CommitView } from './commitView';
import { VcsService } from './vcsService';

export interface Vcs {
  service: VcsService;
  commitView: CommitView;
  disposables: vscode.Disposable[];
}

/** Commit tool window, branches popup, Push dialog, Update Project, VCS Operations popup. */
export function registerVcsCommands(context: vscode.ExtensionContext, log: vscode.LogOutputChannel): Vcs {
  const service = new VcsService(context.workspaceState);
  const commitView = new CommitView(context, service, log);
  const branches = new Branches(service, context.workspaceState);
  return {
    service,
    commitView,
    disposables: [
      service,
      commitView,
      branches,
      vscode.commands.registerCommand('unintellij.commit', () => commitView.focus()),
      vscode.commands.registerCommand('unintellij.push', () => branches.push()),
      vscode.commands.registerCommand('unintellij.updateProject', () => branches.updateProject()),
      vscode.commands.registerCommand('unintellij.vcsOperations', () => branches.vcsOperations()),
      vscode.commands.registerCommand('unintellij.branches', () => branches.showBranches()),
      vscode.commands.registerCommand('unintellij.newBranch', () => branches.newBranch()),
    ],
  };
}
