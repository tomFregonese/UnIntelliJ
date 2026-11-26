import * as os from 'node:os';
import * as vscode from 'vscode';
import { getSetting } from '../config/settings';
import { t } from '../i18n/i18n';
import { otherWindows, registerWindow } from './openWindows';
import { RecentEntry, recentProjects, RecentProject } from './recentProjects';

/**
 * IntelliJ's project widget: the project name next to the branch widget (title bar with Islands+,
 * status bar otherwise). Its popup lists VS Code's recent projects; choosing one opens it as set in
 * `unintellij.appearance.openProjectIn` (a new window by default; a project already open in a
 * window brings that window to the front instead of opening it twice).
 */
export class ProjectWidget implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    // Same id as before 0.5 (Islands+ places it in the title bar); priority just left of the branch widget.
    this.item = vscode.window.createStatusBarItem('unintellij.project', vscode.StatusBarAlignment.Left, 105);
    this.item.name = t('Project');
    this.item.command = 'unintellij.project.switch';
    this.disposables.push(
      this.item,
      vscode.commands.registerCommand('unintellij.project.switch', () => this.show()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.update()),
    );
    this.update();
  }

  private update(): void {
    const name = vscode.workspace.name;
    const uri = projectUri();
    void registerWindow(uri && name ? { uri: uri.toString(), label: name.replace(/ \(Workspace\)$/, '') } : undefined).catch(() => undefined);
    if (!name) {
      this.item.hide();
      return;
    }
    this.item.text = `$(folder) ${name.replace(/ \(Workspace\)$/, '')} $(chevron-down)`;
    this.item.tooltip = t('Recent Projects');
    this.item.show();
  }

  private async show(): Promise<void> {
    type Item = vscode.QuickPickItem & { project?: RecentProject<vscode.Uri>; window?: vscode.Uri; run?: () => Thenable<unknown> };
    const remove: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('close'), tooltip: t('Remove from Recent Projects') };
    const current = currentUris();
    const build = async (): Promise<Item[]> => {
      const recent = await vscode.commands.executeCommand<{ workspaces: RecentEntry<vscode.Uri>[] }>('_workbench.getRecentlyOpened');
      const windows = (await otherWindows().catch(() => [])).filter((w, i, all) => !current.has(w.uri) && all.findIndex((x) => x.uri === w.uri) === i);
      const open = new Set(windows.map((w) => w.uri));
      const projects = recentProjects(recent.workspaces.map(revive), os.homedir()).filter((p) => !open.has(p.uri.toString()));
      const home = os.homedir();
      return [
        { label: `$(folder-opened) ${t('Open…')}`, run: () => this.openDialog() },
        { label: `$(repo-clone) ${t('Clone Repository…')}`, run: () => vscode.commands.executeCommand('git.clone') },
        ...(windows.length > 0 ? [{ label: t('Open Projects'), kind: vscode.QuickPickItemKind.Separator } as Item] : []),
        ...windows.map((w): Item => {
          const uri = vscode.Uri.parse(w.uri);
          const where = uri.scheme === 'file' ? uri.fsPath : uri.path;
          return { label: `$(window) ${w.label}`, description: where.startsWith(home) ? `~${where.slice(home.length)}` : where, window: uri };
        }),
        { label: t('Recent Projects'), kind: vscode.QuickPickItemKind.Separator },
        ...projects.map((project): Item => {
          const open = current.has(project.uri.toString());
          return {
            label: `${open ? '$(check)' : project.workspace ? '$(layers)' : '$(folder)'} ${project.label}`,
            description: project.path,
            project,
            buttons: open ? [] : [remove],
          };
        }),
      ];
    };
    const pick = vscode.window.createQuickPick<Item>();
    pick.placeholder = t('Recent Projects');
    pick.matchOnDescription = true;
    pick.busy = true;
    pick.show();
    pick.items = await build();
    pick.busy = false;
    pick.onDidTriggerItemButton(async ({ item }) => {
      if (item.project) {
        await vscode.commands.executeCommand('_workbench.removeFromRecentlyOpened', item.project.uri);
        pick.items = await build();
      }
    });
    pick.onDidAccept(() => {
      const [item] = pick.selectedItems;
      pick.hide();
      if (item?.run) {
        void item.run();
      } else if (item?.window) {
        // Already open: VS Code brings its window to the front instead of opening it again.
        void vscode.commands.executeCommand('vscode.openFolder', item.window, { forceNewWindow: true });
      } else if (item?.project && !current.has(item.project.uri.toString())) {
        void openProject(item.project.uri);
      }
    });
    pick.onDidHide(() => pick.dispose());
  }

  private async openDialog(): Promise<void> {
    const [uri] = (await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: t('Open') })) ?? [];
    if (uri) {
      await openProject(uri);
    }
  }

  dispose(): void {
    void registerWindow(undefined).catch(() => undefined);
    this.disposables.forEach((d) => d.dispose());
  }
}

/** The .code-workspace file of this window, else its first folder. */
function projectUri(): vscode.Uri | undefined {
  const file = vscode.workspace.workspaceFile;
  return file && file.scheme !== 'untitled' ? file : vscode.workspace.workspaceFolders?.[0]?.uri;
}

/** Makes sure the entry holds real `Uri`s (results of internal commands may be plain objects). */
function revive(entry: RecentEntry<vscode.Uri>): RecentEntry<vscode.Uri> {
  const uri = (u: vscode.Uri) => (u instanceof vscode.Uri ? u : vscode.Uri.from(u));
  return 'workspace' in entry ? { ...entry, workspace: { configPath: uri(entry.workspace.configPath) } } : { ...entry, folderUri: uri(entry.folderUri) };
}

/** URIs of what this window has open: its folders and its .code-workspace file. */
function currentUris(): Set<string> {
  const uris = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.toString());
  if (vscode.workspace.workspaceFile && vscode.workspace.workspaceFile.scheme !== 'untitled') {
    return new Set([vscode.workspace.workspaceFile.toString()]);
  }
  return new Set(uris);
}

/** Opens a folder or .code-workspace as set in Settings (IntelliJ: Open project in New window / This window / Ask). */
export async function openProject(uri: vscode.Uri): Promise<void> {
  let where = getSetting('appearance.openProjectIn');
  if (where === 'ask') {
    const newWindow = t('New Window');
    const thisWindow = t('This Window');
    const answer = await vscode.window.showInformationMessage(t('Where do you want to open the project?'), { modal: true }, newWindow, thisWindow);
    if (!answer) {
      return;
    }
    where = answer === newWindow ? 'newWindow' : 'currentWindow';
  }
  await vscode.commands.executeCommand('vscode.openFolder', uri, where === 'newWindow' ? { forceNewWindow: true } : { forceReuseWindow: true });
}
