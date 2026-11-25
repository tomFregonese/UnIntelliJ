/** Package manager detection for npm scripts. Pure: no `vscode` import. */
import { existsSync } from 'node:fs';
import * as path from 'node:path';

export type PackageManager = 'npm' | 'yarn' | 'pnpm';

/** Detects the package manager from lock files in `dir` or its parents, up to `root`. */
export function detectPackageManager(dir: string, root: string): PackageManager {
  let current = path.resolve(dir);
  const top = path.resolve(root);
  for (;;) {
    if (existsSync(path.join(current, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (existsSync(path.join(current, 'yarn.lock'))) {
      return 'yarn';
    }
    if (existsSync(path.join(current, 'package-lock.json'))) {
      return 'npm';
    }
    const parent = path.dirname(current);
    if (current === top || parent === current || !parent.startsWith(top)) {
      return 'npm';
    }
    current = parent;
  }
}

export function scriptCommandLine(packageManager: PackageManager, script: string): string {
  return packageManager === 'yarn' ? `yarn ${script}` : `${packageManager} run ${script}`;
}
