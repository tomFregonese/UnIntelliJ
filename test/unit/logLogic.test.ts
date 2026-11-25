import { describe, expect, it } from 'vitest';
import { classifyRef } from '../../src/vcs/gitLogProtocol';
import { layoutGraph, logArgs, LogCommit, parseLog, parseNameStatus } from '../../src/vcs/logLogic';

const commit = (hash: string, parents: string[] = []): LogCommit => ({ hash, parents, author: 'a', email: 'e', date: 0, refs: [], subject: hash });

describe('parseLog', () => {
  it('parses records with refs and multiple parents', () => {
    const record = (...fields: string[]) => `${fields.join('\0')}\x1e`;
    const output = `${record('c3', 'c2 c1', 'Tom', 'tom@x', '1700', 'HEAD -> main, origin/main, tag: v1', 'Merge')}\n${record('c1', '', 'Ann', 'ann@x', '1600', '', 'Initial')}\n`;
    expect(parseLog(output)).toEqual([
      { hash: 'c3', parents: ['c2', 'c1'], author: 'Tom', email: 'tom@x', date: 1700, refs: ['HEAD -> main', 'origin/main', 'tag: v1'], subject: 'Merge' },
      { hash: 'c1', parents: [], author: 'Ann', email: 'ann@x', date: 1600, refs: [], subject: 'Initial' },
    ]);
  });
});

describe('layoutGraph', () => {
  it('keeps a linear history on one lane', () => {
    const rows = layoutGraph([commit('c', ['b']), commit('b', ['a']), commit('a')]);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(new Set(rows.map((r) => r.color)).size).toBe(1);
    expect(rows[2].outgoing).toEqual([]);
  });

  it('opens a lane for the second parent of a merge and closes it at the fork', () => {
    // m merges f into main: m -> (b, f), f -> a, b -> a
    const rows = layoutGraph([commit('m', ['b', 'f']), commit('f', ['a']), commit('b', ['a']), commit('a')]);
    expect(rows[0]).toMatchObject({ lane: 0, width: 2 });
    expect(rows[0].outgoing).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 0, to: 1, color: 1 },
    ]);
    expect(rows[1].lane).toBe(1); // f on its own lane
    expect(rows[2].lane).toBe(0); // b back on main lane
    // a: both lanes converge
    expect(rows[3].lane).toBe(0);
    expect(rows[3].incoming).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 1, to: 0, color: 1 },
    ]);
  });

  it('starts new lanes for branch tips listed with --all', () => {
    const rows = layoutGraph([commit('x', ['a']), commit('y', ['a']), commit('a')]);
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 0]);
    expect(rows[1].color).not.toBe(rows[0].color);
  });
});

describe('parseNameStatus', () => {
  it('handles renames', () => {
    expect(parseNameStatus('M\tsrc/a.ts\nR100\told.ts\tnew.ts\n')).toEqual([
      { status: 'M', path: 'src/a.ts' },
      { status: 'R', path: 'new.ts', oldPath: 'old.ts' },
    ]);
  });
});

describe('logArgs', () => {
  const base = { text: '', branch: 'all', author: 'all', since: 'all', path: '' };

  it('shows all branches by default', () => {
    expect(logArgs(base, 10)).toEqual(['log', expect.stringContaining('--format='), '--date-order', '-n10', '--all', '--']);
  });

  it('applies branch, user, date, text and path filters', () => {
    const args = logArgs({ text: 'login', branch: 'main', author: 'Tom', since: '7', path: 'src/a.ts' }, 5);
    expect(args).toEqual(expect.arrayContaining(['main', '--author=Tom', '--since=7.days.ago', '--fixed-strings', '--grep=login']));
    expect(args.slice(-2)).toEqual(['--', 'src/a.ts']);
    expect(args).not.toContain('--all');
  });
});

describe('classifyRef', () => {
  it('classifies decorations with the repository remotes', () => {
    expect(classifyRef('HEAD -> feature/login', ['origin'])).toEqual([{ name: 'feature/login', kind: 'head' }]);
    expect(classifyRef('feature/x', ['origin'])).toEqual([{ name: 'feature/x', kind: 'local' }]);
    expect(classifyRef('origin/main', ['origin'])).toEqual([{ name: 'origin/main', kind: 'remote' }]);
    expect(classifyRef('tag: v1.0', ['origin'])).toEqual([{ name: 'v1.0', kind: 'tag' }]);
    expect(classifyRef('origin/HEAD', ['origin'])).toEqual([]);
  });
});
