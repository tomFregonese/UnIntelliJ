/**
 * IntelliJ default keymaps ("Windows" and "macOS") mapped to VS Code commands.
 *
 * Single source of truth: package.json `contributes.keybindings` and docs/KEYMAP.md are generated
 * from this file (`npm run gen`). Pure: no `vscode` import.
 *
 * Each action can be disabled individually with `unintellij.keymap.disabledActions`, which the
 * extension turns into the `unintellij.keymap.disabled.<id>` context keys.
 */

import { containerCommand } from '../commands/contributions';

export interface KeymapAction {
  /** IntelliJ action ID (as shown in Settings › Keymap). */
  id: string;
  /** Human-readable name, as in IntelliJ. */
  name: string;
  category: Category;
  /** Shortcut in IntelliJ's "Windows" keymap (VS Code key syntax); also used on Linux. */
  windows?: string;
  /** Shortcut in IntelliJ's "macOS" keymap (VS Code key syntax). */
  macos?: string;
  command: string;
  args?: unknown;
  /** Extra when-clause, ANDed with the keymap's own conditions. */
  when?: string;
  /**
   * Same shortcut, other commands in other contexts. Emitted after the main binding so that they
   * take precedence when their `when` matches (VS Code evaluates keybindings bottom-up).
   */
  variants?: readonly { command: string; args?: unknown; when: string }[];
}

export const CATEGORIES = ['Navigation', 'Editing', 'Refactoring', 'Tool Windows', 'Version Control', 'Run and Debug', 'Database', 'Tabs and Windows'] as const;
export type Category = (typeof CATEGORIES)[number];

const EDITOR = 'editorTextFocus';
const EDITOR_WRITABLE = 'editorTextFocus && !editorReadonly';
const DEBUGGING = 'inDebugMode';

const sideBarShows = (viewlet: string): string => `sideBarFocus && activeViewlet == '${viewlet}'`;
const panelShows = (panel: string): string => `panelFocus && activePanel == '${panel}'`;

/** IntelliJ tool window shortcuts toggle: show and focus, or hide when it already has focus. */
function toolWindow(id: string, name: string, windows: string, macos: string, show: string, focusedWhen?: string): KeymapAction[] {
  const hide = focusedWhen?.includes('activePanel') || focusedWhen === 'terminalFocus' ? 'workbench.action.closePanel' : 'workbench.action.closeSidebar';
  return [{ id, name, category: 'Tool Windows', windows, macos, command: show, ...(focusedWhen && { variants: [{ command: hide, when: focusedWhen }] }) }];
}

