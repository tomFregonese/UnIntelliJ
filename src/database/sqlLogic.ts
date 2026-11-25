/**
 * SQL text handling for PostgreSQL scripts: statements, the statement at the caret, dangerous
 * statements, CSV. Pure: no `vscode` import. Offsets are string indexes.
 */

export interface Statement {
  text: string;
  /** Offset of the first non-blank character. */
  start: number;
  /** Offset just after the statement (before its `;`). */
  end: number;
}

/**
 * Splits a script on `;`, ignoring those in quotes ('…', "…"), comments (-- and nested /* *\/) and
 * dollar-quoted bodies ($$…$$, $tag$…$tag$). Empty statements are dropped.
 */
export function splitStatements(sql: string): Statement[] {
  const statements: Statement[] = [];
  let begin = 0;
  let i = 0;
  const push = (end: number): void => {
    const raw = sql.slice(begin, end);
    // Leading comments belong to the statement but its ▶ and position start at the code.
    const lead = raw.length - raw.replace(/^(?:\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, '').length;
    const text = raw.slice(lead).trim();
    if (text) {
      statements.push({ text, start: begin + lead, end: begin + lead + text.length });
    }
  };
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      i = skipQuoted(sql, i, c);
    } else if (c === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl < 0 ? sql.length : nl + 1;
    } else if (c === '/' && sql[i + 1] === '*') {
      i = skipBlockComment(sql, i);
    } else if (c === '$') {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length);
        i = close < 0 ? sql.length : close + tag[0].length;
      } else {
        i++;
      }
    } else if (c === ';') {
      push(i);
      begin = i + 1;
      i++;
    } else {
      i++;
    }
  }
  push(sql.length);
  return statements;
}

function skipQuoted(sql: string, i: number, quote: string): number {
  let j = i + 1;
  while (j < sql.length) {
    if (sql[j] === quote) {
      if (sql[j + 1] === quote) {
        j += 2; // doubled quote
        continue;
      }
      return j + 1;
    }
    j++;
  }
  return sql.length;
}

function skipBlockComment(sql: string, i: number): number {
  let depth = 0;
  let j = i;
  while (j < sql.length) {
    if (sql[j] === '/' && sql[j + 1] === '*') {
      depth++;
      j += 2;
    } else if (sql[j] === '*' && sql[j + 1] === '/') {
      depth--;
      j += 2;
      if (depth === 0) {
        return j;
      }
    } else {
      j++;
    }
  }
  return sql.length;
}

/** Statement containing `offset`, else the closest one before it on the same or previous lines (IntelliJ). */
export function statementAt(sql: string, offset: number): Statement | undefined {
  const statements = splitStatements(sql);
  const inside = statements.find((s) => offset >= s.start && offset <= s.end + 1);
  if (inside) {
    return inside;
  }
  return [...statements].reverse().find((s) => s.end <= offset) ?? statements[0];
}

/** Text without comments and string contents, upper-cased: for keyword checks. */
function keywords(text: string): string {
  return text
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$/g, ' ')
    .toUpperCase();
}

/** UPDATE or DELETE without WHERE: IntelliJ asks before running them. */
export function isUnsafeModification(statement: string): boolean {
  const k = keywords(statement).trim();
  if (!/^(WITH\b[\s\S]*?\)\s*)?(UPDATE|DELETE)\b/.test(k)) {
    return false;
  }
  return !/\bWHERE\b/.test(k.replace(/^WITH\b[\s\S]*?\)\s*(?=UPDATE|DELETE)/, ''));
}

/** Statements that change data or schema, refused on read-only data sources. */
export function isModification(statement: string): boolean {
  return /^(WITH\b[\s\S]*?\)\s*)?(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT|VACUUM|REINDEX|CLUSTER|COPY)\b/.test(keywords(statement).trim());
}

/** Display text of a value returned by node-postgres. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (value instanceof Date) {
    return value.toISOString().replace('T', ' ').replace(/\.000Z$|Z$/, '');
  }
  if (Buffer.isBuffer(value)) {
    return `\\x${value.toString('hex')}`;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/** RFC 4180 CSV with a header line. */
export function toCsv(columns: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const cell = (v: unknown): string => {
    const text = v === null || v === undefined ? '' : formatValue(v);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n';
}

/** Quotes an identifier when needed (`public`, `"MyTable"`). */
export function quoteIdent(name: string): string {
  return /^[a-z_][a-z0-9_$]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}
