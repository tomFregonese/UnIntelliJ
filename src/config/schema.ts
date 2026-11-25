/**
 * Single source of truth for UnIntelliJ settings.
 *
 * `contributes.configuration` in package.json is generated from this file
 * (`npm run gen:config`) and CI fails if the two drift (`npm run check:config`).
 * This module must stay free of `vscode` imports so it can run in Node scripts and unit tests.
 */

export const CONFIG_NAMESPACE = 'unintellij';

export const THEMES = ['islandsDark', 'islandsLight'] as const;
export type ThemeId = (typeof THEMES)[number];
const THEME_LABELS: Record<ThemeId, string> = {
  islandsDark: 'Islands Dark',
  islandsLight: 'Islands Light',
};

export const KEYMAP_LAYOUTS = ['auto', 'windows', 'macos'] as const;
export type KeymapLayout = (typeof KEYMAP_LAYOUTS)[number];

export const UPDATE_METHODS = ['merge', 'rebase'] as const;
export type UpdateMethod = (typeof UPDATE_METHODS)[number];

/** Value type of every setting, keyed by its name relative to {@link CONFIG_NAMESPACE}. */
export interface Settings {
  'appearance.theme': ThemeId;
  'appearance.syncWithOs': boolean;
  'appearance.preferredDarkTheme': ThemeId;
  'appearance.preferredLightTheme': ThemeId;
  'appearance.islandsPlus.enabled': boolean;
  'keymap.layout': KeymapLayout;
  'keymap.disabledActions': string[];
  'keymap.customShortcuts': Record<string, string>;
  'searchEverywhere.includeNonProjectItems': boolean;
  'searchEverywhere.excludePatterns': string[];
  'vcs.updateMethod': UpdateMethod;
  'vcs.changelists.enabled': boolean;
}

export type SettingKey = keyof Settings;

/** Sections, mirroring the IntelliJ Settings tree. Order here is the display order. */
export const SECTIONS = {
  appearance: 'Appearance & Behavior',
  keymap: 'Keymap',
  searchEverywhere: 'Search Everywhere',
  vcs: 'Version Control',
} as const;
export type SectionId = keyof typeof SECTIONS;

type JsonType<T> = T extends boolean ? 'boolean' : T extends number ? 'number' : T extends string ? 'string' : T extends unknown[] ? 'array' : 'object';

export interface SettingDefinition<T> {
  section: SectionId;
  type: JsonType<T>;
  default: T;
  markdownDescription: string;
  /** Allowed values with their human-readable labels, for string enums. */
  enum?: readonly { value: T; label: string }[];
  /** Item type, for arrays; value type, for objects. */
  items?: 'string';
}

const themeEnum = THEMES.map((value) => ({ value, label: THEME_LABELS[value] }));

