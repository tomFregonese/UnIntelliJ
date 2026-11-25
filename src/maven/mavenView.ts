import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { t } from '../i18n/i18n';
import { mavenConfiguration } from '../run/configurations';
import { MAVEN_RUNS_KEY, MavenRunData, rememberMavenRun } from '../run/runConfigLogic';
import { dependencyLabel, KNOWN_GOALS, LIFECYCLE, mavenArgs, Plugin, Pom, Profile, parsePom, projectLabel, splitCommandLine } from './pomLogic';

export interface MavenProject {
  pom: Pom;
  uri: vscode.Uri;
  dir: string;
  folder: vscode.WorkspaceFolder | undefined;
  modules: MavenProject[];
  /** Set when the pom could not be read. */
  error?: string;
}

type Node =
  | { kind: 'profiles'; profiles: Profile[] }
  | { kind: 'profile'; profile: Profile }
  | { kind: 'project'; project: MavenProject }
  | { kind: 'lifecycle'; project: MavenProject }
  | { kind: 'plugins'; project: MavenProject }
  | { kind: 'plugin'; project: MavenProject; plugin: Plugin }
  | { kind: 'dependencies'; project: MavenProject }
  | { kind: 'goal'; project: MavenProject; goal: string; phase: boolean }
  | { kind: 'leaf'; label: string; description?: string; icon: string };

const OPTIONS_KEY = 'maven.options';

interface Options {
  offline: boolean;
  skipTests: boolean;
  /** Profiles checked in the Profiles node (IntelliJ: explicitly enabled). */
  profiles: string[];
}

