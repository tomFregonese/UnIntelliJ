import * as vscode from 'vscode';
import { getSetting, onSettingsChanged } from '../config/settings';
import { disabledContextKey } from './keymap';

/**
 * Mirrors `unintellij.keymap.disabledActions` into `unintellij.keymap.disabled.<id>` context keys,
 * which every generated keybinding checks.
 */
export function syncDisabledActions(): vscode.Disposable {
  let current = new Set<string>();
  const apply = async (): Promise<void> => {
    // Reassigned actions also lose their default shortcut (the new one lives in keybindings.json).
    const next = new Set([...getSetting('keymap.disabledActions'), ...Object.keys(getSetting('keymap.customShortcuts'))]);
    const changed = [...new Set([...current, ...next])].filter((id) => current.has(id) !== next.has(id));
    current = next;
    await Promise.all(changed.map((id) => vscode.commands.executeCommand('setContext', disabledContextKey(id), next.has(id))));
  };
  void apply();
  return onSettingsChanged(['keymap.disabledActions', 'keymap.customShortcuts'], () => void apply());
}
