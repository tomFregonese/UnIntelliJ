import * as vscode from 'vscode';
import { getSetting, onSettingsChanged } from '../config/settings';
import { shortcutFor } from '../search/actions';
import type { Branches } from './branches';
import { VcsService } from './vcsService';
import { t } from '../i18n/i18n';

/**
 * IntelliJ's branch widget, in the status bar (bottom left): one block with the branch name, ↙ incoming
 * and ↗ outgoing commit counts and the Update / Push / Fetch icons. Like IntelliJ, the whole block is a
 * single button that opens the Git popup (update, commit, push, fetch, branches). Islands+ moves it to
 * the title bar and colors the counts (blue incoming, green outgoing).
 * Also runs the periodic background fetch that keeps the incoming count up to date.
 */
export class BranchWidget implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly vcs: VcsService,
    private readonly branches: Branches,
    private readonly log: vscode.LogOutputChannel,
  ) {
    this.item = vscode.window.createStatusBarItem('unintellij.branch.name', vscode.StatusBarAlignment.Left, 104.9);
    this.item.name = t('Git Branch');
    this.item.command = 'unintellij.branches';
    this.disposables.push(
      this.item,
      vcs.onDidChange(() => this.update()),
      onSettingsChanged(['vcs.backgroundFetchMinutes'], () => this.schedule()),
      vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('git.autofetch') && this.schedule()),
    );
    this.update();
    this.schedule();
  }

  private update(): void {
    const head = this.vcs.repository?.state.HEAD;
    if (!head) {
      this.item.hide();
      return;
    }
    const name = head.name ?? head.commit?.slice(0, 8) ?? '';
    const upstream = head.upstream ? `${head.upstream.remote}/${head.upstream.name}` : undefined;
    const counts = [head.behind ? `↙${head.behind}` : '', head.ahead ? `↗${head.ahead}` : ''].filter(Boolean).join(' ');
    this.item.text = `$(git-branch) ${name}${counts ? ` ${counts}` : ''}  $(repo-pull) $(repo-push) $(repo-fetch)`;
    const shortcut = (command: string) => {
      const keys = shortcutFor(command);
      return keys ? ` (${keys})` : '';
    };
    const lines = [
      t('Git Branch: {0}{1}', name, upstream ? ` → ${upstream}` : ` ${t('(no upstream)')}`),
      head.behind ? (head.behind === 1 ? t('1 incoming commit from {0}', upstream) : t('{0} incoming commits from {1}', head.behind, upstream)) : '',
      head.ahead ? (head.ahead === 1 ? t('1 commit to push') : t('{0} commits to push', head.ahead)) : '',
      '',
      t('Click for Update Project{0}, Commit{1}, Push{2}, Fetch and branches{3}', shortcut('unintellij.updateProject'), shortcut('unintellij.commit'), shortcut('unintellij.push'), shortcut('unintellij.branches')),
    ];
    this.item.tooltip = lines.filter((line, index) => line || index === 3).join('\n');
    this.item.show();
  }

  /** (Re)starts the background fetch timer. */
  private schedule(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    const minutes = getSetting('vcs.backgroundFetchMinutes');
    // VS Code's own autofetch already keeps the counts current.
    if (minutes <= 0 || vscode.workspace.getConfiguration('git').get<boolean | string>('autofetch')) {
      return;
    }
    this.timer = setInterval(() => {
      if (vscode.window.state.focused) {
        this.branches.fetch(true).catch((error) => this.log.info(`Background fetch failed: ${String(error)}`));
      }
    }, minutes * 60_000);
  }

  dispose(): void {
    clearInterval(this.timer);
    this.disposables.forEach((d) => d.dispose());
  }
}
