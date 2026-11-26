/**
 * Projects open in other VS Code windows, for the project widget. VS Code has no API listing its
 * windows: each window running UnIntelliJ records its project in a small shared file, with the
 * process id of its extension host so entries of closed or crashed windows are dropped.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export const OPEN_WINDOWS_FILE = path.join(os.homedir(), '.unintellij', 'open-windows.json');

export interface OpenWindow {
  /** Folder or .code-workspace URI, as `Uri.toString()`. */
  uri: string;
  label: string;
  pid: number;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Pure: entries kept after `pid` (re)registers `entry` (or unregisters when undefined), without dead processes. */
export function updateWindows(windows: readonly OpenWindow[], pid: number, entry: Omit<OpenWindow, 'pid'> | undefined, alive: (pid: number) => boolean): OpenWindow[] {
  const others = windows.filter((w) => w.pid !== pid && alive(w.pid));
  return entry ? [...others, { ...entry, pid }] : others;
}

async function read(file: string): Promise<OpenWindow[]> {
  try {
    const data: unknown = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(data) ? data.filter((w): w is OpenWindow => typeof w?.uri === 'string' && typeof w?.label === 'string' && typeof w?.pid === 'number') : [];
  } catch {
    return [];
  }
}

/** Records (or with `entry` undefined, removes) this window's project. */
export async function registerWindow(entry: Omit<OpenWindow, 'pid'> | undefined, file = OPEN_WINDOWS_FILE): Promise<void> {
  const windows = updateWindows(await read(file), process.pid, entry, isAlive);
  await mkdir(path.dirname(file), { recursive: true });
  // Written then renamed, so another window never reads half a file.
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(windows, undefined, 2));
  await rename(temp, file);
}

/** Projects open in the other windows, in the order they were opened. */
export async function otherWindows(file = OPEN_WINDOWS_FILE): Promise<OpenWindow[]> {
  return (await read(file)).filter((w) => w.pid !== process.pid && isAlive(w.pid));
}