export const KEYMAP: readonly KeymapAction[] = [
  // Navigation
  { id: 'SearchEverywhere', name: 'Search Everywhere', category: 'Navigation', windows: 'shift shift', macos: 'shift shift', command: 'unintellij.searchEverywhere' },
  { id: 'GotoAction', name: 'Find Action', category: 'Navigation', windows: 'ctrl+shift+a', macos: 'cmd+shift+a', command: 'unintellij.findAction' },
  { id: 'GotoClass', name: 'Go to Class', category: 'Navigation', windows: 'ctrl+n', macos: 'cmd+o', command: 'unintellij.gotoClass' },
  { id: 'GotoFile', name: 'Go to File', category: 'Navigation', windows: 'ctrl+shift+n', macos: 'cmd+shift+o', command: 'unintellij.gotoFile' },
  { id: 'GotoSymbol', name: 'Go to Symbol', category: 'Navigation', windows: 'ctrl+alt+shift+n', macos: 'cmd+alt+o', command: 'unintellij.gotoSymbol' },
  { id: 'RecentFiles', name: 'Recent Files', category: 'Navigation', windows: 'ctrl+e', macos: 'cmd+e', command: 'unintellij.recentFiles' },
  { id: 'RecentLocations', name: 'Recent Locations', category: 'Navigation', windows: 'ctrl+shift+e', macos: 'cmd+shift+e', command: 'unintellij.recentLocations' },
  { id: 'FileStructurePopup', name: 'File Structure', category: 'Navigation', windows: 'ctrl+f12', macos: 'cmd+f12', command: 'unintellij.fileStructure' },
  { id: 'GotoLine', name: 'Go to Line:Column', category: 'Navigation', windows: 'ctrl+g', macos: 'cmd+l', command: 'workbench.action.gotoLine' },
  { id: 'GotoDeclaration', name: 'Go to Declaration or Usages', category: 'Navigation', windows: 'ctrl+b', macos: 'cmd+b', command: 'editor.action.revealDefinition', when: EDITOR },
  { id: 'GotoImplementation', name: 'Go to Implementation(s)', category: 'Navigation', windows: 'ctrl+alt+b', macos: 'cmd+alt+b', command: 'editor.action.goToImplementation', when: EDITOR },
  { id: 'GotoTypeDeclaration', name: 'Go to Type Declaration', category: 'Navigation', windows: 'ctrl+shift+b', macos: 'cmd+shift+b', command: 'editor.action.goToTypeDefinition', when: EDITOR },
  { id: 'FindUsages', name: 'Find Usages', category: 'Navigation', windows: 'alt+f7', macos: 'alt+f7', command: 'references-view.findReferences', when: EDITOR },
  { id: 'ShowUsages', name: 'Show Usages', category: 'Navigation', windows: 'ctrl+alt+f7', macos: 'cmd+alt+f7', command: 'editor.action.referenceSearch.trigger', when: EDITOR },
  { id: 'HighlightUsagesInFile', name: 'Highlight Usages in File', category: 'Navigation', windows: 'ctrl+shift+f7', macos: 'cmd+shift+f7', command: 'editor.action.wordHighlight.trigger', when: EDITOR },
  { id: 'QuickImplementations', name: 'Quick Definition', category: 'Navigation', windows: 'ctrl+shift+i', macos: 'alt+space', command: 'editor.action.peekDefinition', when: EDITOR },
  { id: 'QuickJavaDoc', name: 'Quick Documentation', category: 'Navigation', windows: 'ctrl+q', macos: 'f1', command: 'editor.action.showHover', when: EDITOR },
  { id: 'ParameterInfo', name: 'Parameter Info', category: 'Navigation', windows: 'ctrl+p', macos: 'cmd+p', command: 'editor.action.triggerParameterHints', when: EDITOR },
  { id: 'Back', name: 'Back', category: 'Navigation', windows: 'ctrl+alt+left', macos: 'cmd+[', command: 'workbench.action.navigateBack' },
  { id: 'Forward', name: 'Forward', category: 'Navigation', windows: 'ctrl+alt+right', macos: 'cmd+]', command: 'workbench.action.navigateForward' },
  { id: 'MethodDown', name: 'Next Method', category: 'Navigation', windows: 'alt+down', macos: 'ctrl+down', command: 'unintellij.nextMethod', when: EDITOR },
  { id: 'MethodUp', name: 'Previous Method', category: 'Navigation', windows: 'alt+up', macos: 'ctrl+up', command: 'unintellij.previousMethod', when: EDITOR },
  { id: 'GotoNextError', name: 'Next Highlighted Error', category: 'Navigation', windows: 'f2', macos: 'f2', command: 'editor.action.marker.nextInFiles', when: EDITOR },
  { id: 'GotoPreviousError', name: 'Previous Highlighted Error', category: 'Navigation', windows: 'shift+f2', macos: 'shift+f2', command: 'editor.action.marker.prevInFiles', when: EDITOR },
  { id: 'SelectIn', name: 'Select In… (Project View)', category: 'Navigation', windows: 'alt+f1', macos: 'alt+f1', command: 'unintellij.project.selectOpenedFile' },
  { id: 'Find', name: 'Find', category: 'Navigation', windows: 'ctrl+f', macos: 'cmd+f', command: 'actions.find', when: 'editorFocus || editorIsOpen' },
  { id: 'Replace', name: 'Replace', category: 'Navigation', windows: 'ctrl+r', macos: 'cmd+r', command: 'editor.action.startFindReplaceAction', when: 'editorFocus || editorIsOpen' },
  { id: 'FindInPath', name: 'Find in Files', category: 'Navigation', windows: 'ctrl+shift+f', macos: 'cmd+shift+f', command: 'workbench.action.findInFiles' },
  { id: 'ReplaceInPath', name: 'Replace in Files', category: 'Navigation', windows: 'ctrl+shift+r', macos: 'cmd+shift+r', command: 'workbench.action.replaceInFiles' },
  { id: 'FindNext', name: 'Find Next Occurrence', category: 'Navigation', windows: 'f3', macos: 'cmd+g', command: 'editor.action.nextMatchFindAction', when: 'editorFocus' },
  { id: 'FindPrevious', name: 'Find Previous Occurrence', category: 'Navigation', windows: 'shift+f3', macos: 'cmd+shift+g', command: 'editor.action.previousMatchFindAction', when: 'editorFocus' },

  // Editing
  { id: 'ShowIntentionActions', name: 'Show Context Actions', category: 'Editing', windows: 'alt+enter', macos: 'alt+enter', command: 'editor.action.quickFix', when: `${EDITOR_WRITABLE} && !findWidgetVisible` },
  { id: 'CodeCompletion', name: 'Basic Completion', category: 'Editing', windows: 'ctrl+space', macos: 'ctrl+space', command: 'editor.action.triggerSuggest', when: EDITOR_WRITABLE },
  { id: 'SmartTypeCompletion', name: 'Type-Matching Completion', category: 'Editing', windows: 'ctrl+shift+space', macos: 'ctrl+shift+space', command: 'editor.action.triggerSuggest', when: EDITOR_WRITABLE },
  { id: 'Generate', name: 'Generate…', category: 'Editing', windows: 'alt+insert', macos: 'cmd+n', command: 'editor.action.sourceAction', when: EDITOR_WRITABLE },
  { id: 'Console.Jdbc.Execute', name: 'Execute (SQL)', category: 'Database', windows: 'ctrl+enter', macos: 'cmd+enter', command: 'unintellij.database.execute', when: "editorTextFocus && editorLangId == 'sql'" },
  { id: 'NewElement', name: 'New… (Project View)', category: 'Editing', windows: 'alt+insert', macos: 'cmd+n', command: 'unintellij.project.newFile', when: "focusedView == 'unintellij.project' && !inputFocus" },
  { id: '$Delete', name: 'Delete (Project View)', category: 'Editing', windows: 'delete', macos: 'cmd+backspace', command: 'unintellij.project.delete', when: "focusedView == 'unintellij.project' && !inputFocus" },
  { id: 'SurroundWith', name: 'Surround With…', category: 'Editing', windows: 'ctrl+alt+t', macos: 'cmd+alt+t', command: 'editor.action.surroundWithSnippet', when: EDITOR_WRITABLE },
  { id: 'InsertLiveTemplate', name: 'Insert Live Template…', category: 'Editing', windows: 'ctrl+j', macos: 'cmd+j', command: 'editor.action.showSnippets', when: EDITOR_WRITABLE },
  { id: 'ReformatCode', name: 'Reformat Code', category: 'Editing', windows: 'ctrl+alt+l', macos: 'cmd+alt+l', command: 'editor.action.formatDocument', when: `${EDITOR_WRITABLE} && !editorHasSelection` },
  { id: 'ReformatCodeSelection', name: 'Reformat Code (Selection)', category: 'Editing', windows: 'ctrl+alt+l', macos: 'cmd+alt+l', command: 'editor.action.formatSelection', when: `${EDITOR_WRITABLE} && editorHasSelection` },
  { id: 'OptimizeImports', name: 'Optimize Imports', category: 'Editing', windows: 'ctrl+alt+o', macos: 'ctrl+alt+o', command: 'editor.action.organizeImports', when: EDITOR_WRITABLE },
  { id: 'EditorSelectWord', name: 'Extend Selection', category: 'Editing', windows: 'ctrl+w', macos: 'alt+up', command: 'editor.action.smartSelect.expand', when: 'editorFocus' },
  { id: 'EditorUnSelectWord', name: 'Shrink Selection', category: 'Editing', windows: 'ctrl+shift+w', macos: 'alt+down', command: 'editor.action.smartSelect.shrink', when: 'editorFocus' },
  { id: 'EditorDuplicate', name: 'Duplicate Line or Selection', category: 'Editing', windows: 'ctrl+d', macos: 'cmd+d', command: 'editor.action.duplicateSelection', when: EDITOR_WRITABLE },
  { id: 'EditorDeleteLine', name: 'Delete Line', category: 'Editing', windows: 'ctrl+y', macos: 'cmd+backspace', command: 'editor.action.deleteLines', when: EDITOR_WRITABLE },
  { id: 'MoveLineUp', name: 'Move Line Up', category: 'Editing', windows: 'alt+shift+up', macos: 'alt+shift+up', command: 'editor.action.moveLinesUpAction', when: EDITOR_WRITABLE },
  { id: 'MoveLineDown', name: 'Move Line Down', category: 'Editing', windows: 'alt+shift+down', macos: 'alt+shift+down', command: 'editor.action.moveLinesDownAction', when: EDITOR_WRITABLE },
  { id: 'MoveStatementUp', name: 'Move Statement Up', category: 'Editing', windows: 'ctrl+shift+up', macos: 'cmd+shift+up', command: 'editor.action.moveLinesUpAction', when: EDITOR_WRITABLE },
  { id: 'MoveStatementDown', name: 'Move Statement Down', category: 'Editing', windows: 'ctrl+shift+down', macos: 'cmd+shift+down', command: 'editor.action.moveLinesDownAction', when: EDITOR_WRITABLE },
  { id: 'CommentByLineComment', name: 'Comment with Line Comment', category: 'Editing', windows: 'ctrl+/', macos: 'cmd+/', command: 'editor.action.commentLine', when: EDITOR_WRITABLE },
  { id: 'CommentByBlockComment', name: 'Comment with Block Comment', category: 'Editing', windows: 'ctrl+shift+/', macos: 'cmd+alt+/', command: 'editor.action.blockComment', when: EDITOR_WRITABLE },
  { id: 'EditorStartNewLine', name: 'Start New Line', category: 'Editing', windows: 'shift+enter', macos: 'shift+enter', command: 'editor.action.insertLineAfter', when: `${EDITOR_WRITABLE} && !suggestWidgetVisible` },
  { id: 'EditorStartNewLineBefore', name: 'Start New Line Before Current', category: 'Editing', windows: 'ctrl+alt+enter', macos: 'cmd+alt+enter', command: 'editor.action.insertLineBefore', when: EDITOR_WRITABLE },
  { id: 'EditorJoinLines', name: 'Join Lines', category: 'Editing', windows: 'ctrl+shift+j', macos: 'ctrl+shift+j', command: 'editor.action.joinLines', when: EDITOR_WRITABLE },
  { id: 'EditorToggleCase', name: 'Toggle Case', category: 'Editing', windows: 'ctrl+shift+u', macos: 'cmd+shift+u', command: 'unintellij.toggleCase', when: EDITOR_WRITABLE },
  { id: 'SelectNextOccurrence', name: 'Add Selection for Next Occurrence', category: 'Editing', windows: 'alt+j', macos: 'ctrl+g', command: 'editor.action.addSelectionToNextFindMatch', when: 'editorFocus' },
  { id: 'UnselectPreviousOccurrence', name: 'Unselect Occurrence', category: 'Editing', windows: 'alt+shift+j', macos: 'ctrl+shift+g', command: 'cursorUndo', when: 'editorFocus' },
  { id: 'SelectAllOccurrences', name: 'Select All Occurrences', category: 'Editing', windows: 'ctrl+alt+shift+j', macos: 'ctrl+cmd+g', command: 'editor.action.selectHighlights', when: 'editorFocus' },
  { id: 'CollapseRegion', name: 'Collapse', category: 'Editing', windows: 'ctrl+-', macos: 'cmd+-', command: 'editor.fold', when: 'editorFocus' },
  { id: 'ExpandRegion', name: 'Expand', category: 'Editing', windows: 'ctrl+=', macos: 'cmd+=', command: 'editor.unfold', when: 'editorFocus' },
  { id: 'CollapseAllRegions', name: 'Collapse All', category: 'Editing', windows: 'ctrl+shift+-', macos: 'cmd+shift+-', command: 'editor.foldAll', when: 'editorFocus' },
  { id: 'ExpandAllRegions', name: 'Expand All', category: 'Editing', windows: 'ctrl+shift+=', macos: 'cmd+shift+=', command: 'editor.unfoldAll', when: 'editorFocus' },
  { id: 'Redo', name: 'Redo', category: 'Editing', windows: 'ctrl+shift+z', macos: 'cmd+shift+z', command: 'redo', when: EDITOR_WRITABLE },
  { id: 'CopyPaths', name: 'Copy Absolute Path', category: 'Editing', windows: 'ctrl+shift+c', macos: 'cmd+shift+c', command: 'copyFilePath' },

  // Refactoring
  { id: 'Refactorings.QuickListPopupAction', name: 'Refactor This…', category: 'Refactoring', windows: 'ctrl+alt+shift+t', macos: 'ctrl+t', command: 'editor.action.refactor', when: EDITOR_WRITABLE },
  { id: 'RenameElement', name: 'Rename…', category: 'Refactoring', windows: 'shift+f6', macos: 'shift+f6', command: 'editor.action.rename', when: EDITOR_WRITABLE },
  { id: 'RenameFile', name: 'Rename File… (Project View)', category: 'Refactoring', windows: 'shift+f6', macos: 'shift+f6', command: 'unintellij.project.rename', when: "focusedView == 'unintellij.project' && !inputFocus" },
  { id: 'ExtractMethod', name: 'Extract Method…', category: 'Refactoring', windows: 'ctrl+alt+m', macos: 'cmd+alt+m', command: 'editor.action.codeAction', args: { kind: 'refactor.extract.function', apply: 'ifSingle' }, when: EDITOR_WRITABLE },
  { id: 'IntroduceVariable', name: 'Introduce Variable…', category: 'Refactoring', windows: 'ctrl+alt+v', macos: 'cmd+alt+v', command: 'editor.action.codeAction', args: { kind: 'refactor.extract', apply: 'never' }, when: EDITOR_WRITABLE },
  { id: 'Inline', name: 'Inline…', category: 'Refactoring', windows: 'ctrl+alt+n', macos: 'cmd+alt+n', command: 'editor.action.codeAction', args: { kind: 'refactor.inline', apply: 'ifSingle' }, when: EDITOR_WRITABLE },
  { id: 'Move', name: 'Move…', category: 'Refactoring', windows: 'f6', macos: 'f6', command: 'editor.action.codeAction', args: { kind: 'refactor.move', apply: 'never' }, when: EDITOR_WRITABLE },

  // Tool windows
  ...toolWindow('ActivateProjectToolWindow', 'Project', 'alt+1', 'cmd+1', containerCommand('unintellij-project'), sideBarShows(containerCommand('unintellij-project'))),
  ...toolWindow('ActivateFindToolWindow', 'Find', 'alt+3', 'cmd+3', 'workbench.view.search', sideBarShows('workbench.view.search')),
  ...toolWindow('ActivateRunToolWindow', 'Run', 'alt+4', 'cmd+4', 'workbench.debug.action.toggleRepl'),
  ...toolWindow('ActivateDebugToolWindow', 'Debug', 'alt+5', 'cmd+5', 'workbench.view.debug', sideBarShows('workbench.view.debug')),
  ...toolWindow('ActivateProblemsViewToolWindow', 'Problems', 'alt+6', 'cmd+6', 'workbench.actions.view.problems', panelShows('workbench.panel.markers')),
  ...toolWindow('ActivateStructureToolWindow', 'Structure', 'alt+7', 'cmd+7', 'outline.focus', "focusedView == 'outline'"),
  ...toolWindow('ActivateVersionControlToolWindow', 'Git', 'alt+9', 'cmd+9', containerCommand('unintellij-git'), panelShows(containerCommand('unintellij-git'))),
  // Focusing the Commit view (not just the container) expands it, which also hides VS Code's own views.
  ...toolWindow('ActivateCommitToolWindow', 'Commit', 'alt+0', 'cmd+0', 'unintellij.commit.focus', sideBarShows('workbench.view.scm')),
  ...toolWindow('ActivateTerminalToolWindow', 'Terminal', 'alt+f12', 'alt+f12', 'terminal.focus', 'terminalFocus'),
  { id: 'HideActiveWindow', name: 'Hide Active Tool Window', category: 'Tool Windows', windows: 'shift+escape', macos: 'shift+escape', command: 'workbench.action.closeSidebar', when: 'sideBarFocus', variants: [{ command: 'workbench.action.closePanel', when: 'panelFocus' }] },
  { id: 'FocusEditor', name: 'Focus Editor', category: 'Tool Windows', windows: 'escape', macos: 'escape', command: 'workbench.action.focusActiveEditorGroup', when: '(sideBarFocus || panelFocus && !terminalFocus) && !inputFocus && !listHasSelectionOrFocus' },
  { id: 'HideAllWindows', name: 'Hide All Tool Windows', category: 'Tool Windows', windows: 'ctrl+shift+f12', macos: 'cmd+shift+f12', command: 'workbench.action.maximizeEditorHideSidebar' },
  { id: 'MaximizeToolWindow', name: 'Maximize Tool Window', category: 'Tool Windows', windows: "ctrl+shift+'", macos: "cmd+shift+'", command: 'workbench.action.toggleMaximizedPanel', when: 'panelFocus' },
  { id: 'ShowSettings', name: 'Settings…', category: 'Tool Windows', windows: 'ctrl+alt+s', macos: 'cmd+,', command: 'unintellij.showSettings' },
  { id: 'QuickChangeScheme', name: 'Quick Switch Scheme…', category: 'Tool Windows', windows: 'ctrl+`', macos: 'ctrl+`', command: 'workbench.action.selectTheme' },

  // Version control
  { id: 'CheckinProject', name: 'Commit…', category: 'Version Control', windows: 'ctrl+k', macos: 'cmd+k', command: 'unintellij.commit' },
  { id: 'Vcs.Push', name: 'Push…', category: 'Version Control', windows: 'ctrl+shift+k', macos: 'cmd+shift+k', command: 'unintellij.push' },
  { id: 'Vcs.UpdateProject', name: 'Update Project…', category: 'Version Control', windows: 'ctrl+t', macos: 'cmd+t', command: 'unintellij.updateProject' },
  { id: 'ChangesView.Revert', name: 'Rollback…', category: 'Version Control', windows: 'ctrl+alt+z', macos: 'cmd+alt+z', command: 'git.revertSelectedRanges', when: EDITOR_WRITABLE },
  { id: 'Vcs.QuickListPopupAction', name: 'VCS Operations Popup…', category: 'Version Control', windows: 'alt+`', macos: 'ctrl+v', command: 'unintellij.vcsOperations' },
  { id: 'Git.Branches', name: 'Branches…', category: 'Version Control', windows: 'ctrl+shift+`', macos: 'cmd+shift+`', command: 'unintellij.branches' },
  { id: 'VcsShowNextChangeMarker', name: 'Next Change', category: 'Version Control', windows: 'ctrl+alt+shift+down', macos: 'ctrl+alt+shift+down', command: 'workbench.action.editor.nextChange', when: EDITOR },
  { id: 'VcsShowPrevChangeMarker', name: 'Previous Change', category: 'Version Control', windows: 'ctrl+alt+shift+up', macos: 'ctrl+alt+shift+up', command: 'workbench.action.editor.previousChange', when: EDITOR },
  { id: 'NextDiff', name: 'Next Difference', category: 'Version Control', windows: 'f7', macos: 'f7', command: 'workbench.action.compareEditor.nextChange', when: 'textCompareEditorVisible && !inDebugMode' },
  { id: 'PreviousDiff', name: 'Previous Difference', category: 'Version Control', windows: 'shift+f7', macos: 'shift+f7', command: 'workbench.action.compareEditor.previousChange', when: 'textCompareEditorVisible && !inDebugMode' },

  // Run and debug
  { id: 'Run', name: 'Run', category: 'Run and Debug', windows: 'shift+f10', macos: 'ctrl+r', command: 'unintellij.run' },
  { id: 'Debug', name: 'Debug', category: 'Run and Debug', windows: 'shift+f9', macos: 'ctrl+d', command: 'unintellij.debug' },
  { id: 'ChooseRunConfiguration', name: 'Run…', category: 'Run and Debug', windows: 'alt+shift+f10', macos: 'ctrl+alt+r', command: 'unintellij.runAnything' },
  { id: 'ChooseDebugConfiguration', name: 'Debug…', category: 'Run and Debug', windows: 'alt+shift+f9', macos: 'ctrl+alt+d', command: 'unintellij.debugAnything' },
  { id: 'Stop', name: 'Stop', category: 'Run and Debug', windows: 'ctrl+f2', macos: 'cmd+f2', command: 'unintellij.stop' },
  { id: 'Rerun', name: 'Rerun', category: 'Run and Debug', windows: 'ctrl+f5', macos: 'cmd+r', command: 'workbench.action.debug.restart', when: DEBUGGING },
  { id: 'ToggleLineBreakpoint', name: 'Toggle Line Breakpoint', category: 'Run and Debug', windows: 'ctrl+f8', macos: 'cmd+f8', command: 'editor.debug.action.toggleBreakpoint', when: 'editorTextFocus' },
  { id: 'ViewBreakpoints', name: 'View Breakpoints…', category: 'Run and Debug', windows: 'ctrl+shift+f8', macos: 'cmd+shift+f8', command: 'workbench.debug.viewlet.action.focusBreakpointsView' },
  { id: 'StepOver', name: 'Step Over', category: 'Run and Debug', windows: 'f8', macos: 'f8', command: 'workbench.action.debug.stepOver', when: DEBUGGING },
  { id: 'StepInto', name: 'Step Into', category: 'Run and Debug', windows: 'f7', macos: 'f7', command: 'workbench.action.debug.stepInto', when: DEBUGGING },
  { id: 'StepOut', name: 'Step Out', category: 'Run and Debug', windows: 'shift+f8', macos: 'shift+f8', command: 'workbench.action.debug.stepOut', when: DEBUGGING },
  { id: 'Resume', name: 'Resume Program', category: 'Run and Debug', windows: 'f9', macos: 'cmd+alt+r', command: 'workbench.action.debug.continue', when: DEBUGGING },
  { id: 'EvaluateExpression', name: 'Evaluate Expression…', category: 'Run and Debug', windows: 'alt+f8', macos: 'alt+f8', command: 'editor.debug.action.selectionToRepl', when: DEBUGGING },
  { id: 'RunToCursor', name: 'Run to Cursor', category: 'Run and Debug', windows: 'alt+f9', macos: 'alt+f9', command: 'editor.debug.action.runToCursor', when: DEBUGGING },

  // Tabs and windows
  { id: 'NextTab', name: 'Select Next Tab', category: 'Tabs and Windows', windows: 'alt+right', macos: 'cmd+shift+]', command: 'workbench.action.nextEditor', when: '!terminalFocus' },
  { id: 'PreviousTab', name: 'Select Previous Tab', category: 'Tabs and Windows', windows: 'alt+left', macos: 'cmd+shift+[', command: 'workbench.action.previousEditor', when: '!terminalFocus' },
  { id: 'CloseContent', name: 'Close Tab', category: 'Tabs and Windows', windows: 'ctrl+f4', macos: 'cmd+w', command: 'workbench.action.closeActiveEditor' },
  { id: 'ReopenClosedTab', name: 'Reopen Closed Tab', category: 'Tabs and Windows', windows: 'ctrl+shift+t', macos: 'cmd+shift+t', command: 'workbench.action.reopenClosedEditor' },
  { id: 'Switcher', name: 'Switcher', category: 'Tabs and Windows', windows: 'ctrl+tab', macos: 'ctrl+tab', command: 'workbench.action.quickOpenPreviousRecentlyUsedEditor' },
  { id: 'SaveAll', name: 'Save All', category: 'Tabs and Windows', windows: 'ctrl+s', macos: 'cmd+s', command: 'workbench.action.files.saveAll' },
  { id: 'NewScratchFile', name: 'New Scratch File…', category: 'Tabs and Windows', windows: 'ctrl+alt+shift+insert', macos: 'cmd+shift+n', command: 'workbench.action.files.newUntitledFile' },
];

