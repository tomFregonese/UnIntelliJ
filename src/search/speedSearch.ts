/**
 * IntelliJ's speed search (typing in a tree or a table jumps to the matching item and highlights
 * the matched letters). Pure: no `vscode` import, also used by webviews.
 */
import { matchName } from './matcher';

const SEPARATORS = /[\s_\-.$]/g;

/**
 * Matched character indices of `text` for the typed `query`, or undefined. A contiguous match wins
 * (`truc` in `t_gts_bitrucmuche`), else the letters in order, preferring word starts (`gtsbi`).
 * Case and separators typed are ignored.
 */
export function speedSearchMatch(query: string, text: string): number[] | undefined {
  const q = query.toLowerCase();
  if (q === '') {
    return undefined;
  }
  const at = text.toLowerCase().indexOf(q);
  if (at >= 0) {
    return Array.from({ length: q.length }, (_, i) => at + i);
  }
  const letters = q.replace(SEPARATORS, '');
  return letters === '' ? undefined : matchName(letters, text)?.positions;
}

/** Positions merged into `[start, end)` ranges, for highlighting. */
export function matchRanges(positions: readonly number[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const p of [...positions].sort((a, b) => a - b)) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === p) {
      last[1] = p + 1;
    } else {
      ranges.push([p, p + 1]);
    }
  }
  return ranges;
}

/**
 * Index of the match to select in `items` (visible order): `current` when it still matches, else
 * the first match after it (wrapping), else the first one. -1 when nothing matches.
 */
export function pickMatch(matches: readonly boolean[], current: number): number {
  if (current >= 0 && matches[current]) {
    return current;
  }
  return step(matches, current, 1);
}

/** Next (`direction` 1) or previous (-1) match from `current`, wrapping around. -1 when none. */
export function step(matches: readonly boolean[], current: number, direction: 1 | -1): number {
  const n = matches.length;
  for (let i = 1; i <= n; i++) {
    const index = (((current < 0 ? (direction === 1 ? -1 : 0) : current) + direction * i) % n + n) % n;
    if (matches[index]) {
      return index;
    }
  }
  return -1;
}
