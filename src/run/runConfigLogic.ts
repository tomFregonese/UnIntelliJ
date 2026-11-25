/**
 * Saved npm run configurations (IntelliJ "Run/Debug Configurations › npm"). Pure: no `vscode` import.
 */
/** Same as packageManager.ts (kept here so that the webview bundle needs no Node types). */
type PackageManager = 'npm' | 'yarn' | 'pnpm';

export interface NpmConfigData {
  id: string;
  name: string;
  /** package.json URI (`Uri.toString()`); configurations are stored per workspace. */
  packageJson: string;
  script: string;
  /** Extra arguments passed to the script. */
  args: string;
  /** Environment variables, IntelliJ style: `NAME=value;OTHER=value`. */
  env: string;
}

/** `NAME=value;OTHER=value` → object; entries without `=` are ignored. */
export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const part of text.split(/[;\n]/)) {
    const index = part.indexOf('=');
    if (index > 0) {
      env[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    }
  }
  return env;
}

/** Command line of a script with arguments (`npm run x -- args`, `yarn x args`, `pnpm run x args`). */
export function npmCommandLine(packageManager: PackageManager, script: string, args = ''): string {
  const base = packageManager === 'yarn' ? `yarn ${script}` : `${packageManager} run ${script}`;
  const extra = args.trim();
  if (!extra) {
    return base;
  }
  return packageManager === 'npm' ? `${base} -- ${extra}` : `${base} ${extra}`;
}

/** First free name like IntelliJ's "Unnamed", "Unnamed (1)"… */
export function uniqueName(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) {
    return base;
  }
  for (let i = 1; ; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.includes(candidate)) {
      return candidate;
    }
  }
}

export function newConfigId(): string {
  return `saved:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
