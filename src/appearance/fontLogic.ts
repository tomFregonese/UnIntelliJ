/**
 * Where fonts live on each OS, and which of them can be written without admin rights.
 * Pure: no `vscode` import.
 */
import * as path from 'node:path';

export const JETBRAINS_MONO_FILES = ['JetBrainsMono-Regular.ttf', 'JetBrainsMono-Bold.ttf', 'JetBrainsMono-Italic.ttf', 'JetBrainsMono-BoldItalic.ttf'] as const;

/** Matches JetBrains Mono font files (static, variable or Nerd Font builds). */
export function isJetBrainsMonoFile(name: string): boolean {
  return /^JetBrains\s*Mono.*\.(ttf|otf|ttc)$/i.test(name);
}

/** Folders searched for an installed font, most likely first. */
export function fontDirectories(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string[] {
  switch (platform) {
    case 'win32': {
      const local = env.LOCALAPPDATA ?? path.win32.join(home, 'AppData', 'Local');
      const windir = env.WINDIR ?? env.SystemRoot ?? 'C:\\Windows';
      return [path.win32.join(local, 'Microsoft', 'Windows', 'Fonts'), path.win32.join(windir, 'Fonts')];
    }
    case 'darwin':
      return [path.posix.join(home, 'Library', 'Fonts'), '/Library/Fonts', '/System/Library/Fonts'];
    default:
      return [path.posix.join(home, '.local', 'share', 'fonts'), path.posix.join(home, '.fonts'), '/usr/local/share/fonts', '/usr/share/fonts'];
  }
}

/** Per-user font folder: installing there needs no admin rights. */
export function userFontDirectory(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string {
  return fontDirectories(platform, env, home)[0];
}

/** Font name registered for a file under HKCU (Windows), e.g. "JetBrains Mono Bold Italic (TrueType)". */
export function windowsFontRegistryName(file: string): string {
  const style = file.replace(/^JetBrainsMono-/, '').replace(/\.ttf$/, '');
  const words = style === 'Regular' ? '' : ` ${style.replace(/([a-z])([A-Z])/g, '$1 $2')}`;
  return `JetBrains Mono${words} (TrueType)`;
}
