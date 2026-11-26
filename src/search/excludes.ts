import * as vscode from 'vscode';
import { getSetting } from '../config/settings';

/** Folders IntelliJ shows as "excluded" and never indexes, even with "Include non-project items". */
const ALWAYS_EXCLUDED = ['**/.git/**'];

/**
 * Build output and dependencies, which IntelliJ marks as excluded or library folders: shown only
 * with "Include non-project items" (otherwise `Montant.class` comes up next to `Montant.java`).
 */
export const NON_PROJECT_GLOBS = ['**/*.class', '**/*.jar', '**/*.war', '**/*.ear', '**/target/**', '**/build/**', '**/out/**', '**/dist/**', '**/node_modules/**', '**/.gradle/**', '**/.angular/**'];

/**
 * Glob patterns excluded from Search Everywhere: `files.exclude`, `search.exclude` and
 * `unintellij.searchEverywhere.excludePatterns` and build output; only `.git` when non-project items are included.
 */
export function excludedGlobs(includeNonProjectItems: boolean): string[] {
  if (includeNonProjectItems) {
    return ALWAYS_EXCLUDED;
  }
  const enabled = (section: string): string[] =>
    Object.entries(vscode.workspace.getConfiguration(section).get<Record<string, unknown>>('exclude') ?? {})
      .filter(([, value]) => value === true)
      .map(([glob]) => glob);
  return [...new Set([...ALWAYS_EXCLUDED, ...NON_PROJECT_GLOBS, ...enabled('files'), ...enabled('search'), ...getSetting('searchEverywhere.excludePatterns')])];
}

export function toExcludeGlob(globs: readonly string[]): string | undefined {
  return globs.length === 0 ? undefined : globs.length === 1 ? globs[0] : `{${globs.join(',')}}`;
}
