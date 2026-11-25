/**
 * Pages of the IntelliJ-style Settings window, declared as data. Pure: no `vscode` import.
 * Every field edits one VS Code setting (full key, e.g. `editor.fontSize` or `unintellij.keymap.layout`).
 */
import { SETTINGS, THEMES } from '../config/schema';

export interface Option {
  value: string | number | boolean;
  label: string;
}

export type Field =
  | { type: 'select'; key: string; label: string; options: Option[]; help?: string }
  | { type: 'checkbox'; key: string; label: string; help?: string }
  | { type: 'number'; key: string; label: string; min?: number; max?: number; step?: number; help?: string }
  | { type: 'text'; key: string; label: string; placeholder?: string; help?: string }
  | { type: 'list'; key: string; label: string; help?: string };

export type CustomPage = 'keymap' | 'plugins' | 'preset';

export interface Page {
  id: string;
  title: string;
  parent?: string;
  fields?: Field[];
  /** Custom section rendered after the fields. */
  custom?: CustomPage;
  /** Shown when searching, for custom pages. */
  keywords?: string;
}

const themeOptions: Option[] = THEMES.map((value) => ({ value, label: value === 'islandsDark' ? 'Islands Dark' : 'Islands Light' }));

export const PAGES: readonly Page[] = [
  { id: 'appearanceBehavior', title: 'Appearance & Behavior' },
  {
    id: 'appearance',
    title: 'Appearance',
    parent: 'appearanceBehavior',
    fields: [
      { type: 'select', key: 'unintellij.appearance.theme', label: 'Theme', options: themeOptions },
      { type: 'checkbox', key: 'unintellij.appearance.syncWithOs', label: 'Sync with OS' },
      { type: 'select', key: 'unintellij.appearance.preferredDarkTheme', label: 'Preferred dark theme', options: themeOptions },
      { type: 'select', key: 'unintellij.appearance.preferredLightTheme', label: 'Preferred light theme', options: themeOptions },
      {
        type: 'checkbox',
        key: 'unintellij.appearance.islandsPlus.enabled',
        label: 'Islands+ (rounded islands, IntelliJ title bar)',
        help: 'Experimental. Patches VS Code installation files: needs write access to them (not possible with a "system" install without admin rights). Restart VS Code to apply.',
      },
      { type: 'select', key: 'window.zoomLevel', label: 'Zoom', options: [-2, -1, -0.5, 0, 0.5, 1, 2].map((v) => ({ value: v, label: `${Math.round(100 * 1.2 ** v)}%` })) },
    ],
  },
  {
    id: 'system',
    title: 'System Settings',
    parent: 'appearanceBehavior',
    fields: [
      {
        type: 'select',
        key: 'files.autoSave',
        label: 'Save files automatically',
        options: [
          { value: 'off', label: 'Off' },
          { value: 'afterDelay', label: 'After a delay' },
          { value: 'onFocusChange', label: 'When switching to another editor' },
          { value: 'onWindowChange', label: 'When the IDE window loses focus' },
        ],
      },
      { type: 'number', key: 'files.autoSaveDelay', label: 'Auto-save delay (ms)', min: 100, max: 60000, step: 100 },
      {
        type: 'select',
        key: 'window.restoreWindows',
        label: 'Reopen projects on startup',
        options: [
          { value: 'all', label: 'All projects' },
          { value: 'one', label: 'Last project' },
          { value: 'preserve', label: 'Preserve' },
          { value: 'none', label: 'None' },
        ],
      },
      { type: 'checkbox', key: 'window.confirmBeforeClose', label: 'Confirm before exiting the IDE' },
    ],
  },
  { id: 'keymap', title: 'Keymap', custom: 'keymap', keywords: 'shortcut keyboard binding', fields: [selectFromSchema('unintellij.keymap.layout', 'Keymap')] },
  { id: 'editor', title: 'Editor' },
  {
    id: 'editorGeneral',
    title: 'General',
    parent: 'editor',
    custom: 'preset',
    keywords: 'recommended defaults intellij-like',
    fields: [
      { type: 'checkbox', key: 'editor.stickyScroll.enabled', label: 'Show sticky lines' },
      { type: 'checkbox', key: 'breadcrumbs.enabled', label: 'Show breadcrumbs' },
      { type: 'checkbox', key: 'editor.minimap.enabled', label: 'Show minimap' },
      { type: 'select', key: 'editor.wordWrap', label: 'Soft-wrap', options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }, { value: 'bounded', label: 'At right margin' }] },
      { type: 'select', key: 'editor.renderWhitespace', label: 'Show whitespaces', options: ['none', 'boundary', 'selection', 'trailing', 'all'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
      { type: 'select', key: 'editor.lineNumbers', label: 'Show line numbers', options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }, { value: 'relative', label: 'Relative' }] },
      { type: 'select', key: 'editor.inlayHints.enabled', label: 'Inlay hints', options: ['on', 'onUnlessPressed', 'offUnlessPressed', 'off'].map((v) => ({ value: v, label: v })) },
      { type: 'checkbox', key: 'editor.linkedEditing', label: 'Rename paired HTML/XML tags' },
      { type: 'checkbox', key: 'workbench.editor.enablePreview', label: 'Open files in preview tab' },
      { type: 'checkbox', key: 'editor.formatOnSave', label: 'Reformat code on save' },
    ],
  },
  {
    id: 'font',
    title: 'Font',
    parent: 'editor',
    fields: [
      {
        type: 'text',
        key: 'editor.fontFamily',
        label: 'Font',
        placeholder: "'JetBrains Mono', Consolas, monospace",
        help: 'JetBrains Mono must be installed on the system (free, https://www.jetbrains.com/lp/mono/).',
      },
      { type: 'number', key: 'editor.fontSize', label: 'Size', min: 6, max: 72, step: 1 },
      { type: 'number', key: 'editor.lineHeight', label: 'Line height (0 = automatic, < 8 = multiplier)', min: 0, max: 100, step: 0.1 },
      { type: 'checkbox', key: 'editor.fontLigatures', label: 'Enable ligatures' },
    ],
  },
  { id: 'vcs', title: 'Version Control' },
  {
    id: 'git',
    title: 'Git',
    parent: 'vcs',
    fields: [
      selectFromSchema('unintellij.vcs.updateMethod', 'Update method'),
      { type: 'checkbox', key: 'unintellij.vcs.changelists.enabled', label: 'Enable changelists' },
      { type: 'checkbox', key: 'git.autofetch', label: 'Fetch in the background' },
      { type: 'checkbox', key: 'git.confirmSync', label: 'Confirm before synchronizing' },
    ],
  },
  { id: 'tools', title: 'Tools' },
  {
    id: 'searchEverywhere',
    title: 'Search Everywhere',
    parent: 'tools',
    fields: [
      { type: 'checkbox', key: 'unintellij.searchEverywhere.includeNonProjectItems', label: 'Include non-project items by default' },
      { type: 'list', key: 'unintellij.searchEverywhere.excludePatterns', label: 'Excluded patterns (one glob per line)', help: 'On top of files.exclude and search.exclude, e.g. **/generated/**' },
    ],
  },
  { id: 'plugins', title: 'Plugins', custom: 'plugins', keywords: 'extension integration java angular' },
];

function selectFromSchema(key: `unintellij.${string}`, label: string): Field {
  const def = SETTINGS[key.slice('unintellij.'.length) as keyof typeof SETTINGS];
  return { type: 'select', key, label, options: (def.enum ?? []).map((e) => ({ value: e.value as string, label: e.label })) };
}

export function fieldKeys(pages: readonly Page[] = PAGES): string[] {
  return pages.flatMap((p) => (p.fields ?? []).map((f) => f.key));
}
