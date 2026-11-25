import { describe, expect, it } from 'vitest';
import {
  AppearanceSettings,
  appearanceUpdatesFor,
  themeIdFromLabel,
  vsCodeUpdatesFor,
  VsCodeThemeSettings,
} from '../../src/appearance/themeLogic';

const appearance = (overrides: Partial<AppearanceSettings> = {}): AppearanceSettings => ({
  theme: 'islandsDark',
  syncWithOs: false,
  preferredDarkTheme: 'islandsDark',
  preferredLightTheme: 'islandsLight',
  ...overrides,
});

const vscode = (overrides: Partial<VsCodeThemeSettings> = {}): VsCodeThemeSettings => ({
  colorTheme: 'Default Dark Modern',
  autoDetectColorScheme: false,
  preferredDarkColorTheme: 'Default Dark Modern',
  preferredLightColorTheme: 'Default Light Modern',
  ...overrides,
});

describe('themeIdFromLabel', () => {
  it('maps Islands labels to theme ids', () => {
    expect(themeIdFromLabel('Islands Dark')).toBe('islandsDark');
    expect(themeIdFromLabel('Islands Light')).toBe('islandsLight');
  });

  it('ignores other themes', () => {
    expect(themeIdFromLabel('Default Dark Modern')).toBeUndefined();
    expect(themeIdFromLabel(undefined)).toBeUndefined();
  });
});

describe('vsCodeUpdatesFor', () => {
  it('sets the color theme and disables OS detection without sync', () => {
    expect(vsCodeUpdatesFor(appearance({ theme: 'islandsLight' }), vscode({ autoDetectColorScheme: true }))).toEqual({
      autoDetectColorScheme: false,
      colorTheme: 'Islands Light',
    });
  });

  it('enables OS detection with the preferred themes when syncing', () => {
    expect(
      vsCodeUpdatesFor(appearance({ syncWithOs: true, preferredLightTheme: 'islandsDark' }), vscode()),
    ).toEqual({
      autoDetectColorScheme: true,
      preferredDarkColorTheme: 'Islands Dark',
      preferredLightColorTheme: 'Islands Dark',
    });
  });

  it('does not touch workbench.colorTheme when syncing', () => {
    expect(vsCodeUpdatesFor(appearance({ syncWithOs: true }), vscode())).not.toHaveProperty('colorTheme');
  });

  it('returns nothing when VS Code already matches', () => {
    expect(vsCodeUpdatesFor(appearance(), vscode({ colorTheme: 'Islands Dark' }))).toEqual({});
  });
});

describe('appearanceUpdatesFor', () => {
  it('reflects an Islands theme picked in VS Code', () => {
    expect(appearanceUpdatesFor(vscode({ colorTheme: 'Islands Light' }), appearance())).toEqual({
      theme: 'islandsLight',
    });
  });

  it('ignores non-Islands themes', () => {
    expect(appearanceUpdatesFor(vscode({ colorTheme: 'Monokai' }), appearance())).toEqual({});
  });

  it('reflects OS detection and preferred themes', () => {
    expect(
      appearanceUpdatesFor(
        vscode({ autoDetectColorScheme: true, preferredLightColorTheme: 'Islands Dark' }),
        appearance(),
      ),
    ).toEqual({ syncWithOs: true, preferredLightTheme: 'islandsDark' });
  });

  it('does not change the main theme while OS detection is on', () => {
    expect(
      appearanceUpdatesFor(vscode({ autoDetectColorScheme: true, colorTheme: 'Islands Light' }), appearance({ syncWithOs: true })),
    ).toEqual({});
  });

  it('is the inverse of vsCodeUpdatesFor (no ping-pong)', () => {
    for (const a of [appearance(), appearance({ theme: 'islandsLight' }), appearance({ syncWithOs: true, preferredDarkTheme: 'islandsLight' })]) {
      const synced = { ...vscode(), ...vsCodeUpdatesFor(a, vscode()) };
      expect(appearanceUpdatesFor(synced, a)).toEqual({});
    }
  });
});
