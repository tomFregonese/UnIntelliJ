import { describe, expect, it } from 'vitest';
import { SETTING_KEYS } from '../../src/config/schema';
import { fieldKeys, PAGES } from '../../src/settings/pages';

describe('Settings pages', () => {
  it('have unique ids and existing parents', () => {
    const ids = PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const page of PAGES) {
      if (page.parent) {
        expect(ids).toContain(page.parent);
        // Children come after their parent so the tree renders in order.
        expect(ids.indexOf(page.parent)).toBeLessThan(ids.indexOf(page.id));
      }
    }
  });

  it('never edit the same setting twice', () => {
    const keys = fieldKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only reference declared UnIntelliJ settings', () => {
    for (const key of fieldKeys().filter((k) => k.startsWith('unintellij.'))) {
      expect(SETTING_KEYS).toContain(key.slice('unintellij.'.length));
    }
  });

  it('expose every user-facing UnIntelliJ setting', () => {
    const exposed = new Set([...fieldKeys(), 'unintellij.keymap.disabledActions']);
    for (const key of SETTING_KEYS) {
      expect(exposed, key).toContain(`unintellij.${key}`);
    }
  });

  it('give select fields at least two options', () => {
    for (const field of PAGES.flatMap((p) => p.fields ?? [])) {
      if (field.type === 'select') {
        expect(field.options.length, field.key).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
