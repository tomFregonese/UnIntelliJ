/**
 * Regenerates themes/*.json from src/theme/palettes.ts.
 * With `--check`, exits non-zero instead of writing when a theme file is out of date.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildColorTheme, themeFileName } from '../src/theme/build';
import { PALETTES } from '../src/theme/palettes';

const themesDir = join(__dirname, '..', 'themes');
const check = process.argv.includes('--check');
let outdated = 0;

mkdirSync(themesDir, { recursive: true });
for (const palette of PALETTES) {
  const path = join(themesDir, themeFileName(palette));
  const content = `${JSON.stringify(buildColorTheme(palette), null, 2)}\n`;
  const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  if (current === content) {
    continue;
  }
  outdated++;
  if (check) {
    console.error(`${path} is out of date. Run \`npm run gen:themes\`.`);
  } else {
    writeFileSync(path, content);
    console.log(`Wrote ${path}`);
  }
}

if (check && outdated > 0) {
  process.exit(1);
}
if (outdated === 0) {
  console.log('Themes are up to date.');
}
