/**
 * Tasks run through the shell of the user's terminal profile: PowerShell, Command Prompt or a POSIX
 * shell (Git Bash, WSL, macOS / Linux). Commands are written for that shell, so `.\mvnw.cmd`
 * (PowerShell) becomes `./mvnw.cmd` in Git Bash, where a backslash is an escape character.
 * Pure: no `vscode` import.
 */
import * as path from 'node:path';

export type ShellKind = 'powershell' | 'cmd' | 'posix';

/** A terminal profile as in `terminal.integrated.profiles.<os>`. */
export interface TerminalProfile {
  path?: string | string[];
  source?: string;
}

/** Shell family of an executable path: `C:\Program Files\Git\bin\bash.exe` → posix. */
export function shellKindOf(executable: string, platform: NodeJS.Platform): ShellKind {
  const name = path.win32.basename(executable).toLowerCase().replace(/\.exe$/, '');
  if (name === 'pwsh' || name === 'powershell' || name === 'pwsh-preview') {
    return 'powershell';
  }
  if (name === 'cmd') {
    return 'cmd';
  }
  if (/^(bash|sh|zsh|fish|dash|ksh|wsl|ubuntu.*|debian)$/.test(name)) {
    return 'posix';
  }
  return platform === 'win32' ? 'powershell' : 'posix';
}

/**
 * Shell used by tasks: the automation profile, else the default terminal profile, else the
 * platform's default (PowerShell on Windows), as VS Code does.
 */
export function taskShellKind(platform: NodeJS.Platform, profiles: Readonly<Record<string, TerminalProfile | null>>, automation: TerminalProfile | null | undefined, defaultProfile: string | undefined): ShellKind {
  const kindOf = (profile: TerminalProfile | null | undefined): ShellKind | undefined => {
    if (!profile) {
      return undefined;
    }
    if (profile.source === 'Git Bash') {
      return 'posix';
    }
    if (profile.source === 'PowerShell') {
      return 'powershell';
    }
    const executable = Array.isArray(profile.path) ? profile.path[0] : profile.path;
    return executable ? shellKindOf(executable, platform) : undefined;
  };
  return kindOf(automation) ?? kindOf(defaultProfile ? profiles[defaultProfile] : undefined) ?? (platform === 'win32' ? 'powershell' : 'posix');
}

/** Which Maven wrapper scripts a project has (in its wrapper directory). */
export interface WrapperFiles {
  mvnw: boolean;
  mvnwCmd: boolean;
}

/**
 * The Maven command for the shell. On Windows the `.cmd` scripts run in every shell (the same Java
 * and settings as PowerShell or IntelliJ), only spelled for it; the POSIX `mvnw` is used when it is
 * the only wrapper.
 */
export function mavenCommand(wrapper: WrapperFiles, shell: ShellKind, platform: NodeJS.Platform): string {
  if (platform !== 'win32') {
    return wrapper.mvnw ? './mvnw' : wrapper.mvnwCmd ? './mvnw.cmd' : 'mvn';
  }
  if (!wrapper.mvnw && !wrapper.mvnwCmd) {
    return shell === 'posix' ? 'mvn.cmd' : 'mvn';
  }
  if (shell === 'posix') {
    return wrapper.mvnwCmd ? './mvnw.cmd' : './mvnw';
  }
  // PowerShell does not run a script of the current directory without `.\`; cmd accepts it too.
  return wrapper.mvnwCmd ? '.\\mvnw.cmd' : 'mvn';
}

/**
 * Arguments that need quoting in the shell. PowerShell splits `-Dversion=1.2` at the dot and reads
 * `a,b` as an array: anything beyond letters, digits and `-_:/=` is quoted there.
 */
export function needsStrongQuoting(arg: string, shell: ShellKind): boolean {
  if (shell === 'powershell') {
    return !/^[\w\-:/=]+$/.test(arg);
  }
  return !/^[\w\-:/=.,@%+]+$/.test(arg);
}