export type KeymapOs = 'windows' | 'macos';

export interface Keybinding {
  key: string;
  command: string;
  when: string;
  args?: unknown;
}

const LAYOUT = 'config.unintellij.keymap.layout';
export const KEYMAP_CONDITION: Record<KeymapOs, string> = {
  windows: `(${LAYOUT} == 'windows' || ${LAYOUT} == 'auto' && !isMac)`,
  macos: `(${LAYOUT} == 'macos' || ${LAYOUT} == 'auto' && isMac)`,
};

export function disabledContextKey(actionId: string): string {
  return `unintellij.keymap.disabled.${actionId}`;
}

/** Keybindings of UnIntelliJ's own UI (not IntelliJ actions): active whatever the keymap. */
export const INTERNAL_KEYBINDINGS: readonly Keybinding[] = [
  { key: 'tab', command: 'unintellij.searchEverywhere.nextTab', when: 'inQuickOpen && unintellij.searchEverywhereVisible' },
  { key: 'shift+tab', command: 'unintellij.searchEverywhere.previousTab', when: 'inQuickOpen && unintellij.searchEverywhereVisible' },
];

/** Every `contributes.keybindings` entry: both keymaps, then internal bindings. */
export function buildKeybindings(): Keybinding[] {
  return [...buildKeymapBindings(), ...INTERNAL_KEYBINDINGS];
}

