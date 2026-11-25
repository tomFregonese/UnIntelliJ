import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../../src/commands/catalog';
import { buildKeybindings, buildKeymapBindings, buildKeymapMarkdown, customKeybindings, keyFromEvent, CATEGORIES, formatKey, KEYMAP, KeymapOs, ownCommands } from '../../src/keymap/keymap';

const root = join(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const VALID_KEY = /^((ctrl|shift|alt|cmd|meta)\+)*([a-z0-9]|f[0-9]{1,2}|escape|enter|backspace|delete|insert|tab|space|up|down|left|right|home|end|pageup|pagedown|[-=[\]`'/\\;,.])$/;

describe('keymap', () => {
  it('has unique action ids in known categories', () => {
    const ids = KEYMAP.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const action of KEYMAP) {
      expect(CATEGORIES).toContain(action.category);
    }
  });

  it('uses valid VS Code key syntax', () => {
    for (const action of KEYMAP) {
      for (const key of [action.windows, action.macos]) {
        if (!key) {
          continue;
        }
        for (const chord of key.split(' ')) {
          expect(chord === 'shift' || VALID_KEY.test(chord), `${action.id}: ${key}`).toBe(true);
        }
      }
    }
  });

  it('does not use cmd in the Windows keymap', () => {
    for (const action of KEYMAP) {
      expect(action.windows ?? '', action.id).not.toMatch(/cmd/);
    }
  });

  it('only points to UnIntelliJ commands that exist', () => {
    const catalog = COMMANDS.map((c) => c.command);
    for (const command of ownCommands()) {
      expect(catalog).toContain(command);
    }
  });

  it('never binds the same key twice in the same context', () => {
    for (const os of ['windows', 'macos'] as KeymapOs[]) {
      const seen = new Map<string, string>();
      for (const action of KEYMAP) {
        const key = action[os];
        if (!key) {
          continue;
        }
        for (const when of [action.when ?? '', ...(action.variants ?? []).map((v) => v.when)]) {
          const slot = `${key} | ${when}`;
          expect(seen.get(slot), `${os}: ${slot} bound by ${seen.get(slot)} and ${action.id}`).toBeUndefined();
          seen.set(slot, action.id);
        }
      }
    }
  });

  it('includes the essentials', () => {
    const byId = Object.fromEntries(KEYMAP.map((a) => [a.id, a]));
    expect(byId.SearchEverywhere).toMatchObject({ windows: 'shift shift', macos: 'shift shift' });
    expect(byId.GotoClass).toMatchObject({ windows: 'ctrl+n', macos: 'cmd+o' });
    expect(byId.ShowIntentionActions).toMatchObject({ windows: 'alt+enter' });
    expect(byId.EditorSelectWord).toMatchObject({ windows: 'ctrl+w', macos: 'alt+up' });
  });
});

describe('buildKeybindings', () => {
  const bindings = buildKeybindings();

  it('is what package.json contributes', () => {
    expect(pkg.contributes.keybindings).toEqual(bindings);
  });

  it('guards every IntelliJ binding with the keymap layout and the disabled-action context key', () => {
    for (const binding of buildKeymapBindings()) {
      expect(binding.when).toMatch(/config\.unintellij\.keymap\.layout/);
      expect(binding.when).toMatch(/!unintellij\.keymap\.disabled\./);
    }
  });

  it('puts toggle variants after the main binding so they win when focused', () => {
    const project = bindings.filter((b) => b.key === 'alt+1');
    expect(project.map((b) => b.command)).toEqual(['workbench.view.extension.unintellij-project', 'workbench.action.closeSidebar']);
  });

  it('passes args through', () => {
    const extract = bindings.find((b) => b.key === 'ctrl+alt+m');
    expect(extract?.args).toEqual({ kind: 'refactor.extract.function', apply: 'ifSingle' });
  });
});

describe('formatKey', () => {
  it('formats Windows shortcuts like IntelliJ', () => {
    expect(formatKey('ctrl+shift+n', 'windows')).toBe('Ctrl+Shift+N');
    expect(formatKey('shift shift', 'windows')).toBe('Double Shift');
    expect(formatKey('alt+enter', 'windows')).toBe('Alt+Enter');
  });

  it('formats macOS shortcuts with symbols', () => {
    expect(formatKey('cmd+shift+o', 'macos')).toBe('⌘⇧O');
    expect(formatKey('shift shift', 'macos')).toBe('⇧⇧');
    expect(formatKey('alt+up', 'macos')).toBe('⌥↑');
  });
});

describe('docs/KEYMAP.md', () => {
  it('is generated and up to date', () => {
    expect(readFileSync(join(root, 'docs', 'KEYMAP.md'), 'utf8')).toBe(buildKeymapMarkdown());
  });
});

describe('commands', () => {
  it('are all contributed in package.json', () => {
    expect(pkg.contributes.commands.map((c: { command: string }) => c.command)).toEqual(COMMANDS.map((c) => c.command));
  });
});

describe('keyFromEvent', () => {
  const event = (code: string, mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) => ({ code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });

  it('builds VS Code keys from physical keys', () => {
    expect(keyFromEvent(event('KeyN', { ctrlKey: true, shiftKey: true }), 'windows')).toBe('ctrl+shift+n');
    expect(keyFromEvent(event('Digit1', { altKey: true }), 'windows')).toBe('alt+1');
    expect(keyFromEvent(event('F12', { ctrlKey: true }), 'windows')).toBe('ctrl+f12');
    expect(keyFromEvent(event('ArrowUp', { altKey: true, shiftKey: true }), 'windows')).toBe('shift+alt+up');
    expect(keyFromEvent(event('Slash', { ctrlKey: true }), 'windows')).toBe('ctrl+/');
  });

  it('names the meta key per OS and ignores modifier-only presses', () => {
    expect(keyFromEvent(event('KeyO', { metaKey: true }), 'macos')).toBe('cmd+o');
    expect(keyFromEvent(event('KeyO', { metaKey: true }), 'windows')).toBe('meta+o');
    expect(keyFromEvent(event('ShiftLeft', { shiftKey: true }), 'windows')).toBeUndefined();
  });
});

describe('customKeybindings', () => {
  it('rebinds the action and its variants on the new key', () => {
    expect(customKeybindings({ ReformatCode: 'ctrl+shift+l', ActivateProjectToolWindow: 'f1' })).toEqual([
      { key: 'ctrl+shift+l', command: 'editor.action.formatDocument', when: 'editorTextFocus && !editorReadonly && !editorHasSelection' },
      { key: 'f1', command: 'workbench.view.extension.unintellij-project' },
      { key: 'f1', command: 'workbench.action.closeSidebar', when: "sideBarFocus && activeViewlet == 'workbench.view.extension.unintellij-project'" },
    ]);
  });
});
