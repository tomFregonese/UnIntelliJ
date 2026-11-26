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

export const UI_LANGUAGES = ['en', 'fr'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

export const KEYMAP_LAYOUTS = ['auto', 'windows', 'macos'] as const;
export type KeymapLayout = (typeof KEYMAP_LAYOUTS)[number];

export const OPEN_PROJECT_IN = ['newWindow', 'currentWindow', 'ask'] as const;
export type OpenProjectIn = (typeof OPEN_PROJECT_IN)[number];

export const UPDATE_METHODS = ['merge', 'rebase'] as const;
export type UpdateMethod = (typeof UPDATE_METHODS)[number];

/** Value type of every setting, keyed by its name relative to {@link CONFIG_NAMESPACE}. */
export interface Settings {
  'appearance.language': UiLanguage;
  'appearance.theme': ThemeId;
  'appearance.syncWithOs': boolean;
  'appearance.preferredDarkTheme': ThemeId;
  'appearance.preferredLightTheme': ThemeId;
  'appearance.islandsPlus.enabled': boolean;
  'appearance.openProjectIn': OpenProjectIn;
  'keymap.layout': KeymapLayout;
  'keymap.disabledActions': string[];
  'keymap.customShortcuts': Record<string, string>;
  'searchEverywhere.includeNonProjectItems': boolean;
  'searchEverywhere.excludePatterns': string[];
  'vcs.updateMethod': UpdateMethod;
  'vcs.changelists.enabled': boolean;
  'vcs.backgroundFetchMinutes': number;
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
  'appearance.language': {
    section: 'appearance',
    type: 'string',
    default: 'en',
    enum: [
      { value: 'en', label: 'English' },
      { value: 'fr', label: 'Français' },
    ],
    markdownDescription: "Language of UnIntelliJ's windows, popups and messages. Command titles in the Command Palette follow VS Code's display language.",
  },
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
    default: true,
    markdownDescription:
      "**Islands+**: patch VS Code's workbench CSS to get IntelliJ's rounded panels and title bar widgets, and hide VS Code's own branch entry, Explorer and welcome logo. Modifies VS Code installation files and requires write access to them (not possible with the Windows \"System\" installer without admin rights). Turns itself off while UnIntelliJ is disabled and is removed when UnIntelliJ is uninstalled.",
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
  'appearance.openProjectIn': {
    section: 'appearance',
    type: 'string',
    default: 'newWindow',
    enum: [
      { value: 'newWindow', label: 'In a new window (a project already open in a window: that window comes to the front)' },
      { value: 'currentWindow', label: 'In the current window, replacing the open project' },
      { value: 'ask', label: 'Ask each time' },
    ],
    markdownDescription: "Where projects chosen in the project widget (the project name next to the branch) open, like IntelliJ's **Open project in** setting.",
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
  'vcs.backgroundFetchMinutes': {
    section: 'vcs',
    type: 'number',
    default: 5,
    markdownDescription:
      'Fetch in the background every N minutes so that the branch widget shows incoming commits (blue ↙). `0` turns it off. Skipped while `#git.autofetch#` is on.',
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

/**
 * JetBrains Mono (installed by UnIntelliJ), then each OS's own coding font, never Courier New:
 * that serif fallback is what VS Code shows when the first font is missing.
 */
export const EDITOR_FONT = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'Cascadia Mono', 'DejaVu Sans Mono', monospace";

/**
 * IntelliJ-like values of VS Code settings, contributed as defaults (`contributes.configurationDefaults`):
 * VS Code applies them while UnIntelliJ is enabled and drops them by itself when it is disabled or
 * uninstalled. A value the user set (including through the former "Apply" button) always wins.
 */
export const INTELLIJ_DEFAULTS: readonly { key: string; value: unknown; reason: string }[] = [
  { key: 'workbench.colorTheme', value: 'Islands Dark', reason: 'IntelliJ default theme' },
  { key: 'workbench.iconTheme', value: 'unintellij-file-icons', reason: 'New UI file icons' },
  { key: 'workbench.productIconTheme', value: 'unintellij-product-icons', reason: 'New UI icons in the interface' },
  { key: 'editor.fontFamily', value: EDITOR_FONT, reason: 'IntelliJ default editor font' },
  { key: 'editor.fontSize', value: 14, reason: 'Same visual size as IntelliJ' },
  { key: 'editor.lineHeight', value: 1.6, reason: 'IntelliJ line spacing (1.2 × JetBrains Mono line height)' },
  { key: 'editor.fontLigatures', value: false, reason: 'Ligatures off, IntelliJ default' },
  { key: 'terminal.integrated.fontFamily', value: EDITOR_FONT, reason: 'Terminal uses the editor font' },
  { key: 'terminal.integrated.fontSize', value: 14, reason: 'Terminal font size' },
  { key: 'terminal.integrated.lineHeight', value: 1.2, reason: 'IntelliJ terminal line spacing' },
  { key: 'debug.console.fontSize', value: 14, reason: 'Console font size' },
  { key: 'debug.console.fontFamily', value: EDITOR_FONT, reason: 'Console uses the editor font' },
  { key: 'breadcrumbs.enabled', value: false, reason: 'The navigation bar is in the status bar, bottom left' },
  { key: 'diffEditor.renderSideBySide', value: true, reason: 'Side-by-side diff like IntelliJ' },
  { key: 'diffEditor.renderMarginRevertIcon', value: true, reason: 'Per-block revert arrows between the two sides (IntelliJ >> / <<)' },
  { key: 'diffEditor.ignoreTrimWhitespace', value: false, reason: 'Whitespace changes are shown, IntelliJ default' },
  { key: 'diffEditor.hideUnchangedRegions.enabled', value: false, reason: 'Whole file shown, like IntelliJ' },
  { key: 'editor.minimap.enabled', value: false, reason: 'IntelliJ has no minimap' },
  { key: 'editor.renderWhitespace', value: 'none', reason: 'Whitespaces hidden' },
  { key: 'editor.rulers', value: [120], reason: 'Hard wrap guide at 120' },
  { key: 'editor.bracketPairColorization.enabled', value: false, reason: 'No rainbow brackets' },
  { key: 'editor.guides.bracketPairs', value: false, reason: 'No bracket pair guides' },
  { key: 'editor.stickyScroll.enabled', value: true, reason: 'Sticky lines' },
  { key: 'editor.linkedEditing', value: true, reason: 'Paired tags renamed together' },
  { key: 'workbench.editor.enablePreview', value: false, reason: 'No preview tabs' },
  { key: 'workbench.startupEditor', value: 'welcomePageInEmptyWorkbench', reason: 'Empty window: Welcome page with recent projects; in a project: no welcome page, only the shortcut hints' },
  { key: 'files.autoSave', value: 'afterDelay', reason: 'IntelliJ saves continuously, no Save needed' },
  { key: 'files.autoSaveDelay', value: 100, reason: 'Save almost immediately while typing' },
  { key: 'problems.decorations.enabled', value: false, reason: 'File names keep their VCS color (blue = modified) instead of turning red on errors' },
  { key: 'git.autofetch', value: true, reason: 'Background fetch' },
  { key: 'git.openRepositoryInParentFolders', value: 'always', reason: 'Like IntelliJ, a project opened from a subfolder of a repository is under Git' },
  { key: 'debug.toolBarLocation', value: 'docked', reason: 'Debug toolbar in the Debug tool window' },
  { key: 'workbench.tree.indent', value: 12, reason: 'Project tree indentation' },
  { key: 'workbench.tree.renderIndentGuides', value: 'none', reason: 'No guides in the Project tree' },
  { key: 'window.menuBarVisibility', value: 'compact', reason: 'Main menu behind a button, like the New UI (Windows, Linux)' },
  { key: 'window.commandCenter', value: false, reason: 'IntelliJ has no command center: Search Everywhere is Double Shift' },
  // IntelliJ change markers are solid bars, VS Code's are hatched for added/modified lines.
  { key: 'scm.diffDecorationsGutterPattern', value: { added: false, modified: false }, reason: 'Solid change markers in the gutter' },
  { key: 'scm.diffDecorationsGutterWidth', value: 3, reason: 'IntelliJ change marker width' },
  // UnIntelliJ's branch widget shows the ↗/↙ counts and the Update / Push / Fetch buttons.
  { key: 'git.enableStatusBarSync', value: false, reason: 'Sync is in the branch widget' },
];

export const CONFIGURATION_DEFAULTS: Record<string, unknown> = Object.fromEntries(INTELLIJ_DEFAULTS.map((d) => [d.key, d.value]));
