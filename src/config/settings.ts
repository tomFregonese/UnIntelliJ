import * as vscode from 'vscode';
import { CONFIG_NAMESPACE, sanitize, SettingKey, Settings } from './schema';

/** Reads a setting, falling back to its default when the stored value is invalid. */
export function getSetting<K extends SettingKey>(key: K): Settings[K] {
  return sanitize(key, vscode.workspace.getConfiguration(CONFIG_NAMESPACE).get(key));
}

/** Writes a setting to user (global) settings, like IntelliJ's application-level settings. */
export async function setSetting<K extends SettingKey>(key: K, value: Settings[K]): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_NAMESPACE)
    .update(key, value, vscode.ConfigurationTarget.Global);
}

/** Calls `listener` whenever one of `keys` changes. */
export function onSettingsChanged(
  keys: readonly SettingKey[],
  listener: () => void,
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (keys.some((key) => event.affectsConfiguration(`${CONFIG_NAMESPACE}.${key}`))) {
      listener();
    }
  });
}
