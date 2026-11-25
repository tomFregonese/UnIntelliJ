import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@vscode/test-cli';

// Fresh user data on every run so first-activation behavior is tested and no settings leak between runs.
const userDataDir = mkdtempSync(join(tmpdir(), 'unintellij-test-'));

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  // CI also runs against the minimum supported version (see engines.vscode).
  version: process.env.VSCODE_TEST_VERSION ?? 'stable',
  workspaceFolder: 'test/fixtures/workspace',
  launchArgs: ['--disable-extensions', `--user-data-dir=${userDataDir}`],
  mocha: { ui: 'tdd', timeout: 20000 },
});
