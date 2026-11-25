/**
 * Surgical edits of the user's keybindings.json (JSON with comments): only entries written by
 * UnIntelliJ are added or removed; the user's entries, comments and formatting are left intact.
 * Pure: no `vscode` import.
 */
import { createScanner, Node, parseTree, SyntaxKind } from 'jsonc-parser';

interface Edit {
  offset: number;
  length: number;
  text: string;
}

function applyEdits(text: string, edits: Edit[]): string {
  // Apply from the end so offsets stay valid.
  return [...edits].sort((a, b) => b.offset - a.offset).reduce((t, e) => t.slice(0, e.offset) + e.text + t.slice(e.offset + e.length), text);
}

/** Offsets of the commas separating array elements (comments and strings are skipped by the scanner). */
function commaOffsets(text: string, array: Node): number[] {
  const scanner = createScanner(text.slice(0, array.offset + array.length), false);
  scanner.setPosition(array.offset + 1);
  const commas: number[] = [];
  let depth = 0;
  for (let kind = scanner.scan(); kind !== SyntaxKind.EOF; kind = scanner.scan()) {
    if (kind === SyntaxKind.OpenBraceToken || kind === SyntaxKind.OpenBracketToken) {
      depth++;
    } else if (kind === SyntaxKind.CloseBraceToken || kind === SyntaxKind.CloseBracketToken) {
      depth--;
    } else if (kind === SyntaxKind.CommaToken && depth === 0) {
      commas.push(scanner.getTokenOffset());
    }
  }
  return commas;
}

function value(node: Node): unknown {
  if (node.type === 'object') {
    return Object.fromEntries((node.children ?? []).map((p) => [p.children![0].value as string, value(p.children![1])]));
  }
  if (node.type === 'array') {
    return (node.children ?? []).map(value);
  }
  return node.value;
}

/** Key order independent comparison of keybinding entries. */
function sameEntry(a: unknown, b: unknown): boolean {
  const normalize = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
  return normalize(a) === normalize(b);
}

/** keybindings.json content with `previous` managed entries replaced by `next`. */
export function replaceManagedEntries(text: string, previous: readonly object[], next: readonly object[]): string {
  let content = text.trim() === '' ? '[]\n' : text;
  let tree = parseTree(content);
  if (!tree || tree.type !== 'array') {
    throw new Error('keybindings.json is not a JSON array');
  }

  // 1. Remove stale managed entries with one adjacent comma each.
  const elements = tree.children ?? [];
  const commas = commaOffsets(content, tree);
  const edits: Edit[] = [];
  const usedCommas = new Set<number>();
  elements.forEach((element, index) => {
    if (!previous.some((p) => sameEntry(p, value(element)))) {
      return;
    }
    edits.push({ offset: element.offset, length: element.length, text: '' });
    const after = commas.find((c) => c > element.offset + element.length - 1 && (index === elements.length - 1 || c < elements[index + 1].offset));
    const before = [...commas].reverse().find((c) => c < element.offset);
    const comma = after !== undefined && !usedCommas.has(after) ? after : before;
    if (comma !== undefined && !usedCommas.has(comma)) {
      usedCommas.add(comma);
      edits.push({ offset: comma, length: 1, text: '' });
    }
  });
  content = applyEdits(content, edits);
  // Drop lines left empty by removals.
  content = content.replace(/\n[ \t]*\n(?=[ \t]*(?:\n|\]|\{|\/\/))/g, '\n');

  // 2. Append new entries after the last element.
  if (next.length > 0) {
    tree = parseTree(content)!;
    const last = tree.children?.at(-1);
    const lines = next.map((entry) => `  ${JSON.stringify(entry)}`).join(',\n');
    if (last) {
      // Comma right after the last element, new entries after the rest of its line (keeps a trailing comment there).
      const end = last.offset + last.length;
      const newline = content.indexOf('\n', end);
      const close = tree.offset + tree.length - 1;
      const lineEnd = newline >= 0 && newline < close ? newline : close;
      content = applyEdits(content, [
        { offset: end, length: 0, text: ',' },
        { offset: lineEnd, length: 0, text: `\n${lines}${lineEnd === close ? '\n' : ''}` },
      ]);
    } else {
      content = applyEdits(content, [{ offset: tree.offset + 1, length: 0, text: `\n${lines}\n` }]);
    }
  }
  return content;
}
