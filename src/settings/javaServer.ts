import * as vscode from 'vscode';
import { t } from '../i18n/i18n';
import { INTEGRATIONS } from '../integrations';
import { isJavaProject } from './javaExtensions';

/**
 * State of the Java language server (Red Hat). Searching classes and methods and Ctrl+click to
 * another class need its Standard mode; in Lightweight mode (syntax only) VS Code just says "No
 * definition found", so UnIntelliJ says why and offers the switch.
 */
export type JavaState = 'notJava' | 'missing' | 'starting' | 'lightweight' | 'standard';

interface JavaApi {
  serverMode?: 'Standard' | 'LightWeight' | 'Hybrid';
}

const DISMISSED_KEY = 'java.lightweightDismissed';
/** Hybrid mode starts Lightweight and switches to Standard once the project is imported. */
const LIGHTWEIGHT_GRACE_MS = 90_000;

export class JavaServer implements vscode.Disposable {
  private javaProject: Promise<boolean> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly started = Date.now();

  constructor(private readonly state: vscode.Memento) {}

  async current(): Promise<JavaState> {
    this.javaProject ??= isJavaProject();
    if (!(await this.javaProject)) {
      return 'notJava';
    }
    const extension = vscode.extensions.getExtension<JavaApi>(INTEGRATIONS.java.extensionId);
    if (!extension) {
      return 'missing';
    }
    if (!extension.isActive) {
      return 'starting';
    }
    const mode = extension.exports?.serverMode;
    if (mode === 'Standard') {
      return 'standard';
    }
    // Hybrid starts in Lightweight mode while the project imports: only a lasting Lightweight mode is a problem.
    const hybrid = vscode.workspace.getConfiguration('java.server').get<string>('launchMode', 'Hybrid') === 'Hybrid';
    return mode === 'LightWeight' && !(hybrid && Date.now() - this.started < LIGHTWEIGHT_GRACE_MS) ? 'lightweight' : 'starting';
  }

  /** Row for Search Everywhere explaining why classes and methods are missing, or undefined when Java is fine. */
  async searchHint(): Promise<{ label: string; detail: string; run: () => Thenable<unknown> } | undefined> {
    switch (await this.current()) {
      case 'missing':
        return { label: `$(warning) ${t('Java support is not installed')}`, detail: t('Classes, methods and Ctrl+click in Java need the Language Support for Java extension (Red Hat).'), run: () => vscode.commands.executeCommand('unintellij.installJavaExtensions') };
      case 'lightweight':
        return { label: `$(warning) ${t('Java is in Lightweight mode')}`, detail: t('Classes and methods are not indexed and Ctrl+click does not reach other classes. Click to switch to Standard mode.'), run: () => switchToStandard() };
      case 'starting':
        return { label: `$(loading~spin) ${t('Java is loading the project')}`, detail: t('Classes and methods appear once the import is done (see Java in the status bar).'), run: () => vscode.commands.executeCommand('java.show.server.task.status') };
      default:
        return undefined;
    }
  }

  /** Once per project: says so when Java is still in Lightweight mode well after startup. */
  onStartup(): void {
    this.timer = setTimeout(() => void this.checkLightweight(), LIGHTWEIGHT_GRACE_MS);
  }

  private async checkLightweight(): Promise<void> {
    if (this.state.get(DISMISSED_KEY) || (await this.current()) !== 'lightweight') {
      return;
    }
    const switchMode = t('Switch to Standard Mode');
    const never = t("Don't Ask Again");
    const answer = await vscode.window.showWarningMessage(
      t('Java is in Lightweight mode: Ctrl+click to another class and searching classes and methods do not work. Switch to Standard mode (imports the Maven / Gradle project)?'),
      switchMode,
      never,
    );
    if (answer === switchMode) {
      await switchToStandard();
    } else if (answer === never) {
      await this.state.update(DISMISSED_KEY, true);
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
  }
}

function switchToStandard(): Thenable<unknown> {
  return vscode.commands.executeCommand('java.server.mode.switch', 'Standard', true);
}
