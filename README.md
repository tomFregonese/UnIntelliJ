# UnIntelliJ

Make VS Code look and behave like **IntelliJ IDEA's New UI (Islands)** — for when you have to use VS Code but your
fingers still think in JetBrains shortcuts.

- **Search Everywhere** on double Shift, with All · Classes · Files · Symbols · Actions · Text tabs and IntelliJ-style
  matching (`USvc` → `UserService`, `app/user/serv`, `file.ts:42`)
- IntelliJ **Windows and macOS keymaps** (~110 actions), chosen by OS; each shortcut can be disabled or reassigned
- **Islands Dark / Islands Light** themes with *Sync with OS*, New UI **file and UI icons**, IntelliJ symbol colors
- Tool windows: **Commit** (changelists, check-to-commit, amend), **Git** log with graph, **Structure**, **npm**,
  **Run widget** (npm scripts and launch configurations)
- **Branches** popup, **Push** dialog, **VCS Operations** popup, **Conflicts** resolver
- **Recent Files**, **Recent Locations**, **File Structure** popups
- IntelliJ-style **Settings** window (Ctrl+Alt+S / ⌘,)
- Optional **Islands+**: rounded islands and title bar widgets (patches VS Code, see below)

No other extension is required. Java (Red Hat), Debugger for Java and Angular Language Service are used when installed.

## Install