/** The keybindings of every IntelliJ action, for both keymaps. */
export function buildKeymapBindings(actions: readonly KeymapAction[] = KEYMAP): Keybinding[] {
  const result: Keybinding[] = [];
  for (const os of ['windows', 'macos'] as const) {
    for (const action of actions) {
      const key = action[os];
      if (!key) {
        continue;
      }
      const when = [KEYMAP_CONDITION[os], `!${disabledContextKey(action.id)}`, ...(action.when ? [`(${action.when})`] : [])].join(' && ');
      result.push({ key, command: action.command, when, ...(action.args !== undefined && { args: action.args }) });
      for (const variant of action.variants ?? []) {
        const base = [KEYMAP_CONDITION[os], `!${disabledContextKey(action.id)}`, `(${variant.when})`].join(' && ');
        result.push({ key, command: variant.command, when: base, ...(variant.args !== undefined && { args: variant.args }) });
      }
    }
  }
  return result;
}

/** Commands implemented by UnIntelliJ that keybindings point to. */
export function ownCommands(actions: readonly KeymapAction[] = KEYMAP): string[] {
  const commands = [...actions.flatMap((a) => [a.command, ...(a.variants ?? []).map((v) => v.command)]), ...INTERNAL_KEYBINDINGS.map((k) => k.command)];
  // `<view id>.focus` commands are generated by VS Code for each view, not contributed by us.
  return [...new Set(commands.filter((c) => c.startsWith('unintellij.') && !c.endsWith('.focus')))].sort();
}

