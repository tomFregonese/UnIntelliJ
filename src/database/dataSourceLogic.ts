/**
 * PostgreSQL data sources, as in IntelliJ's "Data Sources and Drivers" dialog. Pure: no `vscode`
 * import. Passwords are never part of these objects: they live in VS Code's SecretStorage.
 */

export type SslMode = 'disable' | 'prefer' | 'require' | 'verify-full';
export const SSL_MODES: readonly SslMode[] = ['disable', 'prefer', 'require', 'verify-full'];

/** IntelliJ's data source colors (none, then its palette). */
export const SOURCE_COLORS = ['none', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray'] as const;
export type SourceColor = (typeof SOURCE_COLORS)[number];

/** Background tint of the editor and tree badge for each color (IntelliJ's "file colors"). */
export const COLOR_VALUES: Record<Exclude<SourceColor, 'none'>, string> = {
  red: '#E4656E',
  orange: '#E18C71',
  yellow: '#D59637',
  green: '#4E9D6C',
  blue: '#3871E1',
  violet: '#8B6FE3',
  gray: '#8B8E94',
};

export interface DataSource {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  ssl: SslMode;
  readOnly: boolean;
  color: SourceColor;
  /** Comma-separated schema names shown in the tree; empty: all non-system schemas. */
  schemas: string;
}

export function newDataSource(id: string, existingNames: readonly string[]): DataSource {
  let name = 'postgres@localhost';
  for (let i = 1; existingNames.includes(name); i++) {
    name = `postgres@localhost (${i})`;
  }
  return { id, name, host: 'localhost', port: 5432, database: 'postgres', user: 'postgres', ssl: 'prefer', readOnly: false, color: 'none', schemas: '' };
}

/** Problems that prevent saving, as English texts (translated by the caller). */
export function validateDataSource(source: DataSource): string[] {
  const problems: string[] = [];
  if (!source.name.trim()) {
    problems.push('Name is required');
  }
  if (!source.host.trim()) {
    problems.push('Host is required');
  }
  if (!Number.isInteger(source.port) || source.port < 1 || source.port > 65535) {
    problems.push('Port must be between 1 and 65535');
  }
  if (!source.database.trim()) {
    problems.push('Database is required');
  }
  if (!source.user.trim()) {
    problems.push('User is required');
  }
  return problems;
}

/** `postgresql://user@host:port/db`, shown next to the name like IntelliJ. */
export function describeSource(source: DataSource): string {
  return `${source.user}@${source.host}:${source.port}/${source.database}`;
}

/** Schema filter of a source: undefined when every schema is shown. */
export function visibleSchemas(source: DataSource): string[] | undefined {
  const names = source.schemas
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return names.length > 0 ? names : undefined;
}

/** node-postgres `ssl` option for a mode. */
export function sslOption(mode: SslMode): false | { rejectUnauthorized: boolean } {
  switch (mode) {
    case 'disable':
      return false;
    case 'verify-full':
      return { rejectUnauthorized: true };
    default:
      // prefer / require: encrypted without certificate verification (libpq semantics).
      return { rejectUnauthorized: false };
  }
}
