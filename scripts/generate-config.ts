/**
 * Regenerates `contributes.configuration` in package.json from src/config/schema.ts.
 * With `--check`, exits non-zero instead of writing when package.json is out of date.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildConfigurationContribution } from '../src/config/schema';

const packagePath = join(__dirname, '..', 'package.json');
const original = readFileSync(packagePath, 'utf8');
const pkg = JSON.parse(original);
pkg.contributes ??= {};
pkg.contributes.configuration = buildConfigurationContribution();
const updated = `${JSON.stringify(pkg, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (updated !== original) {
    console.error('package.json contributes.configuration is out of date. Run `npm run gen:config`.');
    process.exit(1);
  }
  console.log('package.json configuration is up to date.');
} else if (updated !== original) {
  writeFileSync(packagePath, updated);
  console.log('package.json configuration updated.');
} else {
  console.log('package.json configuration already up to date.');
}
