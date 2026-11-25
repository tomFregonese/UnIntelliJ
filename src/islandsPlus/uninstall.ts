/**
 * `vscode:uninstall` hook: VS Code runs this file with plain Node once UnIntelliJ is uninstalled
 * (at the next start). It removes Islands+ from every installation it patched, so uninstalling
 * leaves VS Code exactly as it was. No `vscode` API here.
 */
import { existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { appRootCandidates } from './patchLogic';
import { PATCHED_ROOTS_FILE, readPatchedRoots, recordPatchedRoot, WorkbenchPatcher } from './patcher';

async function main(): Promise<void> {
  const subfolders = (dir: string): string[] => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return [];
    }
  };
  const roots = new Set([...(await readPatchedRoots()), ...appRootCandidates(process.execPath, path.join, path.dirname, subfolders)]);
  for (const root of roots) {
    if (!existsSync(path.join(root, 'product.json'))) {
      continue;
    }
    const patcher = new WorkbenchPatcher(root, '');
    try {
      if ((await patcher.status()) !== 'clean') {
        await patcher.revert();
      }
      await recordPatchedRoot(root, false, PATCHED_ROOTS_FILE);
    } catch (error) {
      console.error(`UnIntelliJ: could not remove Islands+ from ${root}: ${String(error)}`);
    }
  }
}

void main();
