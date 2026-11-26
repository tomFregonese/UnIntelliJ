import { describe, expect, it } from 'vitest';
import { listRefsSkippingBroken, localNameForRemote, parseCommits, parseRefs, trackingLabel, validateBranchName } from '../../src/vcs/branchesLogic';

const row = (...fields: string[]) => fields.join('\0');

describe('parseRefs', () => {
  it('parses local and remote branches with tracking info', () => {
    const output = [
      row('refs/heads/main', 'main', 'origin/main', 'ahead 2, behind 1', '1700000000'),
      row('refs/heads/feature/x', 'feature/x', '', '', '1700000100'),
      row('refs/remotes/origin/HEAD', 'origin', '', '', '1700000000'),
      row('refs/remotes/origin/main', 'origin/main', '', '', '1699999999'),
      '',
    ].join('\n');
    expect(parseRefs(output)).toEqual([
      { name: 'main', remote: false, upstream: 'origin/main', ahead: 2, behind: 1, date: 1700000000 },
      { name: 'feature/x', remote: false, ahead: 0, behind: 0, date: 1700000100 },
      { name: 'origin/main', remote: true, remoteName: 'origin', ahead: 0, behind: 0, date: 1699999999 },
    ]);
  });
});

describe('helpers', () => {
  it('derive the local name of a remote branch', () => {
    expect(localNameForRemote('origin/feature/x')).toBe('feature/x');
  });

  it('format ahead/behind like IntelliJ', () => {
    expect(trackingLabel({ name: 'm', remote: false, ahead: 2, behind: 1, date: 0 })).toBe('↑2 ↓1');
    expect(trackingLabel({ name: 'm', remote: false, ahead: 0, behind: 0, date: 0 })).toBe('');
  });

  it('validate branch names', () => {
    expect(validateBranchName('feature/JIRA-12-login')).toBeUndefined();
    for (const bad of ['', 'has space', 'a..b', 'end/', '-dash', 'x.lock', 'a~b', 'a//b']) {
      expect(validateBranchName(bad), bad).toBeDefined();
    }
  });

  it('parse commits', () => {
    expect(parseCommits(`${row('abc', 'Fix login', 'Tom', '2 hours ago')}\n`)).toEqual([{ hash: 'abc', subject: 'Fix login', author: 'Tom', relativeDate: '2 hours ago' }]);
  });
});

describe('listRefsSkippingBroken', () => {
  const refs = Array.from({ length: 7 }, (_, i) => `refs/remotes/origin/b${i}`);
  const broken = new Set(['refs/remotes/origin/b2', 'refs/remotes/origin/b5']);
  const run = async (part: readonly string[]) => {
    const bad = part.find((r) => broken.has(r));
    if (bad) {
      throw new Error(`fatal: missing object 0123 for ${bad}`);
    }
    return part.map((r) => `${r}\n`).join('');
  };

  it('lists every ref but the ones pointing to missing objects', async () => {
    const { output, skipped } = await listRefsSkippingBroken(refs, run, 4);
    expect(output.split('\n').filter(Boolean)).toEqual(refs.filter((r) => !broken.has(r)));
    expect(skipped.sort()).toEqual([...broken].sort());
  });

  it('does not rely on the message, which Git sometimes garbles', async () => {
    const garbled = async (part: readonly string[]) => {
      if (part.some((r) => broken.has(r))) {
        throw new Error('fatal: \u0002H');
      }
      return part.map((r) => `${r}\n`).join('');
    };
    expect((await listRefsSkippingBroken(refs, garbled)).skipped.sort()).toEqual([...broken].sort());
  });

  it('throws when no ref can be listed', async () => {
    await expect(listRefsSkippingBroken(refs, () => Promise.reject(new Error('fatal: not a git repository')))).rejects.toThrow('not a git repository');
  });
});
