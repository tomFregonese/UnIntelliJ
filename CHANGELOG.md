# Changelog

## Unreleased

- Project scaffold: esbuild bundle, lint, unit and integration tests, CI on Windows, macOS and Linux.
- Settings catalog (`unintellij.*`) generated from a single typed schema.
- Detection of optional integrations (Git, Java, Java debugger, Angular), logged to the **UnIntelliJ** output channel.
- **Islands Dark** and **Islands Light** color themes (workbench, TextMate and semantic token colors for TS, HTML/Angular, SCSS, Java, JSON, YAML, XML, Markdown), generated from typed palettes.
- Theme selection like IntelliJ: `unintellij.appearance.theme`, **Sync with OS** and preferred dark/light themes, kept in sync both ways with VS Code's theme settings. Switches to Islands on first activation.
- **UnIntelliJ (New UI)** file icon theme: IntelliJ New UI icons for files and special folders (test, resources, excluded…), light and dark variants.
- **UnIntelliJ (New UI)** product icon theme: activity bar, view actions, tree chevrons, debug toolbar, symbols, VCS actions, as a monochrome font derived from the New UI icons.
- Symbol icon colors (Outline, completion, breadcrumbs) taken from IntelliJ's node icons.
- Both icon themes are selected on first activation. Icons © JetBrains, Apache 2.0 — see `NOTICE`.
- IntelliJ **Windows** and **macOS** default keymaps (~105 actions: navigation, editing, refactoring, tool windows, VCS, run/debug, tabs), chosen by `unintellij.keymap.layout` (`auto` follows the OS). Tool window shortcuts toggle like IntelliJ. Any action can be disabled through `unintellij.keymap.disabledActions`. Reference in `docs/KEYMAP.md`.
- Commands: Next/Previous Method, Toggle Case, Update Project (merge or rebase per `unintellij.vcs.updateMethod`).
- **Search Everywhere** (double Shift) with All, Classes, Files, Symbols, Actions and Text tabs (Tab/Shift+Tab to switch, IntelliJ shortcuts switch tabs while open, double Shift again includes non-project items). IntelliJ-style matching (camel humps, `dir/name`, `:line`), New UI file icons, symbol icons, open-to-side buttons. Text search uses VS Code's bundled ripgrep.
- Go to Class / File / Symbol and Find Action open the matching tab; Find Action lists IntelliJ action names with shortcuts and toggleable options ("Soft-Wraps: ON").
- **Recent Files** (Ctrl+E, again for edited only, with tool windows), **Recent Locations** (Ctrl+Shift+E) and **File Structure** (Ctrl+F12) popups.
- **Settings** window (Ctrl+Alt+S / ⌘,) modeled on IntelliJ: tree with search, OK/Cancel/Apply, modified markers. Pages: Appearance, System Settings, Keymap (layout, searchable shortcut list, enable/disable per action), Editor › General and Font, Version Control › Git, Tools › Search Everywhere, Plugins (optional integrations and their status).
- One-click **IntelliJ-like VS Code settings** preset (fonts, no minimap, ruler at 120, no rainbow brackets, autosave on focus loss…), with restore of previous values.
- **Structure** tool window (Alt+7): symbols of the active file with IntelliJ icons and colors, sort alphabetically, show/hide fields, autoscroll from source.
- **npm** tool window: scripts of every package.json (npm, yarn or pnpm detected), run or debug inline.
- **Run widget** (status bar): selected run configuration (npm scripts and launch.json), Run (Shift+F10), Debug (Shift+F9), Stop (Ctrl+F2), Run…/Debug… pickers (Alt+Shift+F10/F9). Rerunning stops the previous run.
- **Commit tool window** (Alt+0, Ctrl+K focuses the message): changes grouped by **changelists** (active one checked by default), Unversioned Files, check what to commit (the staging area is ignored, as in IntelliJ), Amend, Commit / Commit and Push, double-click for diff, native context menu (Show Diff, Jump to Source, Rollback, Move to Another Changelist, Add to VCS, changelist actions), IntelliJ status colors.
- **Branches popup** (status bar widget, Ctrl+Shift+`): Recent / Local / Remote branches with ↑↓ indicators; Checkout, New Branch from…, Checkout and Rebase, Compare, Merge, Rebase, Update, Push, Rename, Delete.
- **Push** dialog listing outgoing commits (Push / Force Push with lease, upstream set automatically), **VCS Operations** popup (Alt+`), Update Project with merge or rebase.
- **Git tool window** (Alt+9, bottom panel): log of all branches with a colored commit graph, ref labels, Branch / User / Date / text filters, file history (VCS Operations › Show History), commit details with changed files and diffs, native context menu (Copy Revision Number, Checkout Revision, New Branch, New Tag, Cherry-Pick, Revert Commit, Reset Current Branch to Here with Soft/Mixed/Hard/Keep).
- **Conflicts**: notification when a merge/rebase conflicts, Accept Yours / Accept Theirs (per file or all) or Merge… in the 3-way merge editor.
