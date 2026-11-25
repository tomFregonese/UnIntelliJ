import * as vscode from 'vscode';
import { Branches } from './branches';
import { CommitView } from './commitView';
import { Conflicts } from './conflicts';
import { GitLogView } from './gitLogView';
import { VcsService } from './vcsService';

export interface Vcs {
  service: VcsService;
  commitView: CommitView;
  gitLog: GitLogView;
  disposables: vscode.Disposable[];
}

/** Commit tool window, branches popup, Push dialog, Update Project, VCS Operations popup. */
export function registerVcsCommands(context: vscode.ExtensionContext, log: vscode.LogOutputChannel): Vcs {
  const service = new VcsService(context.workspaceState);
  const commitView = new CommitView(context, service, log);
  const branches = new Branches(service, context.workspaceState);
  const gitLog = new GitLogView(context, service, log);
  return {
    service,
    commitView,
    gitLog,
    disposables: [
      gitLog,
      new Conflicts(service),
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
