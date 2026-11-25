import { describe, expect, it } from 'vitest';
import { isModification, isUnsafeModification, quoteIdent, splitStatements, statementAt, toCsv } from '../../src/database/sqlLogic';

describe('sqlLogic', () => {
  it('splits statements, ignoring ; in strings, comments and dollar quotes', () => {
    const sql = `select ';' as a; -- x; y
/* a; /* nested; */ b; */ select 2;
create function f() returns int as $body$ begin return 1; end; $body$ language plpgsql;
do $$ begin perform 1; end $$;
select "we;ird" from t`;
    const parts = splitStatements(sql).map((s) => s.text);
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe("select ';' as a");
    expect(parts[1]).toMatch(/select 2$/);
    expect(parts[2]).toMatch(/^create function/);
    expect(parts[4]).toBe('select "we;ird" from t');
  });

  it('finds the statement at the caret', () => {
    const sql = 'select 1;\n\nselect 2;\nselect 3';
    expect(statementAt(sql, 3)?.text).toBe('select 1');
    expect(statementAt(sql, sql.indexOf('2'))?.text).toBe('select 2');
    expect(statementAt(sql, sql.length)?.text).toBe('select 3');
    // On the empty line after a statement: that statement, like IntelliJ.
    expect(statementAt(sql, 10)?.text).toBe('select 1');
  });

  it('detects UPDATE / DELETE without WHERE', () => {
    expect(isUnsafeModification('delete from users')).toBe(true);
    expect(isUnsafeModification('UPDATE users SET a = 1')).toBe(true);
    expect(isUnsafeModification("update users set a = 'where' ")).toBe(true);
    expect(isUnsafeModification('delete from users where id = 1')).toBe(false);
    expect(isUnsafeModification('select * from users')).toBe(false);
    expect(isModification('insert into t values (1)')).toBe(true);
    expect(isModification('select 1')).toBe(false);
  });

  it('exports CSV and quotes identifiers', () => {
    expect(toCsv(['a', 'b'], [[1, 'x,y'], [null, 'say "hi"']])).toBe('a,b\r\n1,"x,y"\r\n,"say ""hi"""\r\n');
    expect(quoteIdent('users')).toBe('users');
    expect(quoteIdent('MyTable')).toBe('"MyTable"');
  });
});
