import { describe, expect, it } from 'vitest';
import { replaceManagedEntries } from '../../src/keymap/keybindingsFile';

describe('replaceManagedEntries', () => {
  const mine = { key: 'ctrl+shift+l', command: 'editor.action.formatDocument' };

  it('creates the content of an empty or missing file', () => {
    expect(JSON.parse(replaceManagedEntries('', [], [mine]))).toEqual([mine]);
    expect(JSON.parse(replaceManagedEntries('[]', [], [mine]))).toEqual([mine]);
  });

  it("keeps the user's entries, comments and formatting, replaces only managed ones", () => {
    const text = [
      '// my keybindings',
      '[',
      '  { "key": "f5", "command": "workbench.action.debug.start" }, // keep',
      '  { "key": "ctrl+shift+l", "command": "editor.action.formatDocument" }',
      ']',
      '',
    ].join('\n');
    const updated = replaceManagedEntries(text, [mine], [{ key: 'f1', command: 'x' }]);
    expect(updated).toBe(
      ['// my keybindings', '[', '  { "key": "f5", "command": "workbench.action.debug.start" }, // keep', '  {"key":"f1","command":"x"}', ']', ''].join('\n'),
    );
    // Structural checks (exact whitespace is not important, content is).
    expect(updated).toContain('// my keybindings');
    expect(updated).toContain('// keep');
    expect(updated).toContain('{ "key": "f5", "command": "workbench.action.debug.start" }');
    expect(updated).not.toContain('ctrl+shift+l');
    const parsed = JSON.parse(updated.replace(/\/\/.*$/gm, ''));
    expect(parsed).toEqual([{ key: 'f5', command: 'workbench.action.debug.start' }, { key: 'f1', command: 'x' }]);
  });

  it('removes a managed entry in the middle with its comma', () => {
    const text = '[\n  {"key":"a","command":"1"},\n  {"key":"ctrl+shift+l","command":"editor.action.formatDocument"},\n  {"key":"b","command":"2"}\n]\n';
    const updated = replaceManagedEntries(text, [mine], []);
    expect(JSON.parse(updated)).toEqual([{ key: 'a', command: '1' }, { key: 'b', command: '2' }]);
  });

  it('matches entries regardless of key order and removes them all on reset', () => {
    const text = replaceManagedEntries('[]', [], [mine, { key: 'f1', command: 'x', when: 'editorFocus' }]);
    const reset = replaceManagedEntries(text, [{ command: 'editor.action.formatDocument', key: 'ctrl+shift+l' }, { when: 'editorFocus', command: 'x', key: 'f1' }], []);
    expect(JSON.parse(reset)).toEqual([]);
  });
});
