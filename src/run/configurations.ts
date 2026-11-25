import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { t } from '../i18n/i18n';
import { INTEGRATIONS } from '../integrations';
import { findWrapper, wrapperCommand } from '../maven/wrapper';
import { EclipseLaunch, eclipseProjectName, junitMavenArgs, m2eArgs, parseLaunch, resolveVariables, vmArgsWithProfile } from './eclipseLaunch';
import { detectPackageManager, PackageManager, scriptCommandLine } from './packageManager';
import { MavenRunData, NpmConfigData, npmCommandLine, parseEnv } from './runConfigLogic';

export { scriptCommandLine };

/** A runnable thing, like an IntelliJ run configuration. */
export type RunConfiguration =
  | {
      kind: 'npm';
      id: string;
      name: string;
      script: string;
      command: string;
      packageJson: vscode.Uri;
      folder: vscode.WorkspaceFolder;
      packageManager: PackageManager;
      /** Set for configurations saved in Edit Configurations (detected scripts have none). */
      args?: string;
      env?: string;
      saved?: boolean;
    }
  | { kind: 'launch'; id: string; name: string; folder: vscode.WorkspaceFolder | undefined; type: string }
  | { kind: 'maven'; id: string; name: string; folder: vscode.WorkspaceFolder | undefined; cwd: string; executable: string; args: string[] }
  | {
      kind: 'eclipse';
      id: string;
      name: string;
      folder: vscode.WorkspaceFolder;
      file: vscode.Uri;
      launch: EclipseLaunch;
      /** Eclipse project name → directory, from the workspace's .project files. */
      projects: Record<string, string>;
    };

export function mavenConfiguration(run: MavenRunData): RunConfiguration {
  const folder = run.folder ? vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(run.folder)) : undefined;
  return { kind: 'maven', id: run.id, name: run.name, folder, cwd: run.cwd, executable: run.executable, args: run.args };
}


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

/** Saved configurations first (IntelliJ order), then every package.json script, then launch.json. */
export async function collectRunConfigurations(saved: readonly NpmConfigData[] = [], maven: readonly MavenRunData[] = []): Promise<RunConfiguration[]> {
  const configurations: RunConfiguration[] = maven.map(mavenConfiguration);
  const packages = await findPackageScripts();
  for (const config of saved) {
    const pkg = packages.find((p) => p.packageJson.toString() === config.packageJson);
    if (pkg) {
      configurations.push({
        kind: 'npm',
        id: config.id,
        name: config.name,
        script: config.script,
        command: pkg.scripts.find((s) => s.name === config.script)?.command ?? '',
        packageJson: pkg.packageJson,
        folder: pkg.folder,
        packageManager: pkg.packageManager,
        args: config.args,
        env: config.env,
        saved: true,
      });
    }
  }
  const multiPackage = packages.map((p, _, all) => ({ ...p, prefix: all.length > 1 ? `${p.label} › ` : '' }));
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
  configurations.push(...(await findEclipseLaunches()));
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

const EXCLUDED = '{**/node_modules/**,**/target/**,**/bin/**,**/build/**,**/.metadata/**}';

/** Eclipse `*.launch` files of the workspace (the ones committed with the project). */
export async function findEclipseLaunches(): Promise<RunConfiguration[]> {
  const files = await vscode.workspace.findFiles('**/*.launch', EXCLUDED, 200);
  if (files.length === 0) {
    return [];
  }
  const projects: Record<string, string> = {};
  for (const uri of await vscode.workspace.findFiles('**/.project', EXCLUDED, 500)) {
    const name = eclipseProjectName(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'));
    if (name) {
      projects[name] = path.dirname(uri.fsPath);
    }
  }
  const result: RunConfiguration[] = [];
  for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
    const folder = vscode.workspace.getWorkspaceFolder(file);
    if (!folder) {
      continue;
    }
    try {
      const launch = parseLaunch(path.basename(file.fsPath, '.launch'), Buffer.from(await vscode.workspace.fs.readFile(file)).toString('utf8'));
      result.push({ kind: 'eclipse', id: `eclipse:${file.toString()}`, name: launch.name, folder, file, launch, projects });
    } catch {
      // Not a launch configuration: ignored.
    }
  }
  return result;
}

/** Project of a main class according to the Java debugger (which may differ from Eclipse's name). */
async function javaProjectOf(mainClass: string): Promise<string | undefined> {
  try {
    const mains = (await vscode.commands.executeCommand<{ mainClass: string; projectName?: string }[]>('vscode.java.resolveMainClass')) ?? [];
    return mains.find((m) => m.mainClass === mainClass)?.projectName;
  } catch {
    return undefined;
  }
}

function mavenTask(name: string, folder: vscode.WorkspaceFolder | undefined, cwd: string, executable: string, args: string[]): Thenable<vscode.TaskExecution> {
  const task = new vscode.Task({ type: 'unintellij-maven', args, cwd }, folder ?? vscode.TaskScope.Workspace, name, 'maven', new vscode.ShellExecution(executable, args, { cwd }));
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true };
  return vscode.tasks.executeTask(task);
}