/** IntelliJ's Maven tool window: Profiles, then each project's Lifecycle, Plugins, Dependencies and modules. */
export class MavenView implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly view: vscode.TreeView<Node>;
  private readonly disposables: vscode.Disposable[] = [];
  private projects: MavenProject[] | undefined;
  private loading: Promise<MavenProject[]> | undefined;
  private lastClick: { key: string; time: number } | undefined;

  constructor(private readonly state: vscode.Memento) {
    this.view = vscode.window.createTreeView('unintellij.maven', { treeDataProvider: this, showCollapseAll: true, manageCheckboxStateManually: true });
    const watcher = vscode.workspace.createFileSystemWatcher('**/pom.xml');
    this.disposables.push(
      this.view,
      this.changed,
      watcher,
      watcher.onDidChange(() => this.reload()),
      watcher.onDidCreate(() => this.reload()),
      watcher.onDidDelete(() => this.reload()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.reload()),
      this.view.onDidChangeCheckboxState((e) => void this.onProfilesChecked(e)),
      vscode.commands.registerCommand('unintellij.maven.reload', () => this.reload()),
      vscode.commands.registerCommand('unintellij.maven.click', (node: Node) => this.onClick(node)),
      vscode.commands.registerCommand('unintellij.maven.run', (node?: Node) => this.runNode(node ?? this.view.selection[0])),
      vscode.commands.registerCommand('unintellij.maven.executeGoal', (node?: Node) => this.executeGoal(node ?? this.view.selection[0])),
      vscode.commands.registerCommand('unintellij.maven.openPom', (node?: Node) => this.openPom(node ?? this.view.selection[0])),
      vscode.commands.registerCommand('unintellij.maven.toggleOffline', () => this.toggle('offline')),
      vscode.commands.registerCommand('unintellij.maven.toggleOfflineOff', () => this.toggle('offline')),
      vscode.commands.registerCommand('unintellij.maven.toggleSkipTests', () => this.toggle('skipTests')),
      vscode.commands.registerCommand('unintellij.maven.toggleSkipTestsOff', () => this.toggle('skipTests')),
    );
    this.updateContext();
    void this.load();
  }

  private get options(): Options {
    return { offline: false, skipTests: false, profiles: [], ...this.state.get<Partial<Options>>(OPTIONS_KEY) };
  }

  private async setOptions(options: Partial<Options>): Promise<void> {
    await this.state.update(OPTIONS_KEY, { ...this.options, ...options });
    this.updateContext();
  }

  private updateContext(): void {
    void vscode.commands.executeCommand('setContext', 'unintellij.maven.offline', this.options.offline);
    void vscode.commands.executeCommand('setContext', 'unintellij.maven.skipTests', this.options.skipTests);
  }

  private async toggle(option: 'offline' | 'skipTests'): Promise<void> {
    await this.setOptions({ [option]: !this.options[option] });
    vscode.window.setStatusBarMessage(
      option === 'offline' ? (this.options.offline ? t('Maven: offline mode on') : t('Maven: offline mode off')) : this.options.skipTests ? t('Maven: tests skipped') : t('Maven: tests run'),
      2000,
    );
  }

  reload(): void {
    this.projects = undefined;
    this.loading = undefined;
    this.changed.fire(undefined);
  }

  /** Every pom.xml of the workspace, as a tree of aggregators and modules. */
  load(): Promise<MavenProject[]> {
    if (this.projects) {
      return Promise.resolve(this.projects);
    }
    this.loading ??= (async () => {
      const uris = await vscode.workspace.findFiles('**/pom.xml', '{**/target/**,**/node_modules/**,**/.git/**,**/src/test/resources/**}', 500);
      const all: MavenProject[] = [];
      for (const uri of uris) {
        const base = { uri, dir: path.dirname(uri.fsPath), folder: vscode.workspace.getWorkspaceFolder(uri), modules: [] };
        try {
          const pom = parsePom(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'));
          all.push({ ...base, pom });
        } catch (error) {
          all.push({ ...base, pom: { artifactId: path.basename(base.dir), packaging: 'pom', modules: [], dependencies: [], plugins: [], profiles: [] }, error: error instanceof Error ? error.message : String(error) });
        }
      }
      const byDir = new Map(all.map((p) => [path.normalize(p.dir), p]));
      const nested = new Set<MavenProject>();
      for (const project of all) {
        for (const module of project.pom.modules) {
          const target = path.normalize(path.join(project.dir, module.replace(/[/\\]pom\.xml$/, '')));
          const found = byDir.get(target);
          if (found && found !== project) {
            project.modules.push(found);
            nested.add(found);
          }
        }
      }
      const roots = all.filter((p) => !nested.has(p)).sort((a, b) => a.dir.length - b.dir.length || a.dir.localeCompare(b.dir));
      this.projects = roots;
      void vscode.commands.executeCommand('setContext', 'unintellij.mavenProjects', all.length > 0);
      return roots;
    })();
    return this.loading;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const collapsed = vscode.TreeItemCollapsibleState.Collapsed;
    switch (node.kind) {
      case 'profiles':
        return Object.assign(new vscode.TreeItem(t('Profiles'), collapsed), { iconPath: new vscode.ThemeIcon('checklist'), id: 'profiles' });
      case 'profile': {
        const item = new vscode.TreeItem(node.profile.id);
        item.checkboxState = this.options.profiles.includes(node.profile.id) ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
        item.description = node.profile.activeByDefault ? t('active by default') : undefined;
        item.id = `profile:${node.profile.id}`;
        return item;
      }
      case 'project': {
        const item = new vscode.TreeItem(projectLabel(node.project.pom), vscode.TreeItemCollapsibleState.Expanded);
        item.iconPath = new vscode.ThemeIcon(node.project.error ? 'error' : 'package');
        item.description = node.project.error ?? (this.projects?.includes(node.project) && node.project.modules.length > 0 ? t('(root)') : undefined);
        item.tooltip = `${node.project.pom.groupId ?? ''}:${node.project.pom.artifactId}:${node.project.pom.version ?? ''}\n${vscode.workspace.asRelativePath(node.project.uri)}`;
        item.contextValue = 'project';
        item.id = `project:${node.project.uri.toString()}`;
        return item;
      }
      case 'lifecycle':
        return Object.assign(new vscode.TreeItem(t('Lifecycle'), collapsed), { iconPath: new vscode.ThemeIcon('folder'), id: `lifecycle:${node.project.uri.toString()}` });
      case 'plugins':
        return Object.assign(new vscode.TreeItem(t('Plugins'), collapsed), { iconPath: new vscode.ThemeIcon('folder'), id: `plugins:${node.project.uri.toString()}` });
      case 'dependencies':
        return Object.assign(new vscode.TreeItem(t('Dependencies'), collapsed), { iconPath: new vscode.ThemeIcon('folder'), id: `dependencies:${node.project.uri.toString()}` });
      case 'plugin': {
        const goals = KNOWN_GOALS[node.plugin.prefix];
        const item = new vscode.TreeItem(node.plugin.prefix, goals ? collapsed : vscode.TreeItemCollapsibleState.None);
        item.description = `(${node.plugin.groupId}:${node.plugin.artifactId}${node.plugin.version ? `:${node.plugin.version}` : ''})`;
        item.iconPath = new vscode.ThemeIcon('plug');
        item.id = `plugin:${node.project.uri.toString()}:${node.plugin.artifactId}`;
        return item;
      }
      case 'goal': {
        const item = new vscode.TreeItem(node.goal);
        item.iconPath = new vscode.ThemeIcon('gear');
        item.contextValue = 'goal';
        item.tooltip = t('Double-click to run {0}', node.goal);
        item.command = { command: 'unintellij.maven.click', title: t('Run'), arguments: [node] };
        item.id = `goal:${node.project.uri.toString()}:${node.goal}`;
        return item;
      }
      case 'leaf': {
        const item = new vscode.TreeItem(node.label);
        item.description = node.description;
        item.iconPath = new vscode.ThemeIcon(node.icon);
        return item;
      }
    }
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) {
      const projects = await this.load();
      const profiles = new Map<string, Profile>();
      const collect = (p: MavenProject): void => {
        p.pom.profiles.forEach((profile) => profiles.set(profile.id, profiles.get(profile.id) ?? profile));
        p.modules.forEach(collect);
      };
      projects.forEach(collect);
      const top: Node[] = profiles.size > 0 ? [{ kind: 'profiles', profiles: [...profiles.values()] }] : [];
      return [...top, ...projects.map((project): Node => ({ kind: 'project', project }))];
    }
    switch (node.kind) {
      case 'profiles':
        return node.profiles.map((profile) => ({ kind: 'profile', profile }));
      case 'project': {
        const project = node.project;
        const nodes: Node[] = [{ kind: 'lifecycle', project }];
        if (project.pom.plugins.length > 0) {
          nodes.push({ kind: 'plugins', project });
        }
        if (project.pom.dependencies.length > 0) {
          nodes.push({ kind: 'dependencies', project });
        }
        return [...nodes, ...project.modules.map((module): Node => ({ kind: 'project', project: module }))];
      }
      case 'lifecycle':
        return LIFECYCLE.map((goal) => ({ kind: 'goal', project: node.project, goal, phase: true }));
      case 'plugins':
        return node.project.pom.plugins.map((plugin) => ({ kind: 'plugin', project: node.project, plugin }));
      case 'plugin':
        return (KNOWN_GOALS[node.plugin.prefix] ?? []).map((goal) => ({ kind: 'goal', project: node.project, goal: `${node.plugin.prefix}:${goal}`, phase: false }));
      case 'dependencies':
        return node.project.pom.dependencies.map((d) => ({ kind: 'leaf', ...dependencyLabel(d), icon: 'library' }));
      default:
        return [];
    }
  }

  private async onProfilesChecked(event: vscode.TreeCheckboxChangeEvent<Node>): Promise<void> {
    let profiles = [...this.options.profiles];
    for (const [node, state] of event.items) {
      if (node.kind === 'profile') {
        profiles = profiles.filter((p) => p !== node.profile.id);
        if (state === vscode.TreeItemCheckboxState.Checked) {
          profiles.push(node.profile.id);
        }
      }
    }
    await this.setOptions({ profiles });
    this.changed.fire(undefined);
  }

  /** VS Code trees only report single clicks: two on the same goal within 500 ms run it (IntelliJ double-click). */
  private async onClick(node: Node): Promise<void> {
    if (node.kind !== 'goal') {
      return;
    }
    const key = `${node.project.uri.toString()}:${node.goal}`;
    const now = Date.now();
    if (this.lastClick?.key === key && now - this.lastClick.time < 500) {
      this.lastClick = undefined;
      await this.run(node.project, [node.goal]);
    } else {
      this.lastClick = { key, time: now };
    }
  }

  private async runNode(node: Node | undefined): Promise<void> {
    if (node?.kind === 'goal') {
      await this.run(node.project, [node.goal]);
    }
  }

  private projectOf(node: Node | undefined): MavenProject | undefined {
    return node && 'project' in node ? node.project : this.projects?.[0];
  }

  /** IntelliJ's "Execute Maven Goal": a command line for the selected project. */
  private async executeGoal(node: Node | undefined): Promise<void> {
    await this.load();
    const project = this.projectOf(node);
    if (!project) {
      void vscode.window.showInformationMessage(t('No pom.xml in this workspace.'));
      return;
    }
    const line = await vscode.window.showInputBox({
      title: t('Execute Maven Goal ({0})', projectLabel(project.pom)),
      prompt: t('Goals and options, for example: clean install -DskipTests'),
      value: this.state.get<string>('maven.lastGoal') ?? 'clean install',
    });
    if (!line?.trim()) {
      return;
    }
    await this.state.update('maven.lastGoal', line.trim());
    await this.run(project, splitCommandLine(line.replace(/^\s*mvn\s+/, '')));
  }

  private async openPom(node: Node | undefined): Promise<void> {
    const project = this.projectOf(node);
    if (project) {
      await vscode.window.showTextDocument(project.uri);
    }
  }

  /** Runs goals with the tool window options, as a temporary run configuration of the Run widget. */
  async run(project: MavenProject, goals: string[]): Promise<void> {
    const { cwd, wrapper } = findWrapper(project.dir, project.folder?.uri.fsPath);
    const executable = wrapper ? (process.platform === 'win32' ? '.\\mvnw.cmd' : './mvnw') : 'mvn';
    const options = this.options;
    const args = mavenArgs({ executable, goals, pomFile: path.relative(cwd, project.uri.fsPath).split(path.sep).join('/'), offline: options.offline, skipTests: options.skipTests, profiles: options.profiles });
    const run: MavenRunData = {
      id: `maven:${project.uri.toString()}:${goals.join(' ')}`,
      name: `${projectLabel(project.pom)} [${goals.join(',')}]`,
      cwd,
      executable,
      args,
      folder: project.folder?.uri.toString(),
    };
    await this.state.update(MAVEN_RUNS_KEY, rememberMavenRun(this.state.get<MavenRunData[]>(MAVEN_RUNS_KEY, []), run));
    await vscode.commands.executeCommand('unintellij.runConfiguration', mavenConfiguration(run));
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

/** The closest Maven wrapper (mvnw) from the project up to the workspace folder; it is run from its own directory. */
function findWrapper(dir: string, stop: string | undefined): { cwd: string; wrapper: boolean } {
  for (let current = dir; ; current = path.dirname(current)) {
    if (existsSync(path.join(current, 'mvnw')) || existsSync(path.join(current, 'mvnw.cmd'))) {
      return { cwd: current, wrapper: true };
    }
    if (!stop || current === stop || path.dirname(current) === current || !current.startsWith(stop)) {
      return { cwd: dir, wrapper: false };
    }
  }
}
