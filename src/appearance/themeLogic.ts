/**
 * Mapping between UnIntelliJ's appearance settings (IntelliJ semantics: Theme + "Sync with OS"
 * + preferred dark/light themes) and VS Code's own theme settings. Pure: no `vscode` import.
 */
import { THEMES, ThemeId } from '../config/schema';
import { ISLANDS_DARK, ISLANDS_LIGHT } from '../theme/palettes';

/** VS Code theme IDs, i.e. the `label`s contributed in package.json. */
export const THEME_LABELS: Record<ThemeId, string> = {
  islandsDark: ISLANDS_DARK.label,
  islandsLight: ISLANDS_LIGHT.label,
};

export interface AppearanceSettings {
  theme: ThemeId;
  syncWithOs: boolean;
  preferredDarkTheme: ThemeId;
  preferredLightTheme: ThemeId;
}

/** The VS Code settings involved (`workbench.colorTheme`, `window.autoDetectColorScheme`, …). */
export interface VsCodeThemeSettings {
  colorTheme: string | undefined;
  autoDetectColorScheme: boolean;
  preferredDarkColorTheme: string | undefined;
  preferredLightColorTheme: string | undefined;
}

export function themeIdFromLabel(label: string | undefined): ThemeId | undefined {
  return THEMES.find((id) => THEME_LABELS[id] === label);
}

/**
 * VS Code settings to write so that VS Code reflects `appearance`.
 * Returns only the entries that differ from `current`, so applying is idempotent.
 */
export function vsCodeUpdatesFor(
  appearance: AppearanceSettings,
  current: VsCodeThemeSettings,
): Partial<VsCodeThemeSettings> {
  const wanted: Partial<VsCodeThemeSettings> = appearance.syncWithOs
    ? {
        autoDetectColorScheme: true,
        preferredDarkColorTheme: THEME_LABELS[appearance.preferredDarkTheme],
        preferredLightColorTheme: THEME_LABELS[appearance.preferredLightTheme],
      }
    : {
        autoDetectColorScheme: false,
        colorTheme: THEME_LABELS[appearance.theme],
      };
  return diff(wanted, current);
}

/**
 * Appearance settings to write after the user changed VS Code's theme settings directly
 * (theme picker, settings UI), so that UnIntelliJ's Settings stay truthful.
 * Non-Islands themes are left alone: they cannot be represented in our settings.
 */
export function appearanceUpdatesFor(
  vscode: VsCodeThemeSettings,
  current: AppearanceSettings,
): Partial<AppearanceSettings> {
  const wanted: Partial<AppearanceSettings> = { syncWithOs: vscode.autoDetectColorScheme };
  const theme = themeIdFromLabel(vscode.colorTheme);
  if (theme && !vscode.autoDetectColorScheme) {
    wanted.theme = theme;
  }
  const dark = themeIdFromLabel(vscode.preferredDarkColorTheme);
  if (dark) {
    wanted.preferredDarkTheme = dark;
  }
  const light = themeIdFromLabel(vscode.preferredLightColorTheme);
  if (light) {
    wanted.preferredLightTheme = light;
  }
  return diff(wanted, current);
}

function diff<T extends object>(wanted: Partial<T>, current: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(wanted) as (keyof T)[]) {
    if (wanted[key] !== current[key]) {
      result[key] = wanted[key];
    }
  }
  return result;
}
