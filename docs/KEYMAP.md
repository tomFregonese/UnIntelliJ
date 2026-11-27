# Keymap

<!-- Generated from src/keymap/keymap.ts by `npm run gen` — do not edit. -->

UnIntelliJ reproduces IntelliJ's default **Windows** and **macOS** keymaps. The one used is chosen by
`unintellij.keymap.layout` (`auto` follows the OS). Any action can be disabled by adding its ID to
`unintellij.keymap.disabledActions`.

## Navigation

| Action | Windows | macOS | ID |
|---|---|---|---|
| Search Everywhere | `Double Shift` | `⇧⇧` | `SearchEverywhere` |
| Find Action | `Ctrl+Shift+A` | `⌘⇧A` | `GotoAction` |
| Go to Class | `Ctrl+N` | `⌘O` | `GotoClass` |
| Go to File | `Ctrl+Shift+N` | `⌘⇧O` | `GotoFile` |
| Go to Symbol | `Ctrl+Alt+Shift+N` | `⌘⌥O` | `GotoSymbol` |
| Recent Files | `Ctrl+E` | `⌘E` | `RecentFiles` |
| Recent Locations | `Ctrl+Shift+E` | `⌘⇧E` | `RecentLocations` |
| File Structure | `Ctrl+F12` | `⌘F12` | `FileStructurePopup` |
| Go to Line:Column | `Ctrl+G` | `⌘L` | `GotoLine` |
| Go to Declaration or Usages | `Ctrl+B` | `⌘B` | `GotoDeclaration` |
| Go to Implementation(s) | `Ctrl+Alt+B` | `⌘⌥B` | `GotoImplementation` |
| Go to Type Declaration | `Ctrl+Shift+B` | `⌘⇧B` | `GotoTypeDeclaration` |
| Find Usages | `Alt+F7` | `⌥F7` | `FindUsages` |
| Show Usages | `Ctrl+Alt+F7` | `⌘⌥F7` | `ShowUsages` |
| Highlight Usages in File | `Ctrl+Shift+F7` | `⌘⇧F7` | `HighlightUsagesInFile` |
| Quick Definition | `Ctrl+Shift+I` | `⌥Space` | `QuickImplementations` |
| Quick Documentation | `Ctrl+Q` | `F1` | `QuickJavaDoc` |
| Parameter Info | `Ctrl+P` | `⌘P` | `ParameterInfo` |
| Back | `Ctrl+Alt+←` | `⌘[` | `Back` |
| Forward | `Ctrl+Alt+→` | `⌘]` | `Forward` |
| Next Method | `Alt+↓` | `⌃↓` | `MethodDown` |
| Previous Method | `Alt+↑` | `⌃↑` | `MethodUp` |
| Next Highlighted Error | `F2` | `F2` | `GotoNextError` |
| Previous Highlighted Error | `Shift+F2` | `⇧F2` | `GotoPreviousError` |
| Select In… (Project View) | `Alt+F1` | `⌥F1` | `SelectIn` |
| Find | `Ctrl+F` | `⌘F` | `Find` |
| Replace | `Ctrl+R` | `⌘R` | `Replace` |
| Find in Files | `Ctrl+Shift+F` | `⌘⇧F` | `FindInPath` |
| Replace in Files | `Ctrl+Shift+R` | `⌘⇧R` | `ReplaceInPath` |
| Find Next Occurrence | `F3` | `⌘G` | `FindNext` |
| Find Previous Occurrence | `Shift+F3` | `⌘⇧G` | `FindPrevious` |

## Editing

