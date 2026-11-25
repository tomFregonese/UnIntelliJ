# Changelog

## Unreleased

- IntelliJ-like settings and the Islands Dark theme are VS Code defaults: they apply while UnIntelliJ is enabled and go away when it is disabled or uninstalled. Values you set yourself (including with the former "Apply" button) are never changed.
- Islands+ is on by default, switches itself off while UnIntelliJ is disabled and is removed on uninstall.
- JetBrains Mono is installed automatically when missing; users with their own theme are asked once instead of having it replaced.
- Commit tool window: files sorted alphabetically by name.
- Database: data source › database › schema; choose the databases and schemas shown with checkboxes (right-click › Choose Databases… / Choose Schemas…); SQL files can target any database of the server.
- Maven tool window: profiles, projects and modules, Lifecycle, Plugins, Dependencies; double-click to run a goal, Execute Maven Goal, offline and skip-tests toggles, Maven wrapper; goals become temporary run configurations in the Run widget.
- Branch widget is a single block (branch, ↙/↗ counts, Update / Push / Fetch icons) that opens the Git popup, which now also has Fetch.
- Icon themes are VS Code defaults too; an Islands theme you picked yourself is kept.

## 0.3.0

- Exact Islands Light / Dark colors from IntelliJ; JetBrains Mono installed for your account by the setup; IntelliJ font sizes.
- First-run setup (theme, fonts, settings), IntelliJ checkboxes in windows, solid change bars, change popup actions, IntelliJ diff titles.
- Branch widget (↗ outgoing / ↙ incoming, Update / Push / Fetch, background fetch).
- Run/Debug Configurations window; green ▶ in the gutter for scripts, Java and JS/TS tests, mains.
- Project tool window (Project / Packages / Files / Open / Changed), navigation bar, inspection widget, read-only lock.
- Commit: single click previews the diff, double click opens the file.
- PostgreSQL: data sources, Database tool window, SQL files and consoles, results panel.
- English by default, French in Settings › Appearance › Language.

## 0.2.0 — 2026-11-25

- **Commit tool window replaces VS Code's Source Control**: it lives in the Source Control container and VS Code's own Changes and Graph views are hidden (command to show them again). Alt+0 focuses it.
- **Reassign shortcuts** in Settings › Keymap (✎ then press the keys; Backspace resets): written to your keybindings.json, your own entries and comments are untouched.
- Colored IntelliJ symbol icons in Search Everywhere, File Structure and Structure; file type icons in the Commit tool window; tool window icons in Recent Files.
- IntelliJ-like preset: continuous autosave, file names keep their VCS color when they contain errors.
- Islands+ deletes its safety copies when disabled.
- Fixed: the extension failed to activate when bundling jsonc-parser's UMD build.

## 0.1.0 — 2026-11-25

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
- **Islands+** (optional, off by default): rounded islands on the window frame, IntelliJ typography, rounded popups, and the project / branch / Run widgets moved to the title bar (hamburger main menu, no command center). Patches VS Code's workbench.html with a valid checksum, re-applies after VS Code updates, reverts exactly when disabled, and explains when the installation is read-only.
