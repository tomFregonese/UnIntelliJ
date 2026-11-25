/**
 * Regenerates every generated artifact from its TypeScript source of truth:
 *   package.json  contributes.configuration   ← src/config/schema.ts
 *   package.json  contributes.commands        ← src/commands/catalog.ts
 *   package.json  views, menus, tasks         ← src/commands/contributions.ts
 *   package.json  contributes.keybindings     ← src/keymap/keymap.ts
 *   docs/KEYMAP.md                            ← src/keymap/keymap.ts
 *   media/product-icons.css                   ← icons/product-icon-theme.json
 *   package.json  contributes.colors          ← src/theme/build.ts
 *   themes/*.json                             ← src/theme/palettes.ts (+ icons/symbol-colors.json)
 *
 * `--check` writes nothing and exits non-zero when something is out of date (used in CI).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { buildCommandContribution, buildCommandPaletteMenu } from '../src/commands/catalog';
import { MENUS, TASK_DEFINITIONS, VIEW_CONTAINERS, VIEWS } from '../src/commands/contributions';
import { buildConfigurationContribution, CONFIGURATION_DEFAULTS } from '../src/config/schema';
import { buildKeybindings, buildKeymapMarkdown } from '../src/keymap/keymap';
import { buildColorContribution, buildColorTheme, themeFileName } from '../src/theme/build';
import { ISLANDS_DARK, ISLANDS_LIGHT, PALETTES } from '../src/theme/palettes';

const root = join(__dirname, '..');
const check = process.argv.includes('--check');
const outdated: string[] = [];

function emit(path: string, content: string): void {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  if (current === content) {
    return;
  }
  outdated.push(relative(root, path));
  if (!check) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

const json = (data: unknown): string => `${JSON.stringify(data, null, 2)}\n`;

// package.json
const packagePath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
pkg.contributes.configuration = buildConfigurationContribution();
pkg.contributes.commands = buildCommandContribution();
pkg.contributes.menus = { commandPalette: buildCommandPaletteMenu(), ...MENUS };
pkg.contributes.viewsContainers = VIEW_CONTAINERS;
pkg.contributes.views = VIEWS;
pkg.contributes.taskDefinitions = TASK_DEFINITIONS;
pkg.contributes.keybindings = buildKeybindings();
pkg.contributes.colors = buildColorContribution(ISLANDS_DARK, ISLANDS_LIGHT);
pkg.contributes.configurationDefaults = CONFIGURATION_DEFAULTS;
emit(packagePath, json(pkg));

// Keymap reference
emit(join(root, 'docs', 'KEYMAP.md'), buildKeymapMarkdown());

// Product icon font for webviews: `<span class="icon icon-refresh">`.
const productIcons = JSON.parse(readFileSync(join(root, 'icons', 'product-icon-theme.json'), 'utf8')) as {
  iconDefinitions: Record<string, { fontCharacter: string }>;
};
const iconCss = [
  '/* Generated from icons/product-icon-theme.json by `npm run gen` — do not edit. */',
  "@font-face { font-family: 'unintellij-icons'; src: url('../icons/product-icons.woff') format('woff'); }",
  ".icon { font-family: 'unintellij-icons'; font-size: 16px; line-height: 1; display: inline-block; vertical-align: middle; speak: never; }",
  ...Object.entries(productIcons.iconDefinitions).map(([id, def]) => `.icon-${id}::before { content: '${def.fontCharacter}'; }`),
  '',
].join('\n');
emit(join(root, 'media', 'product-icons.css'), iconCss);

// Color themes
for (const palette of PALETTES) {
  emit(join(root, 'themes', themeFileName(palette)), json(buildColorTheme(palette)));
}

if (outdated.length === 0) {
  console.log('Generated files are up to date.');
} else if (check) {
  console.error(`Out of date: ${outdated.join(', ')}. Run \`npm run gen\`.`);
  process.exit(1);
} else {
  console.log(`Updated: ${outdated.join(', ')}`);
}
