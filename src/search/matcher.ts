/**
 * IntelliJ-style name matching for Search Everywhere. Pure: no `vscode` import.
 *
 * - Characters must appear in order (`usrsvc` matches `UserService`).
 * - Upper-case pattern letters and letters after separators anchor on word starts ("camel humps":
 *   `USvc` matches `UserService`, `u-c` matches `user-card.component.ts`).
 * - A space stands for a separator: the next letter starts a word (`historique component` matches
 *   `historique.component.ts`, IntelliJ).
 * - Exact, prefix and contiguous matches rank higher; shorter names rank higher on ties.
 * - `dir/name` patterns also match the parent path; a trailing `:line[:column]` is a position.
 */

export interface Match {
  score: number;
  /** Matched character indices in the candidate. */
  positions: number[];
}

export interface ParsedQuery {
  /** Name part, lower-cased for matching is done internally. */
  name: string;
  /** Directory part of `dir/name` queries, without trailing slash. */
  path?: string;
  line?: number;
  column?: number;
}

const SEPARATORS = new Set(['/', '\\', '.', '_', '-', ' ', '$', ':', '@']);

function isWordStart(text: string, index: number): boolean {
  if (index === 0) {
    return true;
  }
  const prev = text[index - 1];
  const current = text[index];
  if (SEPARATORS.has(prev)) {
    return true;
  }
  const isUpper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();
  const isDigit = (c: string) => c >= '0' && c <= '9';
  return (isUpper(current) && !isUpper(prev)) || (isDigit(current) && !isDigit(prev));
}

export function parseQuery(raw: string): ParsedQuery {
  let text = raw.trim();
  let line: number | undefined;
  let column: number | undefined;
  const position = /:(\d+)(?::(\d+))?$/.exec(text);
  if (position) {
    line = Number(position[1]);
    column = position[2] ? Number(position[2]) : undefined;
    text = text.slice(0, position.index);
  }
  text = text.replace(/\\/g, '/');
  const slash = text.lastIndexOf('/');
  const name = slash >= 0 ? text.slice(slash + 1) : text;
  const path = slash > 0 ? text.slice(0, slash) : undefined;
  return { name, ...(path && { path }), ...(line !== undefined && { line }), ...(column !== undefined && { column }) };
}

/**
 * Matches `pattern` against `candidate`, or returns undefined.
 * Upper-case letters in the pattern must land on word starts; lower-case letters may match anywhere.
 */
export function matchName(typed: string, candidate: string): Match | undefined {
  // `a b` → `aB`: the letter after a space must start a word.
  const pattern = typed.trim().replace(/\s+(\S)/g, (_, c: string) => c.toUpperCase());
  if (pattern.length === 0) {
    return { score: 0, positions: [] };
  }
  if (pattern.length > candidate.length) {
    return undefined;
  }
  const lowerPattern = pattern.toLowerCase();
  const lowerCandidate = candidate.toLowerCase();

  // Fast paths: exact and prefix matches.
  if (lowerCandidate === lowerPattern) {
    return { score: 10_000 - candidate.length, positions: range(0, pattern.length) };
  }
  const prefixStart = lowerCandidate.startsWith(lowerPattern) ? 0 : -1;

  const positions = greedyMatch(pattern, candidate, lowerPattern, lowerCandidate);
  if (!positions) {
    return undefined;
  }

  let score = 0;
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    if (isWordStart(candidate, pos)) {
      score += 30;
    }
    if (i > 0 && positions[i - 1] === pos - 1) {
      score += 25;
    }
    if (candidate[pos] === pattern[i]) {
      score += 1;
    }
  }
  score -= positions[0] * 2; // earlier is better
  score -= 2 * (positions[positions.length - 1] - positions[0] - (positions.length - 1)); // compact is better
  if (prefixStart === 0) {
    score += 500;
  }
  score -= candidate.length;
  return { score, positions };
}

/**
 * Finds positions for every pattern character, preferring word starts. Upper-case pattern
 * characters must match a word start.
 */
function greedyMatch(pattern: string, candidate: string, lowerPattern: string, lowerCandidate: string): number[] | undefined {
  const positions: number[] = [];
  let from = 0;
  for (let i = 0; i < pattern.length; i++) {
    const char = lowerPattern[i];
    const mustBeWordStart = pattern[i] !== char && i > 0;
    const previous = positions[i - 1];
    let found = -1;
    // Prefer continuing the current run, then the next word start, then any occurrence.
    if (previous !== undefined && !mustBeWordStart && lowerCandidate[previous + 1] === char) {
      found = previous + 1;
    } else {
      for (let j = from; j < lowerCandidate.length; j++) {
        if (lowerCandidate[j] === char && isWordStart(candidate, j)) {
          found = j;
          break;
        }
      }
      if (found < 0 && !mustBeWordStart) {
        found = lowerCandidate.indexOf(char, from);
      }
    }
    if (found < 0) {
      return undefined;
    }
    positions.push(found);
    from = found + 1;
  }
  return positions;
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => start + i);
}

/**
 * Matches a file query against a file name and its workspace-relative directory.
 * `dir/name` queries require every directory fragment to appear in order in the directory.
 */
export function matchFile(query: ParsedQuery, fileName: string, relativeDir: string): Match | undefined {
  const nameMatch = matchName(query.name, fileName);
  if (!nameMatch) {
    return undefined;
  }
  if (!query.path) {
    return nameMatch;
  }
  const dir = `/${relativeDir.replace(/\\/g, '/').toLowerCase()}/`;
  let from = 0;
  for (const fragment of query.path.toLowerCase().split('/').filter(Boolean)) {
    const index = dir.indexOf(fragment, from);
    if (index < 0) {
      return undefined;
    }
    from = index + fragment.length;
  }
  return { score: nameMatch.score + 50, positions: nameMatch.positions };
}

/** Sorts by descending score, then shorter text, then alphabetically. Stable for equal keys. */
export function rank<T>(items: readonly T[], score: (item: T) => number | undefined, text: (item: T) => string, limit = Infinity): T[] {
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const s = score(item);
    if (s !== undefined) {
      scored.push({ item, score: s });
    }
  }
  scored.sort((a, b) => b.score - a.score || text(a.item).length - text(b.item).length || text(a.item).localeCompare(text(b.item)));
  return scored.slice(0, limit).map((s) => s.item);
}
