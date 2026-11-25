/**
 * Every command UnIntelliJ contributes. package.json `contributes.commands` is generated from it.
 * Pure: no `vscode` import.
 */

export interface CommandDefinition {
  command: string;
  title: string;
  /** Hidden from the Command Palette (internal or context-only commands). */
  hidden?: boolean;
  /** Codicon/product icon shown in view toolbars, e.g. `$(play)`. */
  icon?: string;
}

export const COMMAND_CATEGORY = 'UnIntelliJ';

export const COMMANDS: readonly CommandDefinition[] = [
  // Navigation
  { command: 'unintellij.searchEverywhere', title: 'Search Everywhere' },
  { command: 'unintellij.findAction', title: 'Find Action…' },
  { command: 'unintellij.gotoClass', title: 'Go to Class…' },
  { command: 'unintellij.gotoFile', title: 'Go to File…' },
  { command: 'unintellij.gotoSymbol', title: 'Go to Symbol…' },
  { command: 'unintellij.recentFiles', title: 'Recent Files' },
  { command: 'unintellij.recentLocations', title: 'Recent Locations' },
  { command: 'unintellij.fileStructure', title: 'File Structure' },
  { command: 'unintellij.searchEverywhere.text', title: 'Search Everywhere: Text' },
  { command: 'unintellij.searchEverywhere.nextTab', title: 'Search Everywhere: Next Tab', hidden: true },
  { command: 'unintellij.searchEverywhere.previousTab', title: 'Search Everywhere: Previous Tab', hidden: true },
  // Editing
  { command: 'unintellij.nextMethod', title: 'Next Method' },
  { command: 'unintellij.previousMethod', title: 'Previous Method' },
  { command: 'unintellij.toggleCase', title: 'Toggle Case' },
  // Settings
  { command: 'unintellij.showSettings', title: 'Settings…' },
  { command: 'unintellij.showKeymapSettings', title: 'Settings: Keymap' },
  { command: 'unintellij.applyRecommendedSettings', title: 'Apply IntelliJ-like VS Code Settings…' },
  // Run
  { command: 'unintellij.run', title: 'Run', icon: '$(play)' },
  { command: 'unintellij.debug', title: 'Debug', icon: '$(debug-alt)' },
  { command: 'unintellij.stop', title: 'Stop', icon: '$(debug-stop)' },
  { command: 'unintellij.runAnything', title: 'Run…' },
  { command: 'unintellij.debugAnything', title: 'Debug…' },
  { command: 'unintellij.run.selectConfiguration', title: 'Select Run/Debug Configuration…' },
  { command: 'unintellij.runConfiguration', title: 'Run Configuration', hidden: true },
  // Structure tool window
  { command: 'unintellij.structure.sortAlphabetically', title: 'Sort Alphabetically', hidden: true },
  { command: 'unintellij.structure.sortByPosition', title: '✓ Sort Alphabetically', hidden: true },
  { command: 'unintellij.structure.showFields', title: 'Show Fields', hidden: true },
  { command: 'unintellij.structure.hideFields', title: '✓ Show Fields', hidden: true },
  { command: 'unintellij.structure.enableAutoscroll', title: 'Autoscroll from Source', hidden: true },
  { command: 'unintellij.structure.disableAutoscroll', title: '✓ Autoscroll from Source', hidden: true },
  { command: 'unintellij.structure.reveal', title: 'Navigate to Symbol', hidden: true },
  // npm tool window
  { command: 'unintellij.npm.refresh', title: 'Reload Scripts', icon: '$(refresh)', hidden: true },
  { command: 'unintellij.npm.run', title: 'Run Script', icon: '$(play)', hidden: true },
  { command: 'unintellij.npm.debug', title: 'Debug Script', icon: '$(debug-alt)', hidden: true },
  { command: 'unintellij.npm.open', title: 'Show in package.json', hidden: true },
  // Version control
  { command: 'unintellij.commit', title: 'Commit…' },
  { command: 'unintellij.push', title: 'Push…' },
  { command: 'unintellij.updateProject', title: 'Update Project…' },
  { command: 'unintellij.vcsOperations', title: 'VCS Operations Popup…' },
  { command: 'unintellij.branches', title: 'Branches…' },
];

export function buildCommandContribution(): unknown[] {
  return COMMANDS.map(({ command, title, icon }) => ({ command, title, category: COMMAND_CATEGORY, ...(icon && { icon }) }));
}

export function buildCommandPaletteMenu(): unknown[] {
  return COMMANDS.filter((c) => c.hidden).map(({ command }) => ({ command, when: 'false' }));
}
