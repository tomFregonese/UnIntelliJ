import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const extension = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode'],
  // Prefer ESM builds: jsonc-parser's UMD build uses dynamic requires esbuild cannot bundle.
  mainFields: ['module', 'main'],
  sourcemap: !production,
  sourcesContent: false,
  minify: production,
  logLevel: 'info',
};

/** Webview scripts run in the browser. */
/** @type {import('esbuild').BuildOptions} */
const webviews = {
  entryPoints: { settings: 'src/webview/settings.ts', commit: 'src/webview/commit.ts', gitLog: 'src/webview/gitLog.ts', runConfigs: 'src/webview/runConfigs.ts' },
  bundle: true,
  outdir: 'dist/webview',
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: !production,
  sourcesContent: false,
  minify: production,
  logLevel: 'info',
};

if (watch) {
  for (const options of [extension, webviews]) {
    const context = await esbuild.context(options);
    await context.watch();
  }
} else {
  await Promise.all([esbuild.build(extension), esbuild.build(webviews)]);
}
