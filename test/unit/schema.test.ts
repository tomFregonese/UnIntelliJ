import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildConfigurationContribution,
  CONFIG_NAMESPACE,
  sanitize,
  SECTIONS,
  SETTING_KEYS,
  SETTINGS,
} from '../../src/config/schema';
import { localizeContributions } from '../../src/i18n/nls';

describe('settings schema', () => {
  it('declares every setting in a known section', () => {
    for (const key of SETTING_KEYS) {
      expect(Object.keys(SECTIONS)).toContain(SETTINGS[key].section);
    }
  });

  it('uses a default that is one of the enum values', () => {
    for (const key of SETTING_KEYS) {
      const def = SETTINGS[key];
      if (def.enum) {
        expect(def.enum.map((e) => e.value)).toContain(def.default);
      }
    }
  });

  it('prefixes keys with their section', () => {
    for (const key of SETTING_KEYS) {
      expect(key.startsWith(`${SETTINGS[key].section}.`)).toBe(true);
    }
  });

  it('matches contributes.configuration in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
    expect(pkg.contributes.configuration).toEqual(localizeContributions({ configuration: buildConfigurationContribution() }).value.configuration);
  });

  it('generates one configuration category per section, in order', () => {
    const contribution = buildConfigurationContribution() as { id: string; order: number }[];
    expect(contribution.map((c) => c.id)).toEqual(
      Object.keys(SECTIONS).map((s) => `${CONFIG_NAMESPACE}.${s}`),
    );
    expect(contribution.map((c) => c.order)).toEqual([1, 2, 3, 4]);
  });
});

describe('sanitize', () => {
  it('keeps valid values', () => {
    expect(sanitize('appearance.theme', 'islandsLight')).toBe('islandsLight');
    expect(sanitize('appearance.syncWithOs', true)).toBe(true);
    expect(sanitize('keymap.disabledActions', ['SearchEverywhere'])).toEqual(['SearchEverywhere']);
  });

  it('falls back to the default for missing values', () => {
    expect(sanitize('appearance.theme', undefined)).toBe('islandsDark');
    expect(sanitize('vcs.changelists.enabled', undefined)).toBe(true);
  });

  it('falls back to the default for values of the wrong type', () => {
    expect(sanitize('appearance.syncWithOs', 'yes')).toBe(false);
    expect(sanitize('keymap.disabledActions', 'SearchEverywhere')).toEqual([]);
    expect(sanitize('keymap.disabledActions', [42])).toEqual([]);
  });

  it('falls back to the default for unknown enum values', () => {
    expect(sanitize('appearance.theme', 'darcula')).toBe('islandsDark');
    expect(sanitize('keymap.layout', 'emacs')).toBe('auto');
  });
});
