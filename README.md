# UnIntelliJ

Make VS Code look and behave like IntelliJ IDEA (New UI / Islands): themes, icons, keymap,
Search Everywhere (double Shift), tool windows, Git and an IntelliJ-style Settings window.

> Work in progress — see `docs/CAHIER_DES_CHARGES.md` in the repository for the specification.

## Install from a `.vsix`

```sh
npm ci
npm run package
code --install-extension unintellij-*.vsix
```

On Windows without the `code` command: **Extensions** view › `…` › **Install from VSIX…**.

## Development

| Command | What it does |
|---|---|
| `npm run build` / `npm run watch` | Bundle `src/` into `dist/extension.js` |
| `F5` in VS Code | Launch an Extension Development Host |
| `npm run typecheck` · `npm run lint` | Static checks |
| `npm run test:unit` | Unit tests (Vitest, no VS Code needed) |
| `npm run test:integration` | Integration tests in a downloaded VS Code (`VSCODE_TEST_VERSION` to pick a version) |
| `npm run gen` | Regenerate package.json contributions, `docs/KEYMAP.md` and `themes/` from their TypeScript sources (`check:generated` verifies, CI fails if stale) |
| `npm run package` | Build the `.vsix` |

### Settings

All settings live under `unintellij.*` and are declared **once** in `src/config/schema.ts`.
After changing it, run `npm run gen`; CI fails if `package.json` is out of date.
Read them with `getSetting()` from `src/config/settings.ts`, which falls back to the default for invalid values.

### Icons

Icons come from IntelliJ's New UI set (`platform/icons/src/expui` in intellij-community, Apache 2.0, see `NOTICE`).
`icons/sources.json` maps VS Code icons to IntelliJ ones; `scripts/build-icons.py` copies the SVGs, builds the
monochrome product icon font and extracts symbol colors. Its output is committed, so only regenerating icons needs Python
(usage at the top of the script). Then run `npm run gen` to pick up symbol colors.

### Islands+

Optional (`unintellij.appearance.islandsPlus.enabled`, off by default). VS Code offers no API to change the
shape of its UI, so Islands+ adds a stylesheet and a small script next to VS Code's `workbench.html`, references
them from it and updates the file checksum in `product.json` (no "corrupt installation" warning). Disabling removes
the block and restores the checksum exactly; backups (`*.unintellij-backup`) are kept next to the files. It is
re-applied automatically after VS Code updates. Requires write access to VS Code's installation folder.

### Optional integrations

UnIntelliJ never requires another extension. `src/integrations.ts` lists the ones it can use
(Git, Java, Java debugger, Angular); features must check that an integration is active and degrade gracefully otherwise.
