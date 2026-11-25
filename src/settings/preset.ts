import * as vscode from 'vscode';

/**
 * "IntelliJ-like VS Code settings": VS Code options whose defaults differ from IntelliJ's.
 * Applied on demand from Settings › Editor › General; previous values are kept for Revert.
 */
/** Bumped when entries change, so that users who applied an older preset are offered the new one. */
export const PRESET_VERSION = 4;

/**
 * JetBrains Mono (installed by the setup), then each OS's own coding font, never Courier New:
 * that serif fallback is what VS Code shows when the first font is missing.
 */
const EDITOR_FONT = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'Cascadia Mono', 'DejaVu Sans Mono', monospace";
/** Measured on Rider / IntelliJ New UI screenshots: about 15 px on macOS, 14 px on Windows. */
const EDITOR_FONT_SIZE = process.platform === 'darwin' ? 15 : 14;

export const PRESET: readonly { key: string; value: unknown; reason: string }[] = [
  { key: 'editor.fontFamily', value: EDITOR_FONT, reason: 'IntelliJ default editor font' },
  { key: 'editor.fontSize', value: EDITOR_FONT_SIZE, reason: 'Same visual size as IntelliJ' },
  { key: 'editor.lineHeight', value: 1.6, reason: 'IntelliJ line spacing (1.2 × JetBrains Mono line height)' },
  { key: 'editor.fontLigatures', value: false, reason: 'Ligatures off, IntelliJ default' },
  { key: 'editor.fontWeight', value: 'normal', reason: 'Regular weight' },
  { key: 'terminal.integrated.fontFamily', value: EDITOR_FONT, reason: 'Terminal uses the editor font' },
  { key: 'terminal.integrated.fontSize', value: EDITOR_FONT_SIZE, reason: 'Terminal font size' },
  { key: 'terminal.integrated.lineHeight', value: 1.2, reason: 'IntelliJ terminal line spacing' },
  { key: 'debug.console.fontSize', value: EDITOR_FONT_SIZE, reason: 'Console font size' },
  { key: 'debug.console.fontFamily', value: EDITOR_FONT, reason: 'Console uses the editor font' },
  { key: 'breadcrumbs.enabled', value: false, reason: 'The navigation bar is in the status bar, bottom left' },
  { key: 'diffEditor.renderSideBySide', value: true, reason: 'Side-by-side diff like IntelliJ' },
  { key: 'diffEditor.renderMarginRevertIcon', value: true, reason: 'Per-block revert arrows between the two sides (IntelliJ >> / <<)' },
  { key: 'diffEditor.ignoreTrimWhitespace', value: false, reason: 'Whitespace changes are shown, IntelliJ default' },
  { key: 'diffEditor.hideUnchangedRegions.enabled', value: false, reason: 'Whole file shown, like IntelliJ' },
  { key: 'editor.minimap.enabled', value: false, reason: 'IntelliJ has no minimap' },
  { key: 'editor.renderWhitespace', value: 'none', reason: 'Whitespaces hidden' },
  { key: 'editor.rulers', value: [120], reason: 'Hard wrap guide at 120' },
  { key: 'editor.bracketPairColorization.enabled', value: false, reason: 'No rainbow brackets' },
  { key: 'editor.guides.bracketPairs', value: false, reason: 'No bracket pair guides' },
  { key: 'editor.stickyScroll.enabled', value: true, reason: 'Sticky lines' },
  { key: 'editor.linkedEditing', value: true, reason: 'Paired tags renamed together' },
  { key: 'workbench.editor.enablePreview', value: false, reason: 'No preview tabs' },
  { key: 'workbench.startupEditor', value: 'none', reason: 'Open the project, no welcome page' },
  { key: 'files.autoSave', value: 'afterDelay', reason: 'IntelliJ saves continuously, no Save needed' },
  { key: 'files.autoSaveDelay', value: 100, reason: 'Save almost immediately while typing' },
  { key: 'problems.decorations.enabled', value: false, reason: 'File names keep their VCS color (blue = modified) instead of turning red on errors' },
  { key: 'git.autofetch', value: true, reason: 'Background fetch' },
  { key: 'debug.toolBarLocation', value: 'docked', reason: 'Debug toolbar in the Debug tool window' },
  { key: 'explorer.confirmDelete', value: true, reason: 'Ask before deleting' },
  { key: 'workbench.tree.indent', value: 12, reason: 'Project tree indentation' },
  { key: 'workbench.tree.renderIndentGuides', value: 'none', reason: 'No guides in the Project tree' },
];

const BACKUP_KEY = 'settings.presetBackup';
const VERSION_KEY = 'settings.presetVersion';

/** Version of the preset last applied, 0 when never applied. */
export function appliedPresetVersion(state: vscode.Memento): number {
  return state.get<number>(VERSION_KEY) ?? (presetApplied(state) ? 1 : 0);
}

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
    try {
      await config.update(key, value, vscode.ConfigurationTarget.Global);
    } catch {
      // A setting unknown to this VS Code version must not stop the others.
    }
  }
  // Bottom tool windows start at the left edge, under the Project view (a layout state, not a setting).
  await Promise.resolve(vscode.commands.executeCommand('workbench.action.alignPanelLeft')).catch(() => undefined);
  await state.update(BACKUP_KEY, backup);
  await state.update(VERSION_KEY, PRESET_VERSION);
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
