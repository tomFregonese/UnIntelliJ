import { describe, expect, it } from 'vitest';
import { fontDirectories, isJetBrainsMonoFile, userFontDirectory, windowsFontRegistryName } from '../../src/appearance/fontLogic';

describe('fontLogic', () => {
  it('recognizes JetBrains Mono files', () => {
    expect(isJetBrainsMonoFile('JetBrainsMono-Regular.ttf')).toBe(true);
    expect(isJetBrainsMonoFile('JetBrainsMono[wght].ttf')).toBe(true);
    expect(isJetBrainsMonoFile('JetBrainsMonoNerdFont-Regular.ttf')).toBe(true);
    expect(isJetBrainsMonoFile('consola.ttf')).toBe(false);
  });

  it('installs per user without admin rights', () => {
    expect(userFontDirectory('win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me')).toBe('C:\\Users\\me\\AppData\\Local\\Microsoft\\Windows\\Fonts');
    expect(userFontDirectory('darwin', {}, '/Users/me')).toBe('/Users/me/Library/Fonts');
    expect(userFontDirectory('linux', {}, '/home/me')).toBe('/home/me/.local/share/fonts');
  });

  it('also searches the system font folders', () => {
    expect(fontDirectories('win32', { WINDIR: 'C:\\Windows' }, 'C:\\Users\\me')).toContain('C:\\Windows\\Fonts');
    expect(fontDirectories('darwin', {}, '/Users/me')).toContain('/Library/Fonts');
  });

  it('names fonts like the Windows installer', () => {
    expect(windowsFontRegistryName('JetBrainsMono-Regular.ttf')).toBe('JetBrains Mono (TrueType)');
    expect(windowsFontRegistryName('JetBrainsMono-BoldItalic.ttf')).toBe('JetBrains Mono Bold Italic (TrueType)');
  });
});
