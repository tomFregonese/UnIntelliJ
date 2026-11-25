import * as vscode from 'vscode';
import { shortcutFor } from '../search/actions';
import { collectRunConfigurations, configurationIcon, RunConfiguration, startConfiguration } from './configurations';
import { EditConfigurationsPanel, SavedConfigurations } from './editConfigurations';
import { MAVEN_RUNS_KEY, MavenRunData } from './runConfigLogic';
import { t } from '../i18n/i18n';

const SELECTED_KEY = 'run.selectedConfiguration';

/**
 * IntelliJ's Run widget: selected run configuration with Run, Debug and Stop. Shown in the status
 * bar (the title bar is not extensible without Islands+).
 */
export class RunWidget implements vscode.Disposable {
  private readonly selector: vscode.StatusBarItem;
  private readonly runButton: vscode.StatusBarItem;
  private readonly debugButton: vscode.StatusBarItem;
  private readonly stopButton: vscode.StatusBarItem;
  private readonly running = new Map<string, vscode.TaskExecution>();
  private readonly disposables: vscode.Disposable[] = [];
  private selected: RunConfiguration | undefined;

  private readonly saved: SavedConfigurations;
  private readonly editor: EditConfigurationsPanel;

  constructor(
    private readonly state: vscode.Memento,
    extensionUri: vscode.Uri,
  ) {
    this.saved = new SavedConfigurations(state);
    this.editor = new EditConfigurationsPanel(extensionUri, this.saved);
    const item = (id: string, priority: number) => vscode.window.createStatusBarItem(`unintellij.run.${id}`, vscode.StatusBarAlignment.Left, priority);
    this.selector = item('selector', 103);
    this.runButton = item('run', 102);
    this.debugButton = item('debug', 101);
    this.stopButton = item('stop', 100);
    this.selector.name = t('Run Configuration');
    this.selector.command = 'unintellij.run.selectConfiguration';
    this.runButton.name = t('Run');
    this.runButton.command = 'unintellij.run';
    this.runButton.text = '$(play)';
    this.debugButton.name = t('Debug');
    this.debugButton.command = 'unintellij.debug';
    this.debugButton.text = '$(debug-alt)';
    this.stopButton.name = t('Stop');
    this.stopButton.command = 'unintellij.stop';
    this.stopButton.text = '$(debug-stop)';
    this.stopButton.color = new vscode.ThemeColor('errorForeground');

    this.disposables.push(
      this.selector,
      this.runButton,
      this.debugButton,
      this.stopButton,
      this.saved,
      this.editor,
      this.saved.onDidChange(() => void this.restoreSelection()),
      vscode.commands.registerCommand('unintellij.run.refreshConfigurations', () => this.restoreSelection()),
      vscode.commands.registerCommand('unintellij.run.selectConfiguration', () => this.pick('select')),
      vscode.commands.registerCommand('unintellij.run.editConfigurations', () => this.editor.show(this.selected?.id)),
      vscode.commands.registerCommand('unintellij.run', () => this.start(false)),
      vscode.commands.registerCommand('unintellij.debug', () => this.start(true)),
      vscode.commands.registerCommand('unintellij.runAnything', () => this.pick('run')),
      vscode.commands.registerCommand('unintellij.debugAnything', () => this.pick('debug')),
      vscode.commands.registerCommand('unintellij.stop', () => this.stop()),
      vscode.commands.registerCommand('unintellij.runConfiguration', (configuration: RunConfiguration, debug = false) => this.startConfiguration(configuration, debug)),
      vscode.tasks.onDidEndTask((e) => {
        for (const [id, execution] of this.running) {
          if (execution === e.execution) {
            this.running.delete(id);
          }
        }
        this.render();
      }),
      vscode.debug.onDidStartDebugSession(() => this.render()),
      vscode.debug.onDidTerminateDebugSession(() => this.render()),
    );
    void this.restoreSelection();
  }

  private async restoreSelection(): Promise<void> {
    const id = this.state.get<string>(SELECTED_KEY);
    const configurations = await collectRunConfigurations(this.saved.all, this.state.get<MavenRunData[]>(MAVEN_RUNS_KEY, []));
    this.selected = configurations.find((c) => c.id === id) ?? configurations.find((c) => c.kind === 'npm' && c.script === 'start') ?? configurations[0];
    this.render();
  }

