/** Pure editor helpers behind IntelliJ editing actions. No `vscode` import. */

/** IntelliJ "Toggle Case": upper-cases unless the text has no lower-case letter, then lower-cases. */
export function toggleCase(text: string): string {
  return text !== text.toUpperCase() ? text.toUpperCase() : text.toLowerCase();
}

/**
 * IntelliJ "Next/Previous Method": the start line of the nearest method strictly after/before
 * `line`, or undefined when there is none.
 */
export function adjacentMethodLine(methodLines: readonly number[], line: number, direction: 'next' | 'previous'): number | undefined {
  const sorted = [...new Set(methodLines)].sort((a, b) => a - b);
  return direction === 'next' ? sorted.find((l) => l > line) : sorted.reverse().find((l) => l < line);
}