| Action | Windows | macOS | ID |
|---|---|---|---|
| Show Context Actions | `Alt+Enter` | `⌥↩` | `ShowIntentionActions` |
| Basic Completion | `Ctrl+Space` | `⌃Space` | `CodeCompletion` |
| Type-Matching Completion | `Ctrl+Shift+Space` | `⌃⇧Space` | `SmartTypeCompletion` |
| Generate… | `Alt+Insert` | `⌘N` | `Generate` |
| New… (Project View) | `Alt+Insert` | `⌘N` | `NewElement` |
| Delete (Project View) | `DELETE` | `⌘⌫` | `$Delete` |
| Surround With… | `Ctrl+Alt+T` | `⌘⌥T` | `SurroundWith` |
| Insert Live Template… | `Ctrl+J` | `⌘J` | `InsertLiveTemplate` |
| Reformat Code | `Ctrl+Alt+L` | `⌘⌥L` | `ReformatCode` |
| Reformat Code (Selection) | `Ctrl+Alt+L` | `⌘⌥L` | `ReformatCodeSelection` |
| Optimize Imports | `Ctrl+Alt+O` | `⌃⌥O` | `OptimizeImports` |
| Extend Selection | `Shift+Alt+→` | `⌥↑` | `EditorSelectWord` |
| Shrink Selection | `Shift+Alt+←` | `⌥↓` | `EditorUnSelectWord` |
| Duplicate Line or Selection | `Ctrl+D` | `⌘D` | `EditorDuplicate` |
| Delete Line | `Ctrl+Y` | `⌘⌫` | `EditorDeleteLine` |
| Move Line Up | `Alt+Shift+↑` | `⌥⇧↑` | `MoveLineUp` |
| Move Line Down | `Alt+Shift+↓` | `⌥⇧↓` | `MoveLineDown` |
| Move Statement Up | `Ctrl+Shift+↑` | `⌘⇧↑` | `MoveStatementUp` |
| Move Statement Down | `Ctrl+Shift+↓` | `⌘⇧↓` | `MoveStatementDown` |
| Comment with Line Comment | `Ctrl+/` | `⌘/` | `CommentByLineComment` |
| Comment with Block Comment | `Ctrl+Shift+/` | `⌘⌥/` | `CommentByBlockComment` |
| Start New Line | `Shift+Enter` | `⇧↩` | `EditorStartNewLine` |
| Start New Line Before Current | `Ctrl+Alt+Enter` | `⌘⌥↩` | `EditorStartNewLineBefore` |
| Join Lines | `Ctrl+Shift+J` | `⌃⇧J` | `EditorJoinLines` |
| Toggle Case | `Ctrl+Shift+U` | `⌘⇧U` | `EditorToggleCase` |
| Add Selection for Next Occurrence | `Alt+J` | `⌃G` | `SelectNextOccurrence` |
| Unselect Occurrence | `Alt+Shift+J` | `⌃⇧G` | `UnselectPreviousOccurrence` |
| Select All Occurrences | `Ctrl+Alt+Shift+J` | `⌃⌘G` | `SelectAllOccurrences` |
| Collapse | `Ctrl+-` | `⌘-` | `CollapseRegion` |
| Expand | `Ctrl+=` | `⌘=` | `ExpandRegion` |
| Collapse All | `Ctrl+Shift+-` | `⌘⇧-` | `CollapseAllRegions` |
| Expand All | `Ctrl+Shift+=` | `⌘⇧=` | `ExpandAllRegions` |
| Redo | `Ctrl+Shift+Z` | `⌘⇧Z` | `Redo` |
| Copy Absolute Path | `Ctrl+Shift+C` | `⌘⇧C` | `CopyPaths` |

## Refactoring

| Action | Windows | macOS | ID |
|---|---|---|---|
| Refactor This… | `Ctrl+Alt+Shift+T` | `⌃T` | `Refactorings.QuickListPopupAction` |
| Rename… | `Shift+F6` | `⇧F6` | `RenameElement` |
| Rename File… (Project View) | `Shift+F6` | `⇧F6` | `RenameFile` |
| Extract Method… | `Ctrl+Alt+M` | `⌘⌥M` | `ExtractMethod` |
| Introduce Variable… | `Ctrl+Alt+V` | `⌘⌥V` | `IntroduceVariable` |
| Inline… | `Ctrl+Alt+N` | `⌘⌥N` | `Inline` |
| Move… | `F6` | `F6` | `Move` |

## Tool Windows

