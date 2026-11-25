import * as path from 'node:path';
import * as vscode from 'vscode';
import { detectPackageManager, PackageManager, scriptCommandLine } from './packageManager';

export { scriptCommandLine };

/** A runnable thing, like an IntelliJ run configuration. */
export type RunConfiguration =
  | { kind: 'npm'; id: string; name: string; script: string; command: string; packageJson: vscode.Uri; folder: vscode.WorkspaceFolder; packageManager: PackageManager }
  | { kind: 'launch'; id: string; name: string; folder: vscode.WorkspaceFolder | undefined; type: string };


export interface PackageScripts {
  packageJson: vscode.Uri;
  /** Package name, or its directory when unnamed. */
  label: string;
  folder: vscode.WorkspaceFolder;
  packageManager: PackageManager;
  scripts: { name: string; command: string }[];
}

/** Scripts of every package.json in the workspace, outside node_modules. */
export async function findPackageScripts(): Promise<PackageScripts[]> {
  const uris = await vscode.workspace.findFiles('**/package.json', '{**/node_modules/**,**/dist/**,**/.angular/**}', 200);
  const results: PackageScripts[] = [];
  for (const uri of uris.sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) {
      continue;
    }
    try {
      const json = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')) as { name?: string; scripts?: Record<string, unknown> };
      const scripts = Object.entries(json.scripts ?? {})
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([name, command]) => ({ name, command }));
      const dir = path.dirname(uri.fsPath);
      results.push({
        packageJson: uri,
        label: json.name ?? (vscode.workspace.asRelativePath(path.dirname(uri.path)) || folder.name),
        folder,
        packageManager: detectPackageManager(dir, folder.uri.fsPath),
        scripts,
      });
    } catch {
      // Invalid JSON while editing: skip until it is fixed.
    }
  }
  return results;
}

export async function collectRunConfigurations(): Promise<RunConfiguration[]> {
  const configurations: RunConfiguration[] = [];
  const multiPackage = (await findPackageScripts()).map((p, _, all) => ({ ...p, prefix: all.length > 1 ? `${p.label} › ` : '' }));
  for (const pkg of multiPackage) {
    for (const script of pkg.scripts) {
      configurations.push({
        kind: 'npm',
        id: `npm:${pkg.packageJson.toString()}:${script.name}`,
        name: `${pkg.prefix}${script.name}`,
        script: script.name,
        command: script.command,
        packageJson: pkg.packageJson,
        folder: pkg.folder,
        packageManager: pkg.packageManager,
      });
    }
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const launches = vscode.workspace.getConfiguration('launch', folder.uri).get<{ name?: string; type?: string }[]>('configurations') ?? [];
    for (const launch of launches) {
      if (launch.name) {
        configurations.push({ kind: 'launch', id: `launch:${folder.uri.toString()}:${launch.name}`, name: launch.name, folder, type: launch.type ?? '' });
      }
    }
  }
  return configurations;
}

/** Runs or debugs a configuration. Resolves with the started task execution, if any. */
export async function startConfiguration(configuration: RunConfiguration, debug: boolean): Promise<vscode.TaskExecution | undefined> {
  if (configuration.kind === 'launch') {
    await vscode.debug.startDebugging(configuration.folder, configuration.name, { noDebug: !debug });
    return undefined;
  }
  const cwd = path.dirname(configuration.packageJson.fsPath);
  const commandLine = scriptCommandLine(configuration.packageManager, configuration.script);
  if (debug) {
    // JavaScript Debug Terminal from VS Code's built-in js-debug.
    await vscode.debug.startDebugging(configuration.folder, { type: 'node-terminal', request: 'launch', name: configuration.name, command: commandLine, cwd });
    return undefined;
  }
  const task = new vscode.Task(
    { type: 'unintellij-npm', script: configuration.script, path: configuration.packageJson.fsPath },
    configuration.folder,
    configuration.name,
    configuration.packageManager,
    new vscode.ShellExecution(commandLine, { cwd }),
  );
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true };
  return vscode.tasks.executeTask(task);
}

export function configurationIcon(configuration: RunConfiguration): vscode.ThemeIcon {
  return configuration.kind === 'npm' ? new vscode.ThemeIcon('package') : new vscode.ThemeIcon('debug-alt');
}
