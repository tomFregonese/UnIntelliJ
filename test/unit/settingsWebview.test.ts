// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { PAGES } from '../../src/settings/pages';
import type { FromWebview, SettingsModel } from '../../src/settings/protocol';

const sent: FromWebview[] = [];
(globalThis as unknown as { acquireVsCodeApi: unknown }).acquireVsCodeApi = () => ({ postMessage: (m: FromWebview) => sent.push(m) });

const model: SettingsModel = {
  pages: [...PAGES],
  values: {
    'unintellij.appearance.theme': 'islandsDark',
    'unintellij.appearance.syncWithOs': false,
    'unintellij.keymap.layout': 'auto',
    'unintellij.keymap.disabledActions': [],
    'unintellij.keymap.customShortcuts': {},
    'editor.fontSize': 14,
    'unintellij.searchEverywhere.excludePatterns': [],
  },
  autoKeymapOs: 'windows',
  platform: 'windows',
  keymap: [
    { id: 'SearchEverywhere', name: 'Search Everywhere', category: 'Navigation', windows: 'Double Shift', macos: '⇧⇧' },
    { id: 'ReformatCode', name: 'Reformat Code', category: 'Editing', windows: 'Ctrl+Alt+L', macos: '⌘⌥L' },
  ],
  integrations: [{ name: 'Language Support for Java by Red Hat', extensionId: 'redhat.java', purpose: 'Java', installed: false, active: false }],
  preset: { applied: false, entries: [{ key: 'editor.minimap.enabled', value: false, reason: 'No minimap' }] },
  initialPage: 'appearance',
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const deliver = async (data: unknown) => {
  window.dispatchEvent(new MessageEvent('message', { data }));
  await flush();
};
const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const treeItem = (title: string) => [...document.querySelectorAll<HTMLElement>('.tree li')].find((li) => li.textContent === title)!;

describe('Settings webview', () => {
  beforeAll(async () => {
    document.body.innerHTML = '<div id="app"></div>';
    await import('../../src/webview/settings');
    await deliver({ type: 'model', model });
  });

  it('says ready on load', () => {
    expect(sent[0]).toEqual({ type: 'ready' });
  });

  it('renders the tree and the initial page', () => {
    expect([...document.querySelectorAll('.tree li')].map((li) => li.textContent)).toContain('Keymap');
    expect($('.breadcrumb').textContent).toBe('Appearance & Behavior › Appearance');
    expect($<HTMLSelectElement>('#field-unintellij\\.appearance\\.theme').value).toBe('Islands Dark');
  });

  it('keeps edits pending, marks them modified and applies them', async () => {
    const sync = $<HTMLInputElement>('#field-unintellij\\.appearance\\.syncWithOs');
    sync.checked = true;
    sync.dispatchEvent(new Event('change'));
    expect($('[data-key="unintellij.appearance.syncWithOs"]').classList.contains('modified')).toBe(true);
    expect($<HTMLButtonElement>('#apply').disabled).toBe(false);
    $<HTMLButtonElement>('#apply').click();
    expect(sent.at(-1)).toEqual({ type: 'apply', changes: { 'unintellij.appearance.syncWithOs': true }, close: false });
    await deliver({ type: 'applied' });
    expect($<HTMLButtonElement>('#apply').disabled).toBe(true);
  });

  it('reverting an edit to the saved value clears it', async () => {
    treeItem('Font').click();
    const size = $<HTMLInputElement>('#field-editor\\.fontSize');
    size.value = '16';
    size.dispatchEvent(new Event('input'));
    expect($<HTMLButtonElement>('#apply').disabled).toBe(false);
    size.value = '14';
    size.dispatchEvent(new Event('input'));
    expect($<HTMLButtonElement>('#apply').disabled).toBe(true);
  });

  it('filters the tree with the search box', async () => {
    const search = $<HTMLInputElement>('.search');
    search.value = 'font';
    search.dispatchEvent(new Event('input'));
    const titles = [...document.querySelectorAll('.tree li')].map((li) => li.textContent);
    expect(titles).toContain('Font');
    expect(titles).not.toContain('Git');
    search.value = '';
    search.dispatchEvent(new Event('input'));
  });

  it('disables a shortcut from the Keymap page', async () => {
    treeItem('Keymap').click();
    const rows = [...document.querySelectorAll<HTMLTableRowElement>('.keymap tbody tr')];
    expect(rows.map((r) => r.cells[2].querySelector('kbd')!.textContent)).toEqual(['Double Shift', 'Ctrl+Alt+L']);
    const checkbox = rows[1].querySelector<HTMLInputElement>('input')!;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    $<HTMLButtonElement>('#ok').click();
    expect(sent.at(-1)).toEqual({ type: 'apply', changes: { 'unintellij.keymap.disabledActions': ['ReformatCode'] }, close: true });
  });

  it('reassigns a shortcut by recording it, and resets it with Backspace', async () => {
    treeItem('Keymap').click();
    const row = () => document.querySelector<HTMLTableRowElement>('tr[data-action="ReformatCode"]')!;
    row().querySelector<HTMLButtonElement>('button.edit')!.click();
    expect(row().textContent).toContain('Press a shortcut');
    // A modifier alone waits for the full combination.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', shiftKey: true }));
    expect(row().textContent).toContain('Press a shortcut');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL', ctrlKey: true, shiftKey: true }));
    expect(row().querySelector('kbd.custom-key')!.textContent).toBe('Ctrl+Shift+L');
    document.querySelector<HTMLButtonElement>('#apply')!.click();
    expect(sent.at(-1)).toMatchObject({ type: 'apply', changes: { 'unintellij.keymap.customShortcuts': { ReformatCode: 'ctrl+shift+l' } } });
    await deliver({ type: 'applied' });

    row().querySelector<HTMLButtonElement>('button.edit')!.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace' }));
    expect(row().querySelector('kbd')!.textContent).toBe('Ctrl+Alt+L');
  });

  it('navigates on request and lists integrations', async () => {
    await deliver({ type: 'navigate', page: 'plugins' });
    expect($('.plugin').textContent).toContain('Not installed');
    $<HTMLButtonElement>('.plugin button').click();
    expect(sent.at(-1)).toEqual({ type: 'showExtension', id: 'redhat.java' });
  });
});
