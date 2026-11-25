/** Branch listing for the IntelliJ branches popup. Pure: no `vscode` import. */

export interface BranchInfo {
  /** Short name: `main`, `origin/main`. */
  name: string;
  remote: boolean;
  /** Remote name for remote branches. */
  remoteName?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  /** Unix seconds of the last commit, for "Recent". */
  date: number;
}

/** Format for `git for-each-ref`, fields separated by NUL. */
export const REF_FORMAT = '%(refname)%00%(refname:short)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(committerdate:unix)';

export function parseRefs(output: string): BranchInfo[] {
  const branches: BranchInfo[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const [refname, short, upstream, track, date] = line.split('\0');
    const remote = refname.startsWith('refs/remotes/');
    if (remote && refname.endsWith('/HEAD')) {
      continue;
    }
    const ahead = Number(/ahead (\d+)/.exec(track ?? '')?.[1] ?? 0);
    const behind = Number(/behind (\d+)/.exec(track ?? '')?.[1] ?? 0);
    branches.push({
      name: short,
      remote,
      ...(remote && { remoteName: refname.split('/')[2] }),
      ...(upstream && { upstream }),
      ahead,
      behind,
      date: Number(date) || 0,
    });
  }
  return branches;
}

/** Local name to create when checking out a remote branch: `origin/feature/x` → `feature/x`. */
export function localNameForRemote(remoteBranch: string): string {
  const slash = remoteBranch.indexOf('/');
  return slash >= 0 ? remoteBranch.slice(slash + 1) : remoteBranch;
}

/** `↑2 ↓1` like IntelliJ's incoming/outgoing indicators. */
export function trackingLabel(branch: BranchInfo): string {
  return [branch.ahead > 0 ? `↑${branch.ahead}` : '', branch.behind > 0 ? `↓${branch.behind}` : ''].filter(Boolean).join(' ');
}

/** Git refname check (subset of `git check-ref-format --branch`). */
export function validateBranchName(name: string): string | undefined {
  if (!name.trim()) {
    return 'Branch name is required';
  }
  if (/[\s~^:?*[\\]|\.\.|@\{|\/\/|^[-/.]|[/.]$|\.lock$/.test(name)) {
    return `'${name}' is not a valid branch name`;
  }
  return undefined;
}

export interface CommitInfo {
  hash: string;
  subject: string;
  author: string;
  relativeDate: string;
}

export const COMMIT_FORMAT = '%H%x00%s%x00%an%x00%ar';

export function parseCommits(output: string): CommitInfo[] {
  return output
    .split('\n')
    .filter((l) => l.includes('\0'))
    .map((line) => {
      const [hash, subject, author, relativeDate] = line.split('\0');
      return { hash, subject, author, relativeDate };
    });
}
