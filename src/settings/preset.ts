import * as vscode from 'vscode';
import { INTELLIJ_DEFAULTS } from '../config/schema';

/**
 * "IntelliJ-like VS Code settings": contributed as VS Code defaults (see `INTELLIJ_DEFAULTS`), so
 * they apply while UnIntelliJ is enabled and disappear with it. Nothing is written to the user's
 * settings automatically: a value the user set always wins.
 */
export const PRESET = INTELLIJ_DEFAULTS;

/** Backup written by the former "Apply" button (0.1–0.3): the values the user had before. */
const BACKUP_KEY = 'settings.presetBackup';

export interface PresetEntryState {
  key: string;
  value: unknown;
  reason: string;
  /** The user's own value, when it overrides the IntelliJ one. */
  userValue?: unknown;
}

/** The entries with the user's own value when they set one. */
export function presetState(): PresetEntryState[] {
  const config = vscode.workspace.getConfiguration();
  return PRESET.map((p) => {
    const userValue = config.inspect(p.key)?.globalValue;
    return userValue === undefined || JSON.stringify(userValue) === JSON.stringify(p.value) ? { ...p } : { ...p, userValue };
  });
}

/** Whether the former "Apply" button left a backup of earlier values. */
export function presetApplied(state: vscode.Memento): boolean {
  return state.get(BACKUP_KEY) !== undefined;
}

/** Removes the user's own value of `key` so that the IntelliJ default applies (explicit user action). */
export async function useIntelliJValue(key: string): Promise<void> {
  await vscode.workspace.getConfiguration().update(key, undefined, vscode.ConfigurationTarget.Global);
}

/** Restores the values the user had before the former "Apply" button. */
export async function revertPreset(state: vscode.Memento): Promise<void> {
  const backup = state.get<Record<string, unknown>>(BACKUP_KEY);
  if (!backup) {
    return;
  }
  const config = vscode.workspace.getConfiguration();
  for (const [key, value] of Object.entries(backup)) {
    try {
      await config.update(key, value === null ? undefined : value, vscode.ConfigurationTarget.Global);
    } catch {
      // A setting unknown to this VS Code version must not stop the others.
    }
  }
  await state.update(BACKUP_KEY, undefined);
}
