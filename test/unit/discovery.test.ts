import { describe, expect, it } from 'vitest';
import { detectJsRunner, javaRunnables, jsTestCommand, jsTests, mavenTestCommand, packageScripts } from '../../src/testing/discovery';

describe('gutter discovery', () => {
  it('finds package.json scripts with their lines', () => {
    const text = '{\n  "name": "x",\n  "scripts": {\n    "start": "ng serve",\n    "test": "ng test"\n  },\n  "config": { "start": 1 }\n}';
    expect(packageScripts(text)).toEqual([
      { name: 'start', line: 3 },
      { name: 'test', line: 4 },
    ]);
  });

  it('finds Java test methods, the class and main', () => {
    const text = [
      'package com.acme;',
      '',
      'import org.junit.jupiter.api.Test;',
      '',
      '/** class Fake in a comment */',
      'class UserServiceTest {',
      '  @Test',
      '  void findsUser() {',
      '    String s = "void fake() {";',
      '  }',
      '',
      '  @ParameterizedTest',
      '  @ValueSource(ints = {1})',
      '  public void checks(int i) {}',
      '',
      '  private void helper() {}',
      '  public static void main(String[] args) {}',
      '}',
    ].join('\n');
    const result = javaRunnables(text)!;
    expect(result.className).toBe('com.acme.UserServiceTest');
    expect(result.classLine).toBe(5);
    expect(result.tests).toEqual([
      { name: 'findsUser', line: 7 },
      { name: 'checks', line: 13 },
    ]);
    expect(result.mainLine).toBe(16);
  });

  it('marks @SpringBootApplication classes as runnable', () => {
    const result = javaRunnables('package a;\n@SpringBootApplication\npublic class App {\n}\n')!;
    expect(result.mainLine).toBe(2);
  });

  it('nests describe / it blocks', () => {
    const text = "describe('UserService', () => {\n  beforeEach(() => {});\n  it('finds a user', () => {\n    expect(1).toBe(1);\n  });\n  describe(\"errors\", () => {\n    it('throws', async () => {});\n  });\n});\ntest('top', () => {});\n";
    const tree = jsTests(text);
    expect(tree.map((n) => [n.label, n.line])).toEqual([
      ['UserService', 0],
      ['top', 9],
    ]);
    expect(tree[0].children.map((n) => n.id)).toEqual(['UserService finds a user', 'UserService errors']);
    expect(tree[0].children[1].children[0].path).toEqual(['UserService', 'errors', 'throws']);
  });

  it('builds runner commands', () => {
    expect(detectJsRunner({ devDependencies: { vitest: '1' } })).toBe('vitest');
    expect(detectJsRunner({ devDependencies: { karma: '6' } })).toBe('karma');
    expect(jsTestCommand('vitest', 'src/a.spec.ts', ['A', 'b.c'])).toBe('npx vitest run "src/a.spec.ts" -t "^A > b\\\\.c"');
    expect(jsTestCommand('jest', 'src/a.spec.ts', ['A', 'b'])).toBe('npx jest "src/a.spec.ts" -t "^A b"');
    expect(jsTestCommand('karma', 'src/a.spec.ts', ['A'])).toBe('npx ng test --watch=false --include "src/a.spec.ts"');
    expect(mavenTestCommand(true, false, 'com.acme.T', 'm')).toBe('./mvnw -q test -Dtest=com.acme.T#m -Dsurefire.failIfNoSpecifiedTests=false');
  });
});
