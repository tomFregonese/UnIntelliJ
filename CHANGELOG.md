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
