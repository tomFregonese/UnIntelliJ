import * as vscode from 'vscode';

/**
 * Third-party extensions UnIntelliJ can take advantage of. None is required:
 * features depending on one must check {@link IntegrationStatus.active} and degrade gracefully.
 */
export const INTEGRATIONS = {
  git: { extensionId: 'vscode.git', name: 'Git (built-in)' },
  java: { extensionId: 'redhat.java', name: 'Language Support for Java by Red Hat' },
  javaDebug: { extensionId: 'vscjava.vscode-java-debug', name: 'Debugger for Java' },
  angular: { extensionId: 'Angular.ng-template', name: 'Angular Language Service' },
} as const;

export type IntegrationId = keyof typeof INTEGRATIONS;

export interface IntegrationStatus {
  id: IntegrationId;
  name: string;
  extensionId: string;
  installed: boolean;
  active: boolean;
  version?: string;
}

export function detectIntegrations(): IntegrationStatus[] {
  return (Object.keys(INTEGRATIONS) as IntegrationId[]).map((id) => {
    const { extensionId, name } = INTEGRATIONS[id];
    const extension = vscode.extensions.getExtension(extensionId);
    return {
      id,
      name,
      extensionId,
      installed: extension !== undefined,
      active: extension?.isActive ?? false,
      version: extension?.packageJSON?.version as string | undefined,
    };
  });
}

export function formatIntegrations(statuses: readonly IntegrationStatus[]): string {
  return statuses
    .map((s) => {
      const state = !s.installed ? 'not installed' : s.active ? 'active' : 'installed (inactive)';
      return `${s.name} [${s.extensionId}${s.version ? `@${s.version}` : ''}]: ${state}`;
    })
    .join('\n');
}
