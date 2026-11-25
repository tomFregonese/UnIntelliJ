import * as vscode from 'vscode';
import { detectIntegrations, formatIntegrations, IntegrationStatus } from './integrations';

export interface UnIntelliJApi {
  integrations(): IntegrationStatus[];
}

export function activate(context: vscode.ExtensionContext): UnIntelliJApi {
  const log = vscode.window.createOutputChannel('UnIntelliJ', { log: true });
  context.subscriptions.push(log);

  const version = (context.extension.packageJSON as { version: string }).version;
  log.info(`UnIntelliJ ${version} activated on VS Code ${vscode.version} (${process.platform})`);

  const logIntegrations = (): void => log.info(`Integrations:\n${formatIntegrations(detectIntegrations())}`);
  logIntegrations();
  context.subscriptions.push(vscode.extensions.onDidChange(logIntegrations));

  return { integrations: detectIntegrations };
}

export function deactivate(): void {
  // Nothing to clean up yet: everything is registered through context.subscriptions.
}
