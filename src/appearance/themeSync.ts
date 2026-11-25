import * as vscode from 'vscode';
import { CONFIG_NAMESPACE, SettingKey } from '../config/schema';
import { getSetting, setSetting } from '../config/settings';
import {
  AppearanceSettings,
  appearanceUpdatesFor,
  themeIdFromLabel,
  vsCodeUpdatesFor,
  VsCodeThemeSettings,
} from './themeLogic';

const INITIALIZED_KEY = 'appearance.themeInitialized';

const APPEARANCE_KEYS = {
  theme: 'appearance.theme',
  syncWithOs: 'appearance.syncWithOs',
  preferredDarkTheme: 'appearance.preferredDarkTheme',
  preferredLightTheme: 'appearance.preferredLightTheme',
} as const satisfies Record<keyof AppearanceSettings, SettingKey>;

/** Where each VS Code theme setting lives: [section, key]. */
const VSCODE_KEYS = {
  colorTheme: ['workbench', 'colorTheme'],
  autoDetectColorScheme: ['window', 'autoDetectColorScheme'],
  preferredDarkColorTheme: ['workbench', 'preferredDarkColorTheme'],
  preferredLightColorTheme: ['workbench', 'preferredLightColorTheme'],
} as const satisfies Record<keyof VsCodeThemeSettings, readonly [string, string]>;

function readAppearance(): AppearanceSettings {
  return {
    theme: getSetting('appearance.theme'),
    syncWithOs: getSetting('appearance.syncWithOs'),
    preferredDarkTheme: getSetting('appearance.preferredDarkTheme'),
    preferredLightTheme: getSetting('appearance.preferredLightTheme'),
  };
}

function readVsCode(): VsCodeThemeSettings {
  const get = <T>([section, key]: readonly [string, string]): T | undefined =>
    vscode.workspace.getConfiguration(section).get<T>(key);
  return {
    colorTheme: get<string>(VSCODE_KEYS.colorTheme),
    autoDetectColorScheme: get<boolean>(VSCODE_KEYS.autoDetectColorScheme) ?? false,
    preferredDarkColorTheme: get<string>(VSCODE_KEYS.preferredDarkColorTheme),
    preferredLightColorTheme: get<string>(VSCODE_KEYS.preferredLightColorTheme),
  };
}

/**
 * Keeps VS Code's theme settings and `unintellij.appearance.*` in sync, both ways.
 * UnIntelliJ's settings win; theme changes made through VS Code are reflected back
 * when they involve an Islands theme.
 */
export class ThemeSync implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  /** Serializes writes and lets us ignore the change events our own writes trigger. */
  private queue: Promise<void> = Promise.resolve();
  private writing = 0;

  constructor(
    private readonly state: vscode.Memento,
    private readonly log: vscode.LogOutputChannel,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (this.writing > 0) {
          return;
        }
        if (Object.values(APPEARANCE_KEYS).some((k) => event.affectsConfiguration(`${CONFIG_NAMESPACE}.${k}`))) {
          void this.enqueue(() => this.applyToVsCode());
        } else if (Object.values(VSCODE_KEYS).some(([s, k]) => event.affectsConfiguration(`${s}.${k}`))) {
          void this.enqueue(() => this.reflectFromVsCode());
        }
      }),
    );
  }

  /** On first activation, switch VS Code to Islands, keeping the user's "follow OS" preference. */
  async initialize(): Promise<void> {
    await this.enqueue(async () => {
      if (this.state.get<boolean>(INITIALIZED_KEY)) {
        return;
      }
      const syncInspect = vscode.workspace
        .getConfiguration(CONFIG_NAMESPACE)
        .inspect(APPEARANCE_KEYS.syncWithOs);
      const syncExplicit = syncInspect?.globalValue !== undefined || syncInspect?.workspaceValue !== undefined;
      if (!syncExplicit && readVsCode().autoDetectColorScheme) {
        await this.write(() => setSetting('appearance.syncWithOs', true));
      }
      // A theme the user chose themselves is never replaced here: SetupPrompt asks once instead.
      const own = vscode.workspace.getConfiguration('workbench').inspect<string>('colorTheme')?.globalValue;
      if (own === undefined || themeIdFromLabel(own)) {
        await this.applyToVsCode();
      }
      await this.state.update(INITIALIZED_KEY, true);
    });
  }

  /** Waits for pending synchronizations (used by tests). */
  idle(): Promise<void> {
    return this.queue;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }

  private async applyToVsCode(): Promise<void> {
    const updates = vsCodeUpdatesFor(readAppearance(), readVsCode());
    for (const [name, value] of Object.entries(updates) as [keyof VsCodeThemeSettings, unknown][]) {
      const [section, key] = VSCODE_KEYS[name];
      this.log.info(`Appearance: setting ${section}.${key} = ${JSON.stringify(value)}`);
      await this.write(() =>
        vscode.workspace.getConfiguration(section).update(key, value, vscode.ConfigurationTarget.Global),
      );
    }
  }

  private async reflectFromVsCode(): Promise<void> {
    const updates = appearanceUpdatesFor(readVsCode(), readAppearance());
    for (const [name, value] of Object.entries(updates) as [keyof AppearanceSettings, never][]) {
      this.log.info(`Appearance: reflecting VS Code change, ${APPEARANCE_KEYS[name]} = ${JSON.stringify(value)}`);
      await this.write(() => setSetting(APPEARANCE_KEYS[name], value));
    }
  }

  private async write(action: () => Thenable<void>): Promise<void> {
    this.writing++;
    try {
      await action();
    } finally {
      this.writing--;
    }
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task).catch((error: unknown) => {
      this.log.error(`Appearance synchronization failed: ${String(error)}`);
    });
    return this.queue;
  }
}
