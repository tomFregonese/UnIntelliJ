import * as vscode from 'vscode';
import { getSetting } from '../config/settings';

/** Folders IntelliJ shows as "excluded" and never indexes, even with "Include non-project items". */
const ALWAYS_EXCLUDED = ['**/.git/**'];

/**
 * Glob patterns excluded from Search Everywhere: `files.exclude`, `search.exclude` and
 * `unintellij.searchEverywhere.excludePatterns`; only `.git` when non-project items are included.
 */
export function excludedGlobs(includeNonProjectItems: boolean): string[] {
  if (includeNonProjectItems) {
    return ALWAYS_EXCLUDED;
  }
  const enabled = (section: string): string[] =>
    Object.entries(vscode.workspace.getConfiguration(section).get<Record<string, unknown>>('exclude') ?? {})
      .filter(([, value]) => value === true)
      .map(([glob]) => glob);
  return [...new Set([...ALWAYS_EXCLUDED, ...enabled('files'), ...enabled('search'), ...getSetting('searchEverywhere.excludePatterns')])];
}

export function toExcludeGlob(globs: readonly string[]): string | undefined {
  return globs.length === 0 ? undefined : globs.length === 1 ? globs[0] : `{${globs.join(',')}}`;
}
