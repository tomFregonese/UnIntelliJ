import * as vscode from 'vscode';
import { Branches } from './branches';
import { BranchWidget } from './branchWidget';
import { registerChangeActions } from './changeActions';
import { CommitView } from './commitView';
import { Conflicts } from './conflicts';
import { GitLogView } from './gitLogView';
import { NativeScmViews } from './scmViews';
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
  const nativeScmViews = new NativeScmViews(context.globalState, log);
  const commitView = new CommitView(context, service, log, () => void nativeScmViews.onCommitViewVisible());
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
      new BranchWidget(service, branches, log),
      ...registerChangeActions(service),
      vscode.commands.registerCommand('unintellij.fetch', () => branches.fetch()),
      vscode.commands.registerCommand('unintellij.commit', () => commitView.focus()),
      vscode.commands.registerCommand('unintellij.push', () => branches.push()),
      vscode.commands.registerCommand('unintellij.updateProject', () => branches.updateProject()),
      vscode.commands.registerCommand('unintellij.vcsOperations', () => branches.vcsOperations()),
      vscode.commands.registerCommand('unintellij.branches', () => branches.showBranches()),
      vscode.commands.registerCommand('unintellij.newBranch', () => branches.newBranch()),
      vscode.commands.registerCommand('unintellij.git.showNativeScmViews', () => nativeScmViews.show()),
    ],
  };
}