1. Download `unintellij-<version>.vsix` from the [latest release](https://github.com/tomFregonese/UnIntelliJ/releases/latest).
2. In VS Code: **Extensions** view › `…` menu › **Install from VSIX…** and pick the file
   (or `code --install-extension unintellij-<version>.vsix`).

Requires VS Code 1.100 or later.

### What changes on first start

UnIntelliJ switches VS Code to the **Islands Dark** theme (keeping *follow the OS* if you used it) and to the
**UnIntelliJ (New UI)** file and product icon themes. Pick another theme or icon theme as usual to undo it.

Recommended next step: **Settings › Editor › General › Apply IntelliJ-like settings** (JetBrains Mono, continuous autosave, no minimap,
ruler at 120, no rainbow brackets…). Your previous values are kept and can be restored from the same page.

## Everyday use

| You want to… | Windows | macOS |
|---|---|---|
| Find anything | `Shift` `Shift` | `⇧` `⇧` |
| Run an action / toggle an option | `Ctrl+Shift+A` | `⌘⇧A` |
| Go to class / file | `Ctrl+N` / `Ctrl+Shift+N` | `⌘O` / `⌘⇧O` |
| Recent files | `Ctrl+E` (again: edited only) | `⌘E` |
| Context actions / quick fix | `Alt+Enter` | `⌥↩` |
| Extend selection | `Ctrl+W` | `⌥↑` |
| Project / Commit / Git / Terminal | `Alt+1` / `Alt+0` / `Alt+9` / `Alt+F12` | `⌘1` / `⌘0` / `⌘9` / `⌥F12` |
| Commit / Push / Update project | `Ctrl+K` / `Ctrl+Shift+K` / `Ctrl+T` | `⌘K` / `⌘⇧K` / `⌘T` |
| Settings | `Ctrl+Alt+S` | `⌘,` |

Full list: [docs/KEYMAP.md](docs/KEYMAP.md). In Search Everywhere, `Tab` switches tabs and double Shift again includes
non-project items (e.g. `node_modules`).

### Commit like in IntelliJ

The Commit tool window replaces VS Code's Source Control view (its Changes and Graph views are hidden; run
*UnIntelliJ: Show VS Code's Source Control Views Again* to get them back). It ignores Git's staging area: **check the files to commit** and press Commit. New changes go to
the **active changelist**, which is checked by default; other changelists and unversioned files are not. Right-click a
file or changelist for Show Diff, Rollback, Move to Another Changelist, Set Active… Changelists can be turned off in
Settings › Version Control › Git.

## Settings

Everything is under **Settings** (`Ctrl+Alt+S`), or `unintellij.*` in VS Code's settings:

| Setting | Default | |
|---|---|---|
| `unintellij.appearance.theme` | `islandsDark` | Islands Dark or Light |
| `unintellij.appearance.syncWithOs` | `false` | Follow the OS light/dark mode with the preferred themes |
| `unintellij.appearance.islandsPlus.enabled` | `false` | See Islands+ below |
| `unintellij.keymap.layout` | `auto` | `auto` (by OS), `windows` or `macos` keymap |
| `unintellij.keymap.disabledActions` | `[]` | IntelliJ action IDs whose shortcut is disabled |
| `unintellij.keymap.customShortcuts` | `{}` | Reassigned shortcuts (edited in Settings › Keymap, written to keybindings.json) |
| `unintellij.searchEverywhere.includeNonProjectItems` | `false` | Search libraries and excluded folders by default |
| `unintellij.searchEverywhere.excludePatterns` | `[]` | Extra globs excluded from Search Everywhere |
| `unintellij.vcs.updateMethod` | `merge` | Update Project with merge or rebase |
| `unintellij.vcs.changelists.enabled` | `true` | Changelists in the Commit tool window |

## Islands+

VS Code has no API to change the *shape* of its interface. Islands+ (off by default) adds a stylesheet and a small
script next to VS Code's `workbench.html`, references them from it, and updates the file checksum in `product.json`
so that VS Code does not report a corrupt installation. You get rounded islands on the window frame, rounded popups,
IntelliJ fonts, and the project / branch / Run widgets in the title bar.

- It needs **write access to VS Code's installation folder**. The Windows *System* installer (in `Program Files`)
  needs administrator rights: use the *User* installer, or start VS Code once as administrator after enabling it.
- It is re-applied automatically after VS Code updates (you are asked to reload the window).
- Disabling it removes the block and restores the original checksum exactly. While it is applied, safety copies
  (`*.unintellij-backup`) sit next to the modified files; they are deleted when it is disabled.

## Language

UnIntelliJ is in English by default. French is available in **Settings › Appearance › Language** (`unintellij.appearance.language`).
Command titles in VS Code's Command Palette follow VS Code's own display language.

## Known limitations

VS Code's extension API cannot reproduce everything; see [docs/SUIVI.md](docs/SUIVI.md) (in French) for the full list.
The main ones: Search Everywhere tabs are shown in the popup title, tool window option toggles live in the `…` menu,
the Run and branch widgets are in the status bar unless Islands+ is on, Java run configurations are not provided yet
(existing `launch.json` configurations are listed), and partial (line-level) commits are not supported.
VS Code's own branch entry cannot be hidden by an extension: right-click the status bar and uncheck **Source Control**
to keep only UnIntelliJ's branch widget (Islands+ hides it automatically).

## Development

| Command | What it does |
|---|---|
| `npm run build` / `npm run watch` | Bundle the extension and webviews into `dist/` |
| `F5` in VS Code | Launch an Extension Development Host |
| `npm run typecheck` · `npm run lint` | Static checks |
| `npm run test:unit` | Unit tests (Vitest; webviews run under jsdom) |
| `npm run test:integration` | Integration tests in a downloaded VS Code (`VSCODE_TEST_VERSION` to pick a version) |
| `npm run gen` | Regenerate package.json contributions, `docs/KEYMAP.md`, `themes/` and `media/product-icons.css` from their TypeScript sources (`check:generated` verifies, CI fails if stale) |
| `npm run package` | Build the `.vsix` |

Releases: push a `v*` tag; the Release workflow builds the `.vsix` and attaches it to a GitHub release.

### Architecture

- **Single sources of truth** — settings (`src/config/schema.ts`), commands (`src/commands/catalog.ts`), views and
  menus (`src/commands/contributions.ts`), keymap (`src/keymap/keymap.ts`), theme palettes (`src/theme/palettes.ts`)
  are TypeScript data; `npm run gen` writes what VS Code needs from them.
- **Pure logic** (matching, graph layout, changelists, patching…) lives in `*Logic.ts` modules without `vscode`
  imports and is unit-tested; integration tests drive a real VS Code, including a throwaway Git repository.
- **Icons** come from IntelliJ's New UI set (`platform/icons/src/expui` in intellij-community, Apache 2.0, see
  `NOTICE`). `icons/sources.json` maps VS Code icons to IntelliJ ones; `scripts/build-icons.py` copies the SVGs, builds
  the monochrome product icon font and extracts symbol colors (usage at the top of the script).
- **Optional integrations** — `src/integrations.ts` lists the extensions UnIntelliJ can use; features check that an
  integration is active and degrade gracefully otherwise.

## License

MIT. IntelliJ icons © JetBrains s.r.o., Apache 2.0 (see `NOTICE`). IntelliJ and JetBrains are trademarks of JetBrains
s.r.o.; this project is not affiliated with or endorsed by JetBrains.
