import * as vscode from 'vscode';
import { getSetting, onSettingsChanged } from '../config/settings';
import { shortcutFor } from '../search/actions';
import type { Branches } from './branches';
import { VcsService } from './vcsService';
import { t } from '../i18n/i18n';

/**
 * IntelliJ's branch widget, in the status bar (bottom left): branch name, green ↗ outgoing and blue
 * ↙ incoming commit counts, then Update / Push / Fetch buttons. Each part is its own item so that the
 * counts can have their own color. Islands+ moves these items to the title bar.
 * Also runs the periodic background fetch that keeps the incoming count up to date.
 */
export class BranchWidget implements vscode.Disposable {
  private readonly name: vscode.StatusBarItem;
  private readonly outgoing: vscode.StatusBarItem;
  private readonly incoming: vscode.StatusBarItem;
  private readonly buttons: vscode.StatusBarItem[];
  private readonly disposables: vscode.Disposable[] = [];
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly vcs: VcsService,
    private readonly branches: Branches,
    private readonly log: vscode.LogOutputChannel,
  ) {
    // Left items are sorted by descending priority.
    const item = (id: string, label: string, priority: number) => {
      const i = vscode.window.createStatusBarItem(`unintellij.branch.${id}`, vscode.StatusBarAlignment.Left, priority);
      i.name = label;
      return i;
    };
    this.name = item('name', t('Git Branch'), 104.9);
    this.name.command = 'unintellij.branches';
    this.outgoing = item('outgoing', t('Git Outgoing Commits'), 104.8);
    this.outgoing.color = new vscode.ThemeColor('unintellij.outgoingCommits');
    this.outgoing.command = 'unintellij.push';
    this.incoming = item('incoming', t('Git Incoming Commits'), 104.7);
    this.incoming.color = new vscode.ThemeColor('unintellij.incomingCommits');
    this.incoming.command = 'unintellij.updateProject';
    const button = (id: string, label: string, icon: string, command: string, priority: number) => {
      const b = item(id, label, priority);
      b.text = `$(${icon})`;
      b.command = command;
      const shortcut = shortcutFor(command);
      b.tooltip = shortcut ? `${label} (${shortcut})` : label;
      return b;
    };
    this.buttons = [
      button('update', t('Update Project…'), 'repo-pull', 'unintellij.updateProject', 104.6),
      button('push', t('Push…'), 'repo-push', 'unintellij.push', 104.5),
      button('fetch', t('Fetch'), 'repo-fetch', 'unintellij.fetch', 104.4),
    ];
    this.disposables.push(
      this.name,
      this.outgoing,
      this.incoming,
      ...this.buttons,
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
      [this.name, this.outgoing, this.incoming, ...this.buttons].forEach((i) => i.hide());
      return;
    }
    const name = head.name ?? head.commit?.slice(0, 8) ?? '';
    const upstream = head.upstream ? `${head.upstream.remote}/${head.upstream.name}` : undefined;
    const shortcut = shortcutFor('unintellij.branches');
    this.name.text = `$(git-branch) ${name}`;
    const tracking = upstream ? ` → ${upstream}` : ` ${t('(no upstream)')}`;
    this.name.tooltip = t('Git Branch: {0}{1}{2}', name, tracking, shortcut ? `\n${t('Branches…')} (${shortcut})` : '');
    this.name.show();
    this.count(this.outgoing, '↗', head.ahead, (n) => (n === 1 ? t('1 commit to push') : t('{0} commits to push', n)));
    this.count(this.incoming, '↙', head.behind, (n) => (n === 1 ? t('1 incoming commit from {0}', upstream) : t('{0} incoming commits from {1}', n, upstream)));
    this.buttons.forEach((b) => b.show());
  }

  private count(item: vscode.StatusBarItem, arrow: string, count: number | undefined, tooltip: (count: number) => string): void {
    if (!count) {
      item.hide();
      return;
    }
    item.text = `${arrow}${count}`;
    item.tooltip = tooltip(count);
    item.show();
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
