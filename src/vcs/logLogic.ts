/** Git log parsing and commit graph layout for the Git tool window. Pure: no `vscode` import. */
import type { LogFilters } from './gitLogProtocol';

export interface LogCommit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  /** Unix seconds. */
  date: number;
  /** Decorations: `HEAD -> main, origin/main, tag: v1`. */
  refs: string[];
  subject: string;
}

export const LOG_FORMAT = '%H%x00%P%x00%an%x00%ae%x00%at%x00%D%x00%s%x1e';

export function parseLog(output: string): LogCommit[] {
  return output
    .split('\x1e')
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.includes('\0'))
    .map((record) => {
      const [hash, parents, author, email, date, refs, ...subject] = record.split('\0');
      return {
        hash,
        parents: parents ? parents.split(' ') : [],
        author,
        email,
        date: Number(date),
        refs: refs ? refs.split(', ').map((r) => r.trim()).filter(Boolean) : [],
        subject: subject.join('\0'),
      };
    });
}

export interface Edge {
  /** Lane at the top of the row (this commit's row). */
  from: number;
  /** Lane at the bottom of the row (towards the next row). */
  to: number;
  color: number;
}

export interface GraphRow {
  /** Lane of the commit dot. */
  lane: number;
  color: number;
  /** Lines entering the row from above, ending at their lane in this row. */
  incoming: Edge[];
  /** Lines leaving the row downwards. */
  outgoing: Edge[];
  /** Number of lanes used by this row (for width). */
  width: number;
}

interface Lane {
  hash: string;
  color: number;
}

/**
 * Lays out commits (newest first, topological/date order as given by `git log`) on lanes, like
 * IntelliJ's log graph: first parents continue the commit's lane, merge parents get lanes of
 * their own, lanes waiting for the same commit converge on it.
 */
export function layoutGraph(commits: readonly LogCommit[]): GraphRow[] {
  let lanes: (Lane | undefined)[] = [];
  let nextColor = 0;
  const rows: GraphRow[] = [];

  for (const commit of commits) {
    // Every lane waiting for this commit converges on its dot.
    const waiting = lanes.flatMap((lane, index) => (lane?.hash === commit.hash ? [index] : []));
    let lane = waiting.length > 0 ? waiting[0] : lanes.findIndex((l) => l === undefined);
    if (lane < 0) {
      lane = lanes.length;
    }
    const color = waiting.length > 0 ? lanes[waiting[0]]!.color : nextColor++;
    const incoming: Edge[] = lanes.flatMap((l, index) => (l ? [{ from: index, to: waiting.includes(index) ? lane : index, color: l.color }] : []));

    const next = [...lanes];
    for (const index of waiting) {
      next[index] = undefined;
    }
    // First parent continues this lane; other parents reuse a lane already waiting for them or get a new one.
    const parentLanes: number[] = [];
    commit.parents.forEach((parent, i) => {
      if (i === 0) {
        // The first parent always continues straight down, even if another lane already waits for
        // it: duplicate lanes converge on the parent's row, which keeps the main line straight.
        next[lane] = { hash: parent, color };
        parentLanes.push(lane);
        return;
      }
      const existing = next.findIndex((l) => l?.hash === parent);
      if (existing >= 0) {
        parentLanes.push(existing);
        return;
      }
      let free = next.findIndex((l, index) => l === undefined && index !== lane);
      if (free < 0) {
        free = next.length;
      }
      next[free] = { hash: parent, color: nextColor++ };
      parentLanes.push(free);
    });

    const outgoing: Edge[] = [];
    next.forEach((l, index) => {
      if (!l) {
        return;
      }
      if (parentLanes.includes(index)) {
        outgoing.push({ from: lane, to: index, color: l.color });
      } else {
        outgoing.push({ from: index, to: index, color: l.color });
      }
    });

    while (next.length > 0 && next[next.length - 1] === undefined) {
      next.pop();
    }
    const width = Math.max(lane + 1, lanes.length, next.length);
    rows.push({ lane, color, incoming, outgoing, width });
    lanes = next;
  }
  return rows;
}

export interface ChangedFile {
  status: string;
  path: string;
  /** Previous path for renames and copies. */
  oldPath?: string;
}

/** Parses `git show --name-status --format=` output. */
export function parseNameStatus(output: string): ChangedFile[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, first, second] = line.split('\t');
      return second ? { status: status[0], path: second, oldPath: first } : { status: status[0], path: first };
    });
}

/** Arguments of `git log` for the given filters . */
export function logArgs(filters: LogFilters, limit: number): string[] {
  const args = ['log', `--format=${LOG_FORMAT}`, '--date-order', `-n${limit}`];
  if (filters.branch === 'all') {
    args.push('--all');
  } else {
    args.push(filters.branch);
  }
  if (filters.author !== 'all') {
    args.push(`--author=${filters.author}`);
  }
  if (filters.since !== 'all') {
    args.push(`--since=${Number(filters.since)}.days.ago`);
  }
  if (filters.text.trim()) {
    args.push('--regexp-ignore-case', '--fixed-strings', `--grep=${filters.text.trim()}`);
  }
  args.push('--');
  if (filters.path) {
    args.push(filters.path);
  }
  return args;
}