const DISPLAY: Record<KeymapOs, Record<string, string>> = {
  windows: { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', meta: 'Win' },
  macos: { ctrl: '⌃', shift: '⇧', alt: '⌥', cmd: '⌘' },
};

/** Formats a VS Code key like IntelliJ displays it: `ctrl+shift+n` → `Ctrl+Shift+N`, `⇧⌘O`. */
export function formatKey(key: string, os: KeymapOs): string {
  const names: Record<string, string> = {
    escape: os === 'macos' ? '⎋' : 'Esc',
    enter: os === 'macos' ? '↩' : 'Enter',
    backspace: os === 'macos' ? '⌫' : 'Backspace',
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    space: 'Space',
    insert: 'Insert',
    tab: 'Tab',
  };
  return key
    .split(' ')
    .map((chord) => {
      const parts = chord.split('+').map((p) => DISPLAY[os][p] ?? names[p] ?? p.toUpperCase());
      return os === 'macos' ? parts.join('') : parts.join('+');
    })
    .join(os === 'macos' ? '' : ', ')
    .replace(/^(⇧)\1$/, '⇧⇧')
    .replace(/^Shift, Shift$/, 'Double Shift');
}

/** Markdown reference of the keymap. */
export function buildKeymapMarkdown(actions: readonly KeymapAction[] = KEYMAP): string {
  const lines = [
    '# Keymap',
    '',
    '<!-- Generated from src/keymap/keymap.ts by `npm run gen` — do not edit. -->',
    '',
    "UnIntelliJ reproduces IntelliJ's default **Windows** and **macOS** keymaps. The one used is chosen by",
    '`unintellij.keymap.layout` (`auto` follows the OS). Any action can be disabled by adding its ID to',
    '`unintellij.keymap.disabledActions`.',
    '',
  ];
  for (const category of CATEGORIES) {
    lines.push(`## ${category}`, '', '| Action | Windows | macOS | ID |', '|---|---|---|---|');
    for (const a of actions.filter((x) => x.category === category)) {
      const win = a.windows ? `\`${formatKey(a.windows, 'windows')}\`` : '';
      const mac = a.macos ? `\`${formatKey(a.macos, 'macos')}\`` : '';
      lines.push(`| ${a.name} | ${win} | ${mac} | \`${a.id}\` |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const CODE_KEYS: Record<string, string> = {
  Enter: 'enter', Escape: 'escape', Backspace: 'backspace', Delete: 'delete', Insert: 'insert', Tab: 'tab', Space: 'space',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backquote: '`', Quote: "'", Slash: '/', Backslash: '\\', Semicolon: ';', Comma: ',', Period: '.',
};

export interface KeyEventLike {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * VS Code key for a keyboard event (physical key, like VS Code's keybinding editor), or undefined
 * for modifier-only presses. The meta key is `cmd` on macOS and `meta` elsewhere.
 */
export function keyFromEvent(event: KeyEventLike, os: KeymapOs): string | undefined {
  let key: string | undefined;
  if (/^Key[A-Z]$/.test(event.code)) {
    key = event.code.slice(3).toLowerCase();
  } else if (/^Digit\d$/.test(event.code)) {
    key = event.code.slice(5);
  } else if (/^Numpad\d$/.test(event.code)) {
    key = `numpad${event.code.slice(6)}`;
  } else if (/^F\d{1,2}$/.test(event.code)) {
    key = event.code.toLowerCase();
  } else {
    key = CODE_KEYS[event.code];
  }
  if (!key) {
    return undefined;
  }
  const modifiers = [event.ctrlKey && 'ctrl', event.shiftKey && 'shift', event.altKey && 'alt', event.metaKey && (os === 'macos' ? 'cmd' : 'meta')].filter(Boolean);
  return [...modifiers, key].join('+');
}

/** Entries for the user's keybindings.json implementing reassigned shortcuts. */
export function customKeybindings(custom: Readonly<Record<string, string>>, actions: readonly KeymapAction[] = KEYMAP): Keybinding[] {
  const result: Keybinding[] = [];
  for (const action of actions) {
    const key = custom[action.id];
    if (!key) {
      continue;
    }
    result.push({ key, command: action.command, when: action.when ?? '', ...(action.args !== undefined && { args: action.args }) });
    for (const variant of action.variants ?? []) {
      result.push({ key, command: variant.command, when: variant.when, ...(variant.args !== undefined && { args: variant.args }) });
    }
  }
  return result.map((k) => (k.when ? k : (({ when: _when, ...rest }) => rest as Keybinding)(k)));
}
