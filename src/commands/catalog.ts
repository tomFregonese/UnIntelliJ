/**
 * Every command UnIntelliJ contributes. package.json `contributes.commands` is generated from it.
 * Pure: no `vscode` import.
 */

export interface CommandDefinition {
  command: string;
  title: string;
  /** Hidden from the Command Palette (internal or context-only commands). */
  hidden?: boolean;
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
  // Version control
  { command: 'unintellij.commit', title: 'Commit…' },
  { command: 'unintellij.push', title: 'Push…' },
  { command: 'unintellij.updateProject', title: 'Update Project…' },
  { command: 'unintellij.vcsOperations', title: 'VCS Operations Popup…' },
  { command: 'unintellij.branches', title: 'Branches…' },
];

export function buildCommandContribution(): unknown[] {
  return COMMANDS.map(({ command, title }) => ({ command, title, category: COMMAND_CATEGORY }));
}

export function buildCommandPaletteMenu(): unknown[] {
  return COMMANDS.filter((c) => c.hidden).map(({ command }) => ({ command, when: 'false' }));
}