/** Runs an Eclipse launch the VS Code way: Java debugger for applications, Maven for m2e and JUnit. */
async function startEclipse(configuration: Extract<RunConfiguration, { kind: 'eclipse' }>, debug: boolean): Promise<vscode.TaskExecution | undefined> {
  const { launch, folder, projects } = configuration;
  const projectDir = (name: string): string | undefined => projects[name] ?? (path.basename(folder.uri.fsPath) === name ? folder.uri.fsPath : undefined);
  const home = launch.project ? projectDir(launch.project) : undefined;
  const unsupported: string[] = [];
  const resolve = (text: string | undefined): string | undefined => {
    if (text === undefined) {
      return undefined;
    }
    const resolved = resolveVariables(text, {
      projectDir,
      workspace: folder.uri.fsPath,
      project: launch.project,
      env: process.env,
      systemProperties: { 'user.home': os.homedir(), 'user.dir': home ?? folder.uri.fsPath, 'file.separator': path.sep, 'path.separator': path.delimiter, 'line.separator': os.EOL },
    });
    unsupported.push(...resolved.unsupported);
    return resolved.value;
  };
  const cwd = resolve(launch.workingDir) ?? home ?? folder.uri.fsPath;
  const env = Object.fromEntries(Object.entries(launch.env).map(([k, v]) => [k, resolve(v) ?? '']));
  const warn = () => {
    if (unsupported.length > 0) {
      void vscode.window.showWarningMessage(t('{0}: Eclipse variables not supported, passed as is: {1}', launch.name, [...new Set(unsupported)].join(', ')));
    }
  };
  switch (launch.kind) {
    case 'java':
    case 'remote': {
      if (!vscode.extensions.getExtension(INTEGRATIONS.javaDebug.extensionId)) {
        const install = t('Install Java Extensions…');
        if ((await vscode.window.showWarningMessage(t('Running {0} needs the official Java extensions (Red Hat Java and Debugger for Java).', launch.name), install)) === install) {
          await vscode.commands.executeCommand('unintellij.installJavaExtensions');
        }
        return undefined;
      }
      // Eclipse and VS Code's Java engine may name projects differently (.project name vs Maven
      // artifactId): use the engine's project of the main class, else let it search every project.
      const projectName = launch.mainType ? await javaProjectOf(launch.mainType) : undefined;
      const config: vscode.DebugConfiguration =
        launch.kind === 'remote'
          ? { type: 'java', request: 'attach', name: launch.name, hostName: launch.host ?? 'localhost', port: launch.port ?? 5005 }
          : {
              type: 'java',
              request: 'launch',
              name: launch.name,
              mainClass: launch.mainType ?? '',
              ...(projectName ? { projectName } : {}),
              args: resolve(launch.programArgs)?.replace(/\r?\n/g, ' ') ?? '',
              vmArgs: resolve(vmArgsWithProfile(launch))?.replace(/\r?\n/g, ' ') ?? '',
              env,
              cwd,
            };
      warn();
      await vscode.debug.startDebugging(folder, config, { noDebug: !debug && launch.kind !== 'remote' });
      return undefined;
    }
    case 'maven':
    case 'junit': {
      const base = launch.kind === 'junit' ? (home ?? cwd) : cwd;
      const wrapper = findWrapper(base, folder.uri.fsPath);
      const pom = path.relative(wrapper.cwd, path.join(base, 'pom.xml')).split(path.sep).join('/');
      const args = [...(launch.kind === 'maven' ? m2eArgs(launch) : junitMavenArgs(launch)), ...(pom !== 'pom.xml' ? ['-f', pom] : [])];
      warn();
      return mavenTask(launch.name, folder, wrapper.cwd, wrapperCommand(wrapper.wrapper), args);
    }
    default:
      void vscode.window.showWarningMessage(t('{0}: this Eclipse launch type is not supported ({1}).', launch.name, launch.type));
      return undefined;
  }
}

/** Runs or debugs a configuration. Resolves with the started task execution, if any. */
export async function startConfiguration(configuration: RunConfiguration, debug: boolean): Promise<vscode.TaskExecution | undefined> {
  if (configuration.kind === 'launch') {
    await vscode.debug.startDebugging(configuration.folder, configuration.name, { noDebug: !debug });
    return undefined;
  }
  if (configuration.kind === 'maven') {
    // Debugging a Maven goal needs the Java debugger: goals run the same way in both cases.
    return mavenTask(configuration.name, configuration.folder, configuration.cwd, configuration.executable, configuration.args);
  }
  if (configuration.kind === 'eclipse') {
    return startEclipse(configuration, debug);
  }
  const cwd = path.dirname(configuration.packageJson.fsPath);
  const commandLine = npmCommandLine(configuration.packageManager, configuration.script, configuration.args);
  const env = parseEnv(configuration.env ?? '');
  if (debug) {
    // JavaScript Debug Terminal from VS Code's built-in js-debug.
    await vscode.debug.startDebugging(configuration.folder, { type: 'node-terminal', request: 'launch', name: configuration.name, command: commandLine, cwd, env });
    return undefined;
  }
  const task = new vscode.Task(
    { type: 'unintellij-npm', script: configuration.script, path: configuration.packageJson.fsPath, ...(configuration.args ? { args: configuration.args } : {}) },
    configuration.folder,
    configuration.name,
    configuration.packageManager,
    new vscode.ShellExecution(commandLine, { cwd, env }),
  );
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true };
  return vscode.tasks.executeTask(task);
}

export function configurationIcon(configuration: RunConfiguration): vscode.ThemeIcon {
  switch (configuration.kind) {
    case 'npm':
      return new vscode.ThemeIcon('package');
    case 'maven':
      return new vscode.ThemeIcon('gear');
    case 'eclipse':
      return new vscode.ThemeIcon({ java: 'symbol-class', remote: 'debug-disconnect', maven: 'gear', junit: 'beaker', unsupported: 'warning' }[configuration.launch.kind]);
    default:
      return new vscode.ThemeIcon('debug-alt');
  }
}
