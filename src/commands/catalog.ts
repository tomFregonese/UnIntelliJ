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
  { command: 'unintellij.applyRecommendedSettings', title: 'Set Up IntelliJ-like Settings (Theme, Fonts)…' },
  // Run
  { command: 'unintellij.run', title: 'Run', icon: '$(play)' },
  { command: 'unintellij.run.editConfigurations', title: 'Edit Configurations…' },
  { command: 'unintellij.debug', title: 'Debug', icon: '$(debug-alt)' },
  { command: 'unintellij.stop', title: 'Stop', icon: '$(debug-stop)' },
  { command: 'unintellij.runAnything', title: 'Run…' },
  { command: 'unintellij.debugAnything', title: 'Debug…' },
  { command: 'unintellij.run.selectConfiguration', title: 'Select Run/Debug Configuration…' },
  { command: 'unintellij.runConfiguration', title: 'Run Configuration', hidden: true },
  // Structure tool window
  // npm tool window
  // Commit tool window (context menu)
  { command: 'unintellij.commit.showDiff', title: 'Show Diff', hidden: true },
  { command: 'unintellij.commit.jumpToSource', title: 'Jump to Source', hidden: true },
  { command: 'unintellij.commit.rollback', title: 'Rollback…', hidden: true },
  { command: 'unintellij.commit.addToVcs', title: 'Add to VCS', hidden: true },
  { command: 'unintellij.commit.moveToChangelist', title: 'Move to Another Changelist…', hidden: true },
  { command: 'unintellij.commit.newChangelist', title: 'New Changelist…' },
  { command: 'unintellij.commit.setActiveChangelist', title: 'Set Active Changelist', hidden: true },
  { command: 'unintellij.commit.renameChangelist', title: 'Edit Changelist…', hidden: true },
  { command: 'unintellij.commit.deleteChangelist', title: 'Delete Changelist', hidden: true },
  // Git tool window (log)
  { command: 'unintellij.git.showLog', title: 'Show Git Log' },
  { command: 'unintellij.git.showFileHistory', title: 'Show History for Current File' },
  { command: 'unintellij.git.resolveConflicts', title: 'Resolve Conflicts…' },
  { command: 'unintellij.git.showNativeScmViews', title: "Show VS Code's Source Control Views Again" },
  { command: 'unintellij.git.copyRevision', title: 'Copy Revision Number', hidden: true },
  { command: 'unintellij.git.checkoutRevision', title: 'Checkout Revision', hidden: true },
  { command: 'unintellij.git.newBranchHere', title: 'New Branch…', hidden: true },
  { command: 'unintellij.git.newTag', title: 'New Tag…', hidden: true },
  { command: 'unintellij.git.cherryPick', title: 'Cherry-Pick', hidden: true },
  { command: 'unintellij.git.revertCommit', title: 'Revert Commit', hidden: true },
  { command: 'unintellij.git.resetToHere', title: 'Reset Current Branch to Here…', hidden: true },
  // Version control
  { command: 'unintellij.commit', title: 'Commit…' },
  { command: 'unintellij.push', title: 'Push…', icon: '$(repo-push)' },
  { command: 'unintellij.fetch', title: 'Fetch', icon: '$(repo-fetch)' },
  { command: 'unintellij.change.showDiff', title: 'Show Diff', icon: '$(diff)', hidden: true },
  { command: 'unintellij.change.copyOriginal', title: 'Copy Original Content', icon: '$(copy)', hidden: true },
  { command: 'unintellij.updateProject', title: 'Update Project…', icon: '$(repo-pull)' },
  { command: 'unintellij.vcsOperations', title: 'VCS Operations Popup…' },
  { command: 'unintellij.branches', title: 'Branches…' },
  { command: 'unintellij.newBranch', title: 'New Branch…' },
];

export function buildCommandContribution(): unknown[] {
  return COMMANDS.map(({ command, title, icon }) => ({ command, title, category: COMMAND_CATEGORY, ...(icon && { icon }) }));
}

export function buildCommandPaletteMenu(): unknown[] {
  return COMMANDS.filter((c) => c.hidden).map(({ command }) => ({ command, when: 'false' }));
}
