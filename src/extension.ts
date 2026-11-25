import * as vscode from 'vscode';
import { ThemeSync } from './appearance/themeSync';
import { detectIntegrations, formatIntegrations, IntegrationStatus } from './integrations';

export interface UnIntelliJApi {
  integrations(): IntegrationStatus[];
  /** Resolves once pending appearance synchronizations are done (used by tests). */
  appearanceIdle(): Promise<void>;
}

export async function activate(context: vscode.ExtensionContext): Promise<UnIntelliJApi> {
  const log = vscode.window.createOutputChannel('UnIntelliJ', { log: true });
  context.subscriptions.push(log);

  const version = (context.extension.packageJSON as { version: string }).version;
  log.info(`UnIntelliJ ${version} activated on VS Code ${vscode.version} (${process.platform})`);

  const logIntegrations = (): void => log.info(`Integrations:\n${formatIntegrations(detectIntegrations())}`);
  logIntegrations();
  context.subscriptions.push(vscode.extensions.onDidChange(logIntegrations));

  const themeSync = new ThemeSync(context.globalState, log);
  context.subscriptions.push(themeSync);
  await themeSync.initialize();

  return { integrations: detectIntegrations, appearanceIdle: () => themeSync.idle() };
}

export function deactivate(): void {
  // Nothing to clean up: everything is registered through context.subscriptions.
}
