import * as path from 'node:path';
import * as vscode from 'vscode';
import { VcsService } from './vcsService';
import { t } from '../i18n/i18n';

type Item = vscode.QuickPickItem & { run?: () => Thenable<unknown> };

/**
 * IntelliJ's Conflicts dialog: notifies when a merge/rebase produces conflicts and lets you accept
 * yours, accept theirs, or merge each file in VS Code's 3-way merge editor.
 */
export class Conflicts implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private lastCount = 0;

  constructor(private readonly vcs: VcsService) {
    this.disposables.push(
      vcs.onDidChange(() => this.onChange()),
      vscode.commands.registerCommand('unintellij.git.resolveConflicts', () => this.show()),
    );
  }

  private conflicts(): string[] {
    return this.vcs.changes().filter((c) => c.status === 'C').map((c) => c.path);
  }

  private onChange(): void {
    const count = this.conflicts().length;
    void vscode.commands.executeCommand('setContext', 'unintellij.hasConflicts', count > 0);
    if (count > 0 && this.lastCount === 0) {
      void vscode.window.showWarningMessage(t('Merge conflicts in {0} file{1}', count, count === 1 ? '' : 's'), 'Resolve…').then((answer) => answer && this.show());
    }
    this.lastCount = count;
  }

  private async accept(paths: string[], side: 'ours' | 'theirs'): Promise<void> {
    await this.vcs.git(['checkout', `--${side}`, '--', ...paths], false);
    await this.vcs.git(['add', '--', ...paths]);
  }

  async show(): Promise<void> {
    const files = this.conflicts();
    if (files.length === 0) {
      void vscode.window.showInformationMessage(t('No merge conflicts.'));
      return;
    }
    const root = this.vcs.repository!.rootUri.fsPath;
    const relative = (p: string) => path.relative(root, p).split(path.sep).join('/');
    const items: Item[] = [
      { label: t('$(arrow-left) Accept Yours for All'), run: () => this.accept(files, 'ours') },
      { label: t('$(arrow-right) Accept Theirs for All'), run: () => this.accept(files, 'theirs') },
      { label: t('Conflicts'), kind: vscode.QuickPickItemKind.Separator },
      ...files.map((file) => ({ label: `$(warning) ${path.basename(file)}`, description: relative(file), run: () => this.fileActions(file) })),
    ];
    const picked = await vscode.window.showQuickPick(items, {
      title: t('Conflicts ({0})', files.length),
      placeHolder: t('During a rebase, "Yours" is the branch being rebased onto and "Theirs" your commits'),
    });
    try {
      await picked?.run?.();
    } catch (error) {
      void vscode.window.showErrorMessage(String(error instanceof Error ? error.message : error));
    }
  }

  private async fileActions(file: string): Promise<void> {
    const items: Item[] = [
      { label: t('$(git-merge) Merge…'), description: t('3-way merge editor'), run: () => vscode.commands.executeCommand('git.openMergeEditor', vscode.Uri.file(file)) },
      { label: t('$(arrow-left) Accept Yours'), run: () => this.accept([file], 'ours') },
      { label: t('$(arrow-right) Accept Theirs'), run: () => this.accept([file], 'theirs') },
    ];
    const picked = await vscode.window.showQuickPick(items, { title: path.basename(file) });
    await picked?.run?.();
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
