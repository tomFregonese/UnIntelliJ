import * as vscode from 'vscode';

/** VS Code's own views in the Source Control container, replaced by the Commit tool window. */
const NATIVE_SCM_VIEWS = ['workbench.scm.history', 'workbench.scm'];
/** False once the user asked to see VS Code's views again. */
const HIDE_KEY = 'vcs.hideNativeScmViews';

/**
 * Keeps VS Code's Source Control and Graph views hidden so that the Source Control container only
 * shows UnIntelliJ's Commit tool window (contributed expanded, see contributions.ts). The hide
 * actions only work once the container is shown and Git's provider is registered, so they run
 * whenever the Commit tool window becomes visible. `removeView` only ever hides: repeating it is
 * harmless.
 */
export class NativeScmViews {
  constructor(
    private readonly state: vscode.Memento,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  /** Called when the Commit tool window becomes visible. */
  async onCommitViewVisible(): Promise<void> {
    if (!this.state.get<boolean>(HIDE_KEY, true)) {
      return;
    }
    const commands = new Set(await vscode.commands.getCommands(false));
    // VS Code may re-add its Source Control view while Git registers: retry a few times.
    for (const delay of [300, 1500, 4000]) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      for (const view of NATIVE_SCM_VIEWS) {
        if (!commands.has(`${view}.removeView`)) {
          continue;
        }
        try {
          await vscode.commands.executeCommand(`${view}.removeView`);
        } catch (error) {
          this.log.warn(`Could not hide ${view}: ${String(error)}`);
        }
      }
    }
  }

  /** Shows VS Code's Source Control views again and stops hiding them. */
  async show(): Promise<void> {
    await this.state.update(HIDE_KEY, false);
    await vscode.commands.executeCommand('workbench.view.scm');
    for (const view of NATIVE_SCM_VIEWS) {
      // Only offered while they are hidden: the toggle shows them.
      await vscode.commands.executeCommand(`${view}.toggleVisibility`);
    }
  }
}
