import * as vscode from 'vscode';

/**
 * "IntelliJ-like VS Code settings": VS Code options whose defaults differ from IntelliJ's.
 * Applied on demand from Settings › Editor › General; previous values are kept for Revert.
 */
export const PRESET: readonly { key: string; value: unknown; reason: string }[] = [
  { key: 'editor.fontFamily', value: "'JetBrains Mono', Consolas, 'Courier New', monospace", reason: 'IntelliJ default editor font' },
  { key: 'editor.fontSize', value: 13, reason: 'IntelliJ default size' },
  { key: 'editor.lineHeight', value: 1.4, reason: 'IntelliJ line spacing' },
  { key: 'editor.minimap.enabled', value: false, reason: 'IntelliJ has no minimap' },
  { key: 'editor.renderWhitespace', value: 'none', reason: 'Whitespaces hidden' },
  { key: 'editor.rulers', value: [120], reason: 'Hard wrap guide at 120' },
  { key: 'editor.bracketPairColorization.enabled', value: false, reason: 'No rainbow brackets' },
  { key: 'editor.guides.bracketPairs', value: false, reason: 'No bracket pair guides' },
  { key: 'editor.stickyScroll.enabled', value: true, reason: 'Sticky lines' },
  { key: 'editor.linkedEditing', value: true, reason: 'Paired tags renamed together' },
  { key: 'workbench.editor.enablePreview', value: false, reason: 'No preview tabs' },
  { key: 'workbench.startupEditor', value: 'none', reason: 'Open the project, no welcome page' },
  { key: 'files.autoSave', value: 'onWindowChange', reason: 'IntelliJ saves when the IDE loses focus' },
  { key: 'git.autofetch', value: true, reason: 'Background fetch' },
  { key: 'debug.toolBarLocation', value: 'docked', reason: 'Debug toolbar in the Debug tool window' },
  { key: 'explorer.confirmDelete', value: true, reason: 'Ask before deleting' },
  { key: 'workbench.tree.indent', value: 12, reason: 'Project tree indentation' },
  { key: 'workbench.tree.renderIndentGuides', value: 'none', reason: 'No guides in the Project tree' },
];

const BACKUP_KEY = 'settings.presetBackup';

export function presetApplied(state: vscode.Memento): boolean {
  return state.get(BACKUP_KEY) !== undefined;
}

export async function applyPreset(state: vscode.Memento): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const backup: Record<string, unknown> = state.get(BACKUP_KEY) ?? {};
  for (const { key, value } of PRESET) {
    if (!(key in backup)) {
      // `null` marks "was not set", restored by removing the user value.
      backup[key] = config.inspect(key)?.globalValue ?? null;
    }
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }
  await state.update(BACKUP_KEY, backup);
}

export async function revertPreset(state: vscode.Memento): Promise<void> {
  const backup = state.get<Record<string, unknown>>(BACKUP_KEY);
  if (!backup) {
    return;
  }
  const config = vscode.workspace.getConfiguration();
  for (const [key, value] of Object.entries(backup)) {
    await config.update(key, value === null ? undefined : value, vscode.ConfigurationTarget.Global);
  }
  await state.update(BACKUP_KEY, undefined);
}
