import * as vscode from 'vscode';
import { t } from '../i18n/i18n';
import { INTEGRATIONS } from '../integrations';

/** Set when the user answered "Don't Ask Again". */
const DISMISSED_KEY = 'java.extensionsDismissed';
/** Workspaces already asked this session (Not Now asks again next time). */
const asked = new Set<string>();

/** The official Java extensions UnIntelliJ relies on; nothing else (no extension pack). */
const CHOICES = [
  { id: INTEGRATIONS.java.extensionId, label: 'Language Support for Java (Red Hat)', detail: 'Completion, navigation, errors, refactorings: the Java engine.', picked: true },
  { id: INTEGRATIONS.javaDebug.extensionId, label: 'Debugger for Java (Microsoft)', detail: 'Run and debug Java applications and Eclipse launch configurations.', picked: true },
  { id: INTEGRATIONS.springBoot.extensionId, label: 'Spring Boot Tools (Spring)', detail: 'Optional: beans, endpoints, validation of application.properties (UnIntelliJ already completes it).', picked: false },
];

/**
 * In a Java / Maven project, offers once to install the official Java extensions, with checkboxes.
 * Never installs anything without the user's choice.
 */
export class JavaExtensions {
  constructor(private readonly state: vscode.Memento) {}

  async onStartup(): Promise<void> {
    if (this.state.get(DISMISSED_KEY) || CHOICES.filter((c) => c.picked).every((c) => vscode.extensions.getExtension(c.id))) {
      return;
    }
    const key = vscode.workspace.workspaceFolders?.map((f) => f.uri.toString()).join('|') ?? '';
    if (asked.has(key) || !(await isJavaProject())) {
      return;
    }
    asked.add(key);
    const choose = t('Choose…');
    const never = t("Don't Ask Again");
    const answer = await vscode.window.showInformationMessage(
      t('UnIntelliJ: this is a Java project. Install the official Java extensions (Red Hat Java, Java Debugger, optionally Spring Boot Tools)? Nothing else is installed.'),
      choose,
      t('Not Now'),
      never,
    );
    if (answer === choose) {
      await this.choose();
    } else if (answer === never) {
      await this.state.update(DISMISSED_KEY, true);
    }
  }

  /** Checkbox list of the missing extensions; installs the checked ones. */
  async choose(): Promise<void> {
    const missing = CHOICES.filter((c) => !vscode.extensions.getExtension(c.id));
    if (missing.length === 0) {
      void vscode.window.showInformationMessage(t('The Java extensions are already installed.'));
      return;
    }
    const picked = await vscode.window.showQuickPick(
      missing.map((c) => ({ label: t(c.label), detail: t(c.detail), description: c.id, picked: c.picked, id: c.id })),
      { canPickMany: true, title: t('Java Extensions'), placeHolder: t('Check the extensions to install') },
    );
    if (!picked || picked.length === 0) {
      return;
    }
    const failed: { label: string; id: string; error: string }[] = [];
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: t('Installing Java extensions…') }, async () => {
      for (const extension of picked) {
        try {
          await vscode.commands.executeCommand('workbench.extensions.installExtension', extension.id);
        } catch (error) {
          failed.push({ label: extension.label, id: extension.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
    });
    const installed = picked.filter((p) => !failed.some((f) => f.id === p.id));
    if (installed.length > 0) {
      void vscode.window.showInformationMessage(t('{0} installed.', installed.map((p) => p.label).join(', ')));
    }
    for (const failure of failed) {
      void this.reportFailure(failure);
    }
  }

  /** Says why VS Code refused the install, with the manual way out: a .vsix downloaded by hand. */
  private async reportFailure(failure: { label: string; id: string; error: string }): Promise<void> {
    const marketplace = t('Download .vsix');
    const vsix = t('Install from VSIX…');
    const answer = await vscode.window.showErrorMessage(t('{0} could not be installed: {1}', failure.label, failure.error), marketplace, vsix);
    if (answer === marketplace) {
      await vscode.env.openExternal(vscode.Uri.parse(`https://open-vsx.org/extension/${failure.id.replace('.', '/')}`));
    } else if (answer === vsix) {
      await vscode.commands.executeCommand('workbench.extensions.action.installVSIX');
    }
  }
}

export async function isJavaProject(): Promise<boolean> {
  const found = await vscode.workspace.findFiles('{**/pom.xml,**/build.gradle,**/build.gradle.kts,**/*.java}', '{**/node_modules/**,**/target/**,**/build/**}', 1);
  return found.length > 0;
}
