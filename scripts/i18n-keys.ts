/**
 * Lists every English UI text that needs a French translation (t() calls, command titles, views,
 * settings, Settings pages, keymap names, preset reasons) and those missing from src/i18n/fr.ts.
 * `npx tsx scripts/i18n-keys.ts` prints the missing ones; `--check` fails when some are missing.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildCommandContribution } from '../src/commands/catalog';
import { VIEW_CONTAINERS, VIEWS } from '../src/commands/contributions';
import { buildConfigurationContribution } from '../src/config/schema';
import { FR } from '../src/i18n/fr';
import { localizeContributions } from '../src/i18n/nls';
import { KEYMAP } from '../src/keymap/keymap';
import { PAGES } from '../src/settings/pages';
import { buildColorContribution } from '../src/theme/build';
import { ISLANDS_DARK, ISLANDS_LIGHT } from '../src/theme/palettes';

const root = join(__dirname, '..');
const keys = new Set<string>();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
  });
}

// t('…') calls (single-quoted literals only, as written by the code).
for (const file of walk(join(root, 'src'))) {
  for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    keys.add((match[1] ?? match[2]).replace(/\\(['"])/g, '$1').replace(/\\\\/g, '\\'));
  }
}
const contributes = localizeContributions({
  commands: buildCommandContribution(),
  configuration: buildConfigurationContribution(),
  viewsContainers: VIEW_CONTAINERS,
  views: VIEWS,
  colors: buildColorContribution(ISLANDS_DARK, ISLANDS_LIGHT),
});
Object.values(contributes.en).forEach((text) => keys.add(text));
for (const page of PAGES) {
  keys.add(page.title);
  for (const field of page.fields ?? []) {
    keys.add(field.label);
    if (field.help) {keys.add(field.help);}
    for (const option of 'options' in field ? (field.options ?? []) : []) {keys.add(option.label);}
  }
}
KEYMAP.forEach((action) => keys.add(action.name));
// Texts kept in English constants and translated where shown.
for (const file of ['src/settings/preset.ts', 'src/settings/settingsPanel.ts', 'src/search/searchEverywhere.ts', 'src/search/actions.ts']) {
  for (const match of readFileSync(join(root, file), 'utf8').matchAll(/(?:reason|label|git|java|javaDebug|angular|all|classes|files|symbols|actions|text):\s*'((?:[^'\\]|\\.)*)'/g)) {
    if (/[A-Z][a-z]/.test(match[1])) {keys.add(match[1].replace(/\\'/g, "'"));}
  }
}
const missing = [...keys].filter((k) => /[A-Za-z]{2}/.test(k) && !(k in FR)).sort();
if (process.argv.includes('--check')) {
  if (missing.length > 0) {
    console.error(`${missing.length} texts have no French translation in src/i18n/fr.ts:\n${missing.join('\n')}`);
    process.exit(1);
  }
  console.log('All texts are translated.');
} else {
  console.log(JSON.stringify(missing, null, 1));
}