  private render(): void {
    if (!this.selected) {
      this.selector.text = t('$(play) Add Configuration…');
      this.selector.tooltip = t('No run configuration: add npm scripts or a launch.json configuration');
      this.selector.show();
      this.runButton.hide();
      this.debugButton.hide();
      this.stopButton.hide();
      return;
    }
    this.selector.text = t('$({0}) {1} $(chevron-down)', configurationIcon(this.selected).id, this.selected.name);
    this.selector.tooltip = t('Select Run/Debug Configuration');
    this.runButton.tooltip = t('Run \'{0}\'{1}', this.selected.name, hint(shortcutFor('unintellij.run')));
    this.debugButton.tooltip = t('Debug \'{0}\'{1}', this.selected.name, hint(shortcutFor('unintellij.debug')));
    this.stopButton.tooltip = t('Stop{0}', hint(shortcutFor('unintellij.stop')));
    this.selector.show();
    this.runButton.show();
    this.debugButton.show();
    if (this.running.size > 0 || vscode.debug.activeDebugSession) {
      this.stopButton.show();
    } else {
      this.stopButton.hide();
    }
  }

  private async pick(then: 'select' | 'run' | 'debug'): Promise<void> {
    const configurations = await collectRunConfigurations(this.saved.all, this.state.get<MavenRunData[]>(MAVEN_RUNS_KEY, []));
    type Item = vscode.QuickPickItem & { configuration?: RunConfiguration };
    const items: Item[] = [];
    const groups: [string, RunConfiguration[]][] = [
      ['Maven', configurations.filter((c) => c.kind === 'maven')],
      ['npm', configurations.filter((c) => c.kind === 'npm' && c.saved)],
      ['npm scripts', configurations.filter((c) => c.kind === 'npm' && !c.saved)],
      [t('Eclipse Launch Configurations'), configurations.filter((c) => c.kind === 'eclipse')],
      [t('Launch Configurations'), configurations.filter((c) => c.kind === 'launch')],
    ];
    for (const [label, group] of groups) {
      if (group.length > 0) {
        items.push({ label, kind: vscode.QuickPickItemKind.Separator });
        items.push(
          ...group.map((c) => ({
            label: t('$({0}) {1}', configurationIcon(c).id, c.name),
            description: description(c),
            picked: c.id === this.selected?.id,
            configuration: c,
          })),
        );
      }
    }
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator }, { label: t('$(edit) Edit Configurations…') });
    const picked = await vscode.window.showQuickPick(items, { title: then === 'select' ? t('Run/Debug Configurations') : then === 'run' ? t('Run') : t('Debug'), placeHolder: t('Type to filter') });
    if (!picked) {
      return;
    }
    if (!picked.configuration) {
      this.editor.show(this.selected?.id);
      return;
    }
    await this.select(picked.configuration);
    if (then !== 'select') {
      await this.startConfiguration(picked.configuration, then === 'debug');
    }
  }

  private async select(configuration: RunConfiguration): Promise<void> {
    this.selected = configuration;
    await this.state.update(SELECTED_KEY, configuration.id);
    this.render();
  }

  private async start(debug: boolean): Promise<void> {
    if (!this.selected) {
      await this.pick(debug ? 'debug' : 'run');
      return;
    }
    await this.startConfiguration(this.selected, debug);
  }

  private async startConfiguration(configuration: RunConfiguration, debug: boolean): Promise<void> {
    await this.select(configuration);
    const previous = this.running.get(configuration.id);
    // IntelliJ reruns a single-instance configuration: stop the previous run first.
    previous?.terminate();
    const execution = await startConfiguration(configuration, debug);
    if (execution) {
      this.running.set(configuration.id, execution);
    }
    this.render();
  }

  private async stop(): Promise<void> {
    if (vscode.debug.activeDebugSession) {
      await vscode.debug.stopDebugging(vscode.debug.activeDebugSession);
    }
    for (const execution of this.running.values()) {
      execution.terminate();
    }
    this.running.clear();
    this.render();
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

function hint(shortcut: string | undefined): string {
  return shortcut ? ` (${shortcut})` : '';
}

function description(configuration: RunConfiguration): string {
  switch (configuration.kind) {
    case 'npm':
      return configuration.command;
    case 'maven':
      return configuration.args.join(' ');
    case 'eclipse': {
      const launch = configuration.launch;
      return launch.mainType ?? launch.goals ?? (launch.kind === 'remote' ? `${launch.host ?? 'localhost'}:${launch.port ?? ''}` : launch.type);
    }
    default:
      return configuration.type;
  }
}
