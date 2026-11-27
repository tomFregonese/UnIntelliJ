import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { mavenCommand, needsStrongQuoting, ShellKind, taskShellKind, TerminalProfile } from './shellLogic';

const OS_KEY: Record<string, string> = { win32: 'windows', darwin: 'osx' };

/** Shell VS Code runs tasks in, from the user's terminal settings (read at each run). */
export function currentTaskShell(platform: NodeJS.Platform = process.platform): ShellKind {
  const os = OS_KEY[platform] ?? 'linux';
  const terminal = vscode.workspace.getConfiguration('terminal.integrated');
  return taskShellKind(
    platform,
    terminal.get<Record<string, TerminalProfile | null>>(`profiles.${os}`) ?? {},
    terminal.get<TerminalProfile | null>(`automationProfile.${os}`),
    terminal.get<string>(`defaultProfile.${os}`) ?? undefined,
  );
}

/** `mvn <args>` (or the wrapper of `cwd`) written for the task shell. */
export function mavenExecution(cwd: string, args: readonly string[]): vscode.ShellExecution {
  const shell = currentTaskShell();
  const command = mavenCommand({ mvnw: existsSync(path.join(cwd, 'mvnw')), mvnwCmd: existsSync(path.join(cwd, 'mvnw.cmd')) }, shell, process.platform);
  const quoted = args.map((arg) => (needsStrongQuoting(arg, shell) ? { value: arg, quoting: vscode.ShellQuoting.Strong } : arg));
  return new vscode.ShellExecution(command, quoted, { cwd });
}
