import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getSetting, onSettingsChanged } from '../config/settings';
import { customKeybindings, Keybinding } from './keymap';
import { replaceManagedEntries } from './keybindingsFile';

const MANAGED_KEY = 'keymap.managedUserKeybindings';
/**
 * Writes the shortcuts reassigned in Settings › Keymap (`unintellij.keymap.customShortcuts`) to
 * the user's keybindings.json. Only entries written by UnIntelliJ are ever changed. The default
 * shortcut of a reassigned action is turned off through its `unintellij.keymap.disabled.<id>` key.
 */
export class UserKeybindings implements vscode.Disposable {
  private readonly disposable: vscode.Disposable;
  private running: Promise<void> = Promise.resolve();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {
    this.disposable = onSettingsChanged(['keymap.customShortcuts'], () => void this.sync());
  }

  /** User-level keybindings.json, next to settings.json (`<user data>/User/`). */
  get file(): string {
    return path.join(this.context.globalStorageUri.fsPath, '..', '..', 'keybindings.json');
  }

  sync(): Promise<void> {
    this.running = this.running.then(() => this.write()).catch((error) => {
      this.log.error(`Keymap: could not update keybindings.json: ${String(error)}`);
      void vscode.window.showErrorMessage(`UnIntelliJ could not update keybindings.json: ${String(error)}`);
    });
    return this.running;
  }

  private async write(): Promise<void> {
    const next = customKeybindings(getSetting('keymap.customShortcuts'));
    const previous = this.context.globalState.get<Keybinding[]>(MANAGED_KEY, []);
    if (JSON.stringify(previous) === JSON.stringify(next)) {
      return;
    }
    const text = existsSync(this.file) ? await readFile(this.file, 'utf8') : '';
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, replaceManagedEntries(text, previous, next));
    await this.context.globalState.update(MANAGED_KEY, next);
    this.log.info(`Keymap: ${next.length} custom keybinding(s) written to ${this.file}`);
  }

  dispose(): void {
    this.disposable.dispose();
  }
}
