import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'out/', '.vscode-test/', '*.vsix'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Islands+ script injected into VS Code's workbench (browser, classic script).
    files: ['media/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { document: 'readonly', window: 'readonly', MutationObserver: 'readonly', requestAnimationFrame: 'readonly' },
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    rules: {
      eqeqeq: ['error', 'always'],
      curly: 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
