import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { fontDirectories, isJetBrainsMonoFile, JETBRAINS_MONO_FILES, userFontDirectory, windowsFontRegistryName } from './fontLogic';

const run = promisify(execFile);

async function containsFont(dir: string, depth: number): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  if (entries.some((e) => e.isFile() && isJetBrainsMonoFile(e.name))) {
    return true;
  }
  if (depth === 0) {
    return false;
  }
  for (const e of entries) {
    if (e.isDirectory() && (await containsFont(path.join(dir, e.name), depth - 1))) {
      return true;
    }
  }
  return false;
}

/** True when JetBrains Mono is installed for the user or the whole system. */
export async function hasJetBrainsMono(): Promise<boolean> {
  for (const dir of fontDirectories(process.platform, process.env, os.homedir())) {
    // Linux distributions nest fonts by family/foundry.
    if (await containsFont(dir, process.platform === 'linux' ? 3 : 0)) {
      return true;
    }
  }
  return false;
}

/**
 * Installs the JetBrains Mono files bundled with the extension (SIL OFL 1.1) for the current user
 * only, which needs no admin rights: `%LOCALAPPDATA%\Microsoft\Windows\Fonts` + HKCU registration
 * on Windows, `~/Library/Fonts` on macOS, `~/.local/share/fonts` on Linux.
 * VS Code must be restarted to pick the font up.
 */
export async function installJetBrainsMono(extensionUri: vscode.Uri, log: vscode.LogOutputChannel): Promise<void> {
  const target = userFontDirectory(process.platform, process.env, os.homedir());
  await mkdir(target, { recursive: true });
  for (const file of JETBRAINS_MONO_FILES) {
    const destination = path.join(target, file);
    if (!existsSync(destination)) {
      await copyFile(vscode.Uri.joinPath(extensionUri, 'fonts', file).fsPath, destination);
    }
    if (process.platform === 'win32') {
      await run('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', '/v', windowsFontRegistryName(file), '/t', 'REG_SZ', '/d', destination, '/f']);
    }
  }
  if (process.platform === 'linux') {
    await run('fc-cache', ['-f', target]).catch((error) => log.warn(`fc-cache failed: ${String(error)}`));
  }
  log.info(`JetBrains Mono installed in ${target}`);
}
