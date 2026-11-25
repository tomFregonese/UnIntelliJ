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
  /** Before 0.4: comma-separated schemas shown for `database`; moved to `schemaFilter` by `normalizeSource`. */
  schemas?: string;
  /** Databases shown in the tree (IntelliJ's "N of M"); missing or empty: the connection database only. */
  databases?: string[];
  /** Schemas shown, per database; a database without an entry shows every non-system schema. */
  schemaFilter?: Record<string, string[]>;
}

export function newDataSource(id: string, existingNames: readonly string[]): DataSource {
  let name = 'postgres@localhost';
  for (let i = 1; existingNames.includes(name); i++) {
    name = `postgres@localhost (${i})`;
  }
  return { id, name, host: 'localhost', port: 5432, database: 'postgres', user: 'postgres', ssl: 'prefer', readOnly: false, color: 'none' };
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

/** Moves the pre-0.4 `schemas` text into `schemaFilter` (stored sources are normalized when read). */
export function normalizeSource(source: DataSource): DataSource {
  const legacy = (source.schemas ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const rest = { ...source };
  delete rest.schemas;
  if (legacy.length === 0 || rest.schemaFilter?.[source.database]) {
    return rest;
  }
  return { ...rest, schemaFilter: { ...rest.schemaFilter, [source.database]: legacy } };
}

/** Databases shown under the source in the tree. */
export function shownDatabases(source: DataSource): string[] {
  return source.databases && source.databases.length > 0 ? source.databases : [source.database];
}

/** Schemas shown for `database` (default: the source's): undefined when every schema is shown. */
export function visibleSchemas(source: DataSource, database = source.database): string[] | undefined {
  const names = source.schemaFilter?.[database];
  return names && names.length > 0 ? names : undefined;
}

/** The same source, connected to another database of the server (sessions are per source and database). */
export function inDatabase(source: DataSource, database: string): DataSource {
  return database === source.database ? source : { ...source, database };
}

/** Key of the session of a source on its database. */
export function sessionKey(source: DataSource): string {
  return `${source.id}/${source.database}`;
}

/** New `databases` value after choosing `chosen` (undefined when it is the default: the connection database only). */
export function withDatabases(source: DataSource, chosen: readonly string[]): DataSource {
  const only = chosen.length === 0 || (chosen.length === 1 && chosen[0] === source.database);
  const rest = { ...source };
  delete rest.databases;
  return only ? rest : { ...rest, databases: [...chosen] };
}

/** New `schemaFilter` after choosing `chosen` among `all` schemas of `database` (everything chosen: no filter). */
export function withSchemas(source: DataSource, database: string, chosen: readonly string[], all: readonly string[]): DataSource {
  const filter = { ...source.schemaFilter };
  if (chosen.length === 0 || all.every((s) => chosen.includes(s))) {
    delete filter[database];
  } else {
    filter[database] = [...chosen];
  }
  const rest = { ...source };
  delete rest.schemaFilter;
  return Object.keys(filter).length > 0 ? { ...rest, schemaFilter: filter } : rest;
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
