import * as vscode from 'vscode';
import { getSetting } from '../config/settings';
import { formatKey, KEYMAP, KeymapOs } from '../keymap/keymap';
import { t } from '../i18n/i18n';
import { COMMANDS } from '../commands/catalog';

export interface ActionEntry {
  label: string;
  description?: string;
  detail?: string;
  /** Text matched against the query (label + category). */
  searchText: string;
  run(): Thenable<unknown>;
}

/** Editor/IDE options IntelliJ lets you flip from Find Action ("Soft-Wraps: ON"). */
const TOGGLES: readonly { label: string; section: string; key: string; on: unknown; off: unknown }[] = [
  { label: t('Soft-Wraps'), section: 'editor', key: 'wordWrap', on: 'on', off: 'off' },
  { label: t('Show Whitespaces'), section: 'editor', key: 'renderWhitespace', on: 'all', off: 'none' },
  { label: t('Show Line Numbers'), section: 'editor', key: 'lineNumbers', on: 'on', off: 'off' },
  { label: t('Show Indent Guides'), section: 'editor.guides', key: 'indentation', on: true, off: false },
  { label: t('Show Minimap'), section: 'editor.minimap', key: 'enabled', on: true, off: false },
  { label: t('Show Breadcrumbs'), section: 'breadcrumbs', key: 'enabled', on: true, off: false },
  { label: t('Sticky Lines'), section: 'editor.stickyScroll', key: 'enabled', on: true, off: false },
  { label: t('Inlay Hints'), section: 'editor.inlayHints', key: 'enabled', on: 'on', off: 'off' },
  { label: t('Save Files Automatically'), section: 'files', key: 'autoSave', on: 'afterDelay', off: 'off' },
  { label: t('Code Folding'), section: 'editor', key: 'folding', on: true, off: false },
];

export function currentKeymapOs(): KeymapOs {
  const layout = getSetting('keymap.layout');
  return layout === 'auto' ? (process.platform === 'darwin' ? 'macos' : 'windows') : layout;
}

/** Shortcut of an IntelliJ action in the active keymap, formatted like IntelliJ. */
export function shortcutFor(command: string, args?: unknown): string | undefined {
  const os = currentKeymapOs();
  const action = KEYMAP.find((a) => a.command === command && JSON.stringify(a.args) === JSON.stringify(args) && actionKey(a.id, a[os]));
  const key = action && actionKey(action.id, action[os]);
  return key ? formatKey(key, os) : undefined;
}

/** Effective shortcut of an action: reassigned, default, or none when disabled. */
function actionKey(id: string, defaultKey: string | undefined): string | undefined {
  const custom = getSetting('keymap.customShortcuts')[id];
  if (custom) {
    return custom;
  }
  return getSetting('keymap.disabledActions').includes(id) ? undefined : defaultKey;
}

export function collectActions(): ActionEntry[] {
  const os = currentKeymapOs();
  const entries: ActionEntry[] = [];
  const seen = new Set<string>();

  // IntelliJ actions first, with their IntelliJ names and shortcuts.
  for (const action of KEYMAP) {
    const id = `${action.command}|${JSON.stringify(action.args)}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const key = actionKey(action.id, action[os]);
    entries.push({
      label: t(action.name),
      description: key ? formatKey(key, os) : undefined,
      detail: undefined,
      // English names stay searchable in French, like IntelliJ.
      searchText: `${t(action.name)} ${action.name} ${action.category}`,
      run: () => vscode.commands.executeCommand(action.command, ...(action.args !== undefined ? [action.args] : [])),
    });
  }

  for (const toggle of TOGGLES) {
    const config = vscode.workspace.getConfiguration(toggle.section);
    const isOn = config.get(toggle.key) === toggle.on;
    entries.push({
      label: `${t(toggle.label)}: ${isOn ? 'ON' : 'OFF'}`,
      description: t('Option'),
      searchText: `${toggle.label} option toggle`,
      run: () => config.update(toggle.key, isOn ? toggle.off : toggle.on, vscode.ConfigurationTarget.Global),
    });
  }

  // UnIntelliJ's own commands: their package.json titles are %key% placeholders.
  for (const c of COMMANDS) {
    if (c.hidden || seen.has(`${c.command}|undefined`)) {
      continue;
    }
    seen.add(`${c.command}|undefined`);
    const label = `UnIntelliJ: ${t(c.title)}`;
    entries.push({ label, description: shortcutFor(c.command), searchText: `${label} ${c.title}`, run: () => vscode.commands.executeCommand(c.command) });
  }

  // Commands contributed by extensions (built-in VS Code commands have no public titles; the
  // "All Commands…" entry opens the native palette for those).
  for (const extension of vscode.extensions.all) {
    const commands = (extension.packageJSON?.contributes?.commands ?? []) as { command: string; title: unknown; category?: unknown }[];
    for (const c of Array.isArray(commands) ? commands : []) {
      if (seen.has(`${c.command}|undefined`) || typeof c.title !== 'string' || c.title.startsWith('%')) {
        continue;
      }
      seen.add(`${c.command}|undefined`);
      const category = typeof c.category === 'string' && !c.category.startsWith('%') ? c.category : undefined;
      const label = category ? `${category}: ${c.title}` : c.title;
      entries.push({
        label,
        description: shortcutFor(c.command),
        searchText: label,
        run: () => vscode.commands.executeCommand(c.command),
      });
    }
  }
  return entries;
}