| Action | Windows | macOS | ID |
|---|---|---|---|
| Project | `Alt+1` | `⌘1` | `ActivateProjectToolWindow` |
| Find | `Alt+3` | `⌘3` | `ActivateFindToolWindow` |
| Run | `Alt+4` | `⌘4` | `ActivateRunToolWindow` |
| Debug | `Alt+5` | `⌘5` | `ActivateDebugToolWindow` |
| Problems | `Alt+6` | `⌘6` | `ActivateProblemsViewToolWindow` |
| Structure | `Alt+7` | `⌘7` | `ActivateStructureToolWindow` |
| Git | `Alt+9` | `⌘9` | `ActivateVersionControlToolWindow` |
| Commit | `Alt+0` | `⌘0` | `ActivateCommitToolWindow` |
| Terminal | `Alt+F12` | `⌥F12` | `ActivateTerminalToolWindow` |
| Hide Active Tool Window | `Shift+Esc` | `⇧⎋` | `HideActiveWindow` |
| Focus Editor | `Esc` | `⎋` | `FocusEditor` |
| Hide All Tool Windows | `Ctrl+Shift+F12` | `⌘⇧F12` | `HideAllWindows` |
| Maximize Tool Window | `Ctrl+Shift+'` | `⌘⇧'` | `MaximizeToolWindow` |
| Settings… | `Ctrl+Alt+S` | `⌘,` | `ShowSettings` |
| Quick Switch Scheme… | `Ctrl+`` | `⌃`` | `QuickChangeScheme` |

## Version Control

| Action | Windows | macOS | ID |
|---|---|---|---|
| Commit… | `Ctrl+K` | `⌘K` | `CheckinProject` |
| Push… | `Ctrl+Shift+K` | `⌘⇧K` | `Vcs.Push` |
| Update Project… | `Ctrl+T` | `⌘T` | `Vcs.UpdateProject` |
| Rollback… | `Ctrl+Alt+Z` | `⌘⌥Z` | `ChangesView.Revert` |
| VCS Operations Popup… | `Alt+`` | `⌃V` | `Vcs.QuickListPopupAction` |
| Branches… | `Ctrl+Shift+`` | `⌘⇧`` | `Git.Branches` |
| Next Change | `Ctrl+Alt+Shift+↓` | `⌃⌥⇧↓` | `VcsShowNextChangeMarker` |
| Previous Change | `Ctrl+Alt+Shift+↑` | `⌃⌥⇧↑` | `VcsShowPrevChangeMarker` |
| Next Difference | `F7` | `F7` | `NextDiff` |
| Previous Difference | `Shift+F7` | `⇧F7` | `PreviousDiff` |

## Run and Debug

| Action | Windows | macOS | ID |
|---|---|---|---|
| Run | `Shift+F10` | `⌃R` | `Run` |
| Debug | `Shift+F9` | `⌃D` | `Debug` |
| Run… | `Alt+Shift+F10` | `⌃⌥R` | `ChooseRunConfiguration` |
| Debug… | `Alt+Shift+F9` | `⌃⌥D` | `ChooseDebugConfiguration` |
| Stop | `Ctrl+F2` | `⌘F2` | `Stop` |
| Rerun | `Ctrl+F5` | `⌘R` | `Rerun` |
| Toggle Line Breakpoint | `Ctrl+F8` | `⌘F8` | `ToggleLineBreakpoint` |
| View Breakpoints… | `Ctrl+Shift+F8` | `⌘⇧F8` | `ViewBreakpoints` |
| Step Over | `F8` | `F8` | `StepOver` |
| Step Into | `F7` | `F7` | `StepInto` |
| Step Out | `Shift+F8` | `⇧F8` | `StepOut` |
| Resume Program | `F9` | `⌘⌥R` | `Resume` |
| Evaluate Expression… | `Alt+F8` | `⌥F8` | `EvaluateExpression` |
| Run to Cursor | `Alt+F9` | `⌥F9` | `RunToCursor` |

## Database

| Action | Windows | macOS | ID |
|---|---|---|---|
| Execute (SQL) | `Ctrl+Enter` | `⌘↩` | `Console.Jdbc.Execute` |

## Tabs and Windows

| Action | Windows | macOS | ID |
|---|---|---|---|
| Select Next Tab | `Alt+→` | `⌘⇧]` | `NextTab` |
| Select Previous Tab | `Alt+←` | `⌘⇧[` | `PreviousTab` |
| Close Tab | `Ctrl+F4` | `⌘W` | `CloseContent` |
| Reopen Closed Tab | `Ctrl+Shift+T` | `⌘⇧T` | `ReopenClosedTab` |
| Switcher | `Ctrl+Tab` | `⌃Tab` | `Switcher` |
| Save All | `Ctrl+S` | `⌘S` | `SaveAll` |
| New Scratch File… | `Ctrl+Alt+Shift+Insert` | `⌘⇧N` | `NewScratchFile` |
