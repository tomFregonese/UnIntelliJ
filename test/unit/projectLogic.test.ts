import { describe, expect, it } from 'vitest';
import { compareEntries, displayPath, folderIcon, groupPackages, rootKind, validateFileName } from '../../src/project/projectLogic';

describe('projectLogic', () => {
  it('recognizes Maven roots and excluded folders', () => {
    expect(rootKind('src/main/java', 'java')).toBe('source');
    expect(rootKind('src/test/java', 'java')).toBe('test');
    expect(rootKind('src/main/resources', 'resources')).toBe('resources');
    expect(rootKind('node_modules', 'node_modules')).toBe('excluded');
    expect(rootKind('src/app', 'app')).toBeUndefined();
    expect(folderIcon('test', false)).toBe('folder_testRoot');
    expect(folderIcon(undefined, true)).toBe('rootFolder');
  });

  it('sorts folders first, then names naturally', () => {
    const entries = [
      { name: 'b.ts', directory: false },
      { name: 'src', directory: true },
      { name: 'a10.ts', directory: false },
      { name: 'a2.ts', directory: false },
    ].sort(compareEntries);
    expect(entries.map((e) => e.name)).toEqual(['src', 'a2.ts', 'a10.ts', 'b.ts']);
  });

  it('groups Java files by package', () => {
    const packages = groupPackages(['com/acme/b/B.java', 'com/acme/A.java', 'Main.java']);
    expect([...packages.keys()]).toEqual(['', 'com.acme', 'com.acme.b']);
    expect(packages.get('com.acme')).toEqual(['com/acme/A.java']);
  });

  it('shows module paths like IntelliJ', () => {
    expect(displayPath('/Users/me/IdeaProjects/app', '/Users/me')).toBe('~/IdeaProjects/app');
    expect(displayPath('C:\\DEV\\app', 'C:\\Users\\me')).toBe('C:/DEV/app');
    expect(validateFileName('')).toBeDefined();
    expect(validateFileName('a/b.ts')).toBeUndefined();
    expect(validateFileName('../x')).toBeDefined();
  });
});
