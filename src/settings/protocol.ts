/** Messages exchanged between the Settings webview and the extension. Pure types. */
import type { Page } from './pages';

export interface KeymapRow {
  id: string;
  name: string;
  category: string;
  /** Formatted shortcut in the keymap selected in the page. */
  windows?: string;
  macos?: string;
}

export interface IntegrationRow {
  name: string;
  extensionId: string;
  purpose: string;
  installed: boolean;
  active: boolean;
  version?: string;
}

export interface SettingsModel {
  pages: Page[];
  /** Current value of every field key, plus `unintellij.keymap.disabledActions`. */
  values: Record<string, unknown>;
  /** OS used by the "auto" keymap layout. */
  autoKeymapOs: 'windows' | 'macos';
  /** OS of this machine, to record shortcuts with the right meta key name. */
  platform: 'windows' | 'macos';
  keymap: KeymapRow[];
  integrations: IntegrationRow[];
  preset: { applied: boolean; entries: { key: string; value: unknown; reason: string }[] };
  /** Page shown when the window opens (later models keep the current page). */
  initialPage: string;
}

export type FromWebview =
  | { type: 'ready' }
  | { type: 'apply'; changes: Record<string, unknown>; close: boolean }
  | { type: 'cancel' }
  | { type: 'applyPreset' }
  | { type: 'revertPreset' }
  | { type: 'showExtension'; id: string };

export type ToWebview = { type: 'model'; model: SettingsModel } | { type: 'navigate'; page: string } | { type: 'applied' };
