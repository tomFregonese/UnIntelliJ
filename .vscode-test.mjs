import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  // CI also runs against the minimum supported version (see engines.vscode).
  version: process.env.VSCODE_TEST_VERSION ?? 'stable',
  workspaceFolder: 'test/fixtures/workspace',
  launchArgs: ['--disable-extensions'],
  mocha: { ui: 'tdd', timeout: 20000 },
});