/** Definition order inside a section is the display order. */
export const SETTINGS: { [K in SettingKey]: SettingDefinition<Settings[K]> } = {
  'appearance.theme': {
    section: 'appearance',
    type: 'string',
    default: 'islandsDark',
    enum: themeEnum,
    markdownDescription:
      'Color theme, as in IntelliJ **Settings › Appearance › Theme**. Ignored when `#unintellij.appearance.syncWithOs#` is enabled.',
  },
  'appearance.syncWithOs': {
    section: 'appearance',
    type: 'boolean',
    default: false,
    markdownDescription:
      "Follow the operating system's light/dark mode, using `#unintellij.appearance.preferredDarkTheme#` and `#unintellij.appearance.preferredLightTheme#`.",
  },
  'appearance.preferredDarkTheme': {
    section: 'appearance',
    type: 'string',
    default: 'islandsDark',
    enum: themeEnum,
    markdownDescription:
      'Theme used when the OS is in dark mode and `#unintellij.appearance.syncWithOs#` is enabled.',
  },
  'appearance.preferredLightTheme': {
    section: 'appearance',
    type: 'string',
    default: 'islandsLight',
    enum: themeEnum,
    markdownDescription:
      'Theme used when the OS is in light mode and `#unintellij.appearance.syncWithOs#` is enabled.',
  },
  'appearance.islandsPlus.enabled': {
    section: 'appearance',
    type: 'boolean',
    default: false,
    markdownDescription:
      "**Islands+** (experimental): patch VS Code's workbench CSS to get IntelliJ's rounded panels and title bar widgets. Modifies VS Code installation files and requires write access to them.",
  },
  'keymap.layout': {
    section: 'keymap',
    type: 'string',
    default: 'auto',
    enum: [
      { value: 'auto', label: 'IntelliJ default keymap for the current operating system' },
      { value: 'windows', label: 'IntelliJ "Windows" default keymap' },
      { value: 'macos', label: 'IntelliJ "macOS" default keymap' },
    ],
    markdownDescription: 'Which IntelliJ default keymap to emulate.',
  },
  'keymap.disabledActions': {
    section: 'keymap',
    type: 'array',
    items: 'string',
    default: [],
    markdownDescription:
      'IntelliJ action IDs whose shortcut should be disabled (e.g. `SearchEverywhere`).',
  },
  'keymap.customShortcuts': {
    section: 'keymap',
    type: 'object',
    items: 'string',
    default: {},
    markdownDescription:
      'Shortcuts reassigned in **Settings › Keymap**: IntelliJ action ID → VS Code key (e.g. `{ "ReformatCode": "ctrl+shift+l" }`). Written to your keybindings.json by UnIntelliJ.',
  },
  'searchEverywhere.includeNonProjectItems': {
    section: 'searchEverywhere',
    type: 'boolean',
    default: false,
    markdownDescription:
      "Also search libraries and excluded files (e.g. `node_modules`) by default, like IntelliJ's **Include non-project items** checkbox.",
  },
  'searchEverywhere.excludePatterns': {
    section: 'searchEverywhere',
    type: 'array',
    items: 'string',
    default: [],
    markdownDescription:
      'Additional glob patterns excluded from Search Everywhere, on top of `#files.exclude#` and `#search.exclude#`.',
  },
  'vcs.updateMethod': {
    section: 'vcs',
    type: 'string',
    default: 'merge',
    enum: [
      { value: 'merge', label: 'Merge incoming changes into the current branch' },
      { value: 'rebase', label: 'Rebase the current branch on top of incoming changes' },
    ],
    markdownDescription: 'How **Update Project** integrates incoming changes.',
  },
  'vcs.changelists.enabled': {
    section: 'vcs',
    type: 'boolean',
    default: true,
    markdownDescription: 'Enable changelists in the Commit tool window.',
  },
};

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

/** Returns `value` if it is valid for `key`, otherwise the setting's default. */
export function sanitize<K extends SettingKey>(key: K, value: unknown): Settings[K] {
  const def = SETTINGS[key] as SettingDefinition<Settings[K]>;
  switch (def.type) {
    case 'boolean':
    case 'number':
    case 'string':
      if (typeof value !== def.type) {
        return def.default;
      }
      if (def.enum && !def.enum.some((e) => e.value === value)) {
        return def.default;
      }
      return value as Settings[K];
    case 'array':
      return (
        Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : def.default
      ) as Settings[K];
    case 'object':
      return (
        value !== null && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((v) => typeof v === 'string')
          ? value
          : def.default
      ) as Settings[K];
  }
}

/** Builds the `contributes.configuration` array for package.json. */
export function buildConfigurationContribution(): unknown[] {
  return (Object.keys(SECTIONS) as SectionId[]).map((section, sectionIndex) => {
    const keys = SETTING_KEYS.filter((key) => SETTINGS[key].section === section);
    const properties: Record<string, unknown> = {};
    keys.forEach((key, index) => {
      const def = SETTINGS[key] as Omit<SettingDefinition<unknown>, 'type'> & { type: string };
      properties[`${CONFIG_NAMESPACE}.${key}`] = {
        type: def.type,
        default: def.default,
        ...(def.enum && {
          enum: def.enum.map((e) => e.value),
          enumDescriptions: def.enum.map((e) => e.label),
        }),
        ...(def.items && def.type === 'array' && { items: { type: def.items }, uniqueItems: true }),
        ...(def.items && def.type === 'object' && { additionalProperties: { type: def.items } }),
        markdownDescription: def.markdownDescription,
        order: index + 1,
      };
    });
    return {
      id: `${CONFIG_NAMESPACE}.${section}`,
      title: SECTIONS[section],
      order: sectionIndex + 1,
      properties,
    };
  });
}
