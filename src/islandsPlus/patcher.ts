import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { ASSET_CSS, ASSET_JS, checksum, checksumKey, injectBlock, PATCH_VERSION, patchedVersion, removeBlock, updateChecksum, WORKBENCH_CANDIDATES } from './patchLogic';
import { t } from '../i18n/i18n';

export type PatchStatus = 'clean' | 'patched' | 'outdated' | 'unsupported';

/** Thrown when VS Code's installation files are not writable (e.g. "system" install without admin rights). */
export class NotWritableError extends Error {
  constructor(readonly file: string) {
    super(t('No write access to {0}', file));
  }
}

const BACKUP_SUFFIX = '.unintellij-backup';

/**
 * Applies/reverts Islands+ on a VS Code installation (`appRoot`). Safety copies of the modified
 * files (`*.unintellij-backup`) exist while Islands+ is applied. Every write keeps
 * workbench.html and the product.json checksum consistent, so VS Code does not report a
 * corrupt installation.
 */
export class WorkbenchPatcher {
  constructor(
    private readonly appRoot: string,
    /** Folder with islands.css and islands.js shipped in the extension. */
    private readonly assetsDir: string,
  ) {}

  private locate(): { html: string; relative: string } | undefined {
    const relative = WORKBENCH_CANDIDATES.find((candidate) => existsSync(path.join(this.appRoot, candidate)));
    return relative ? { html: path.join(this.appRoot, relative), relative } : undefined;
  }

  private get productJson(): string {
    return path.join(this.appRoot, 'product.json');
  }

  async status(): Promise<PatchStatus> {
    const location = this.locate();
    if (!location) {
      return 'unsupported';
    }
    const version = patchedVersion(await readFile(location.html, 'utf8'));
    return version === undefined ? 'clean' : version === PATCH_VERSION ? 'patched' : 'outdated';
  }

  /** Path of the file to report when the installation is not writable. */
  get workbenchFile(): string | undefined {
    return this.locate()?.html;
  }

  async apply(): Promise<void> {
    const location = this.locate();
    if (!location) {
      throw new Error(t('Unsupported VS Code layout: workbench.html not found.'));
    }
    const dir = path.dirname(location.html);
    const html = await readFile(location.html, 'utf8');
    const product = await readFile(this.productJson, 'utf8');
    await guard(location.html, async () => {
      if (patchedVersion(html) === undefined) {
        // Fresh originals (first time, or after a VS Code update replaced the files).
        await writeFile(location.html + BACKUP_SUFFIX, html);
        await writeFile(this.productJson + BACKUP_SUFFIX, product);
      }
      await copyFile(path.join(this.assetsDir, 'islands.css'), path.join(dir, ASSET_CSS));
      await copyFile(path.join(this.assetsDir, 'islands.js'), path.join(dir, ASSET_JS));
      const patched = injectBlock(html);
      await writeFile(location.html, patched);
      await writeFile(this.productJson, updateChecksum(product, checksumKey(location.relative), checksum(patched)));
    });
  }

  async revert(): Promise<void> {
    const location = this.locate();
    if (!location) {
      return;
    }
    const dir = path.dirname(location.html);
    const html = await readFile(location.html, 'utf8');
    await guard(location.html, async () => {
      if (patchedVersion(html) !== undefined) {
        const original = removeBlock(html);
        await writeFile(location.html, original);
        const product = await readFile(this.productJson, 'utf8');
        await writeFile(this.productJson, updateChecksum(product, checksumKey(location.relative), checksum(original)));
      }
      await rm(path.join(dir, ASSET_CSS), { force: true });
      await rm(path.join(dir, ASSET_JS), { force: true });
      // The originals are restored: the safety copies are no longer needed.
      await rm(location.html + BACKUP_SUFFIX, { force: true });
      await rm(this.productJson + BACKUP_SUFFIX, { force: true });
    });
  }
}

async function guard(file: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
      throw new NotWritableError(file);
    }
    throw error;
  }
}

/** Where the uninstall hook finds the installations Islands+ patched (it has no `vscode` API). */
export const PATCHED_ROOTS_FILE = path.join(os.homedir(), '.unintellij', 'islands-plus-roots.json');

export async function readPatchedRoots(file = PATCHED_ROOTS_FILE): Promise<string[]> {
  try {
    const roots: unknown = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(roots) ? roots.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

/** Adds or removes `appRoot` in the list read by the uninstall hook. Best effort. */
export async function recordPatchedRoot(appRoot: string, patched: boolean, file = PATCHED_ROOTS_FILE): Promise<void> {
  const roots = new Set(await readPatchedRoots(file));
  if (patched) {
    roots.add(appRoot);
  } else {
    roots.delete(appRoot);
  }
  try {
    if (roots.size === 0) {
      await rm(file, { force: true });
    } else {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify([...roots], null, 2));
    }
  } catch {
    // The uninstall hook also finds the running installation from its executable.
  }
}
