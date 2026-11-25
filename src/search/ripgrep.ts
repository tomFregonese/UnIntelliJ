import { ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

export interface TextMatch {
  uri: vscode.Uri;
  line: number;
  character: number;
  length: number;
  text: string;
}

let cachedPath: string | null | undefined;

/** Locates the ripgrep binary bundled with VS Code (its location changed across versions). */
export function ripgrepPath(): string | undefined {
  if (cachedPath !== undefined) {
    return cachedPath ?? undefined;
  }
  const exe = process.platform === 'win32' ? 'rg.exe' : 'rg';
  const platformDir = `${process.platform}-${process.arch}`;
  const root = vscode.env.appRoot;
  const candidates = [
    path.join(root, 'node_modules.asar.unpacked', '@vscode', 'ripgrep-universal', 'bin', platformDir, exe),
    path.join(root, 'node_modules', '@vscode', 'ripgrep-universal', 'bin', platformDir, exe),
    path.join(root, 'node_modules.asar.unpacked', '@vscode', 'ripgrep', 'bin', exe),
    path.join(root, 'node_modules', '@vscode', 'ripgrep', 'bin', exe),
  ];
  cachedPath = candidates.find((c) => existsSync(c)) ?? null;
  return cachedPath ?? undefined;
}

export interface TextSearchOptions {
  query: string;
  folders: readonly vscode.Uri[];
  excludeGlobs: readonly string[];
  includeIgnored: boolean;
  maxResults: number;
  token: vscode.CancellationToken;
}

/**
 * Plain-text, smart-case search in the workspace folders. Resolves with at most `maxResults`
 * matches, or undefined when ripgrep is not available.
 */
export async function searchText(options: TextSearchOptions): Promise<TextMatch[] | undefined> {
  const rg = ripgrepPath();
  if (!rg) {
    return undefined;
  }
  const results: TextMatch[] = [];
  for (const folder of options.folders) {
    if (options.token.isCancellationRequested || results.length >= options.maxResults) {
      break;
    }
    if (folder.scheme !== 'file') {
      continue;
    }
    await runRipgrep(rg, folder, options, results);
  }
  return results;
}

function runRipgrep(rg: string, folder: vscode.Uri, options: TextSearchOptions, results: TextMatch[]): Promise<void> {
  const args = ['--json', '--fixed-strings', '--smart-case', '--max-columns', '500', '--max-filesize', '2M', '--max-count', '20'];
  if (options.includeIgnored) {
    args.push('--no-ignore', '--hidden');
  }
  for (const glob of options.excludeGlobs) {
    args.push('-g', `!${glob.replace(/^\*\*\//, '')}`);
  }
  args.push('--', options.query, '.');

  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(rg, args, { cwd: folder.fsPath });
    } catch {
      resolve();
      return;
    }
    let buffer = '';
    const stop = (): void => {
      child.kill();
    };
    const cancellation = options.token.onCancellationRequested(stop);
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const match = parseMatch(line, folder);
        if (match) {
          results.push(match);
          if (results.length >= options.maxResults) {
            stop();
            return;
          }
        }
      }
    });
    child.on('error', () => undefined);
    child.on('close', () => {
      cancellation.dispose();
      resolve();
    });
  });
}

interface RgMatch {
  type: string;
  data: { path: { text?: string }; line_number: number; lines: { text?: string }; submatches: { start: number; end: number }[] };
}

/** Parses one `rg --json` line. Exported for tests. */
export function parseMatch(jsonLine: string, folder: vscode.Uri): TextMatch | undefined {
  let message: RgMatch;
  try {
    message = JSON.parse(jsonLine) as RgMatch;
  } catch {
    return undefined;
  }
  if (message.type !== 'match' || !message.data.path.text || message.data.lines.text === undefined) {
    return undefined;
  }
  const lineText = message.data.lines.text.replace(/\r?\n$/, '');
  const submatch = message.data.submatches[0] ?? { start: 0, end: 0 };
  // ripgrep reports byte offsets; convert to UTF-16 character offsets.
  const bytes = Buffer.from(lineText, 'utf8');
  const character = bytes.subarray(0, submatch.start).toString('utf8').length;
  const length = bytes.subarray(submatch.start, submatch.end).toString('utf8').length;
  return {
    uri: vscode.Uri.joinPath(folder, message.data.path.text.replace(/^\.[\\/]/, '')),
    line: message.data.line_number - 1,
    character,
    length,
    text: lineText,
  };
}
