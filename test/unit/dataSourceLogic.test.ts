import { describe, expect, it } from 'vitest';
import { DataSource, inDatabase, normalizeSource, sessionKey, shownDatabases, visibleSchemas, withDatabases, withSchemas } from '../../src/database/dataSourceLogic';

const source: DataSource = { id: 'ds1', name: 'local', host: 'localhost', port: 5432, database: 'postgres', user: 'postgres', ssl: 'prefer', readOnly: false, color: 'none' };

describe('databases and schemas shown (IntelliJ "N of M")', () => {
  it('shows the connection database only by default, every schema', () => {
    expect(shownDatabases(source)).toEqual(['postgres']);
    expect(visibleSchemas(source)).toBeUndefined();
  });

  it('keeps the chosen databases, back to the default when only the connection database is left', () => {
    const chosen = withDatabases(source, ['app', 'postgres']);
    expect(shownDatabases(chosen)).toEqual(['app', 'postgres']);
    expect(withDatabases(chosen, ['postgres']).databases).toBeUndefined();
  });

  it('filters schemas per database, no filter when every schema is checked', () => {
    const filtered = withSchemas(source, 'app', ['sales'], ['public', 'sales']);
    expect(visibleSchemas(filtered, 'app')).toEqual(['sales']);
    expect(visibleSchemas(filtered, 'postgres')).toBeUndefined();
    expect(visibleSchemas(inDatabase(filtered, 'app'))).toEqual(['sales']);
    expect(withSchemas(filtered, 'app', ['public', 'sales'], ['public', 'sales']).schemaFilter).toBeUndefined();
  });

  it('moves the former comma-separated schema list to the connection database', () => {
    const migrated = normalizeSource({ ...source, schemas: 'public, sales' });
    expect(migrated.schemas).toBeUndefined();
    expect(visibleSchemas(migrated)).toEqual(['public', 'sales']);
  });

  it('opens one session per database of the source', () => {
    expect(sessionKey(source)).toBe('ds1/postgres');
    expect(sessionKey(inDatabase(source, 'app'))).toBe('ds1/app');
    expect(inDatabase(source, 'postgres')).toBe(source);
  });
});
