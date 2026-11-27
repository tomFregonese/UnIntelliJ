import { describe, expect, it } from 'vitest';
import { mavenCommand, needsStrongQuoting, shellKindOf, taskShellKind } from '../../src/run/shellLogic';

const windowsProfiles = {
  PowerShell: { source: 'PowerShell' },
  'Command Prompt': { path: ['${env:windir}\\Sysnative\\cmd.exe', '${env:windir}\\System32\\cmd.exe'] },
  'Git Bash': { source: 'Git Bash' },
  'My Bash': { path: 'C:\\Program Files\\Git\\bin\\bash.exe' },
};

describe('task shell', () => {
  it('recognizes shells from their executable', () => {
    expect(shellKindOf('C:\\Program Files\\Git\\bin\\bash.exe', 'win32')).toBe('posix');
    expect(shellKindOf('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'win32')).toBe('powershell');
    expect(shellKindOf('C:\\Windows\\System32\\cmd.exe', 'win32')).toBe('cmd');
    expect(shellKindOf('/bin/zsh', 'darwin')).toBe('posix');
  });

  it('follows the automation profile, then the default profile, then PowerShell on Windows', () => {
    expect(taskShellKind('win32', windowsProfiles, undefined, undefined)).toBe('powershell');
    expect(taskShellKind('win32', windowsProfiles, undefined, 'Git Bash')).toBe('posix');
    expect(taskShellKind('win32', windowsProfiles, undefined, 'My Bash')).toBe('posix');
    expect(taskShellKind('win32', windowsProfiles, undefined, 'Command Prompt')).toBe('cmd');
    expect(taskShellKind('win32', windowsProfiles, { path: 'pwsh.exe' }, 'Git Bash')).toBe('powershell');
    expect(taskShellKind('darwin', {}, null, undefined)).toBe('posix');
  });
});

describe('maven command', () => {
  const both = { mvnw: true, mvnwCmd: true };
  const none = { mvnw: false, mvnwCmd: false };
  it('spells the wrapper for each shell', () => {
    expect(mavenCommand(both, 'powershell', 'win32')).toBe('.\\mvnw.cmd');
    expect(mavenCommand(both, 'cmd', 'win32')).toBe('.\\mvnw.cmd');
    expect(mavenCommand(both, 'posix', 'win32')).toBe('./mvnw.cmd');
    expect(mavenCommand({ mvnw: true, mvnwCmd: false }, 'posix', 'win32')).toBe('./mvnw');
    expect(mavenCommand(both, 'posix', 'darwin')).toBe('./mvnw');
  });

  it('runs the Windows mvn script from Git Bash too', () => {
    expect(mavenCommand(none, 'powershell', 'win32')).toBe('mvn');
    expect(mavenCommand(none, 'posix', 'win32')).toBe('mvn.cmd');
    expect(mavenCommand(none, 'posix', 'linux')).toBe('mvn');
  });

  it('quotes what PowerShell would split', () => {
    expect(needsStrongQuoting('clean', 'powershell')).toBe(false);
    expect(needsStrongQuoting('-DskipTests', 'powershell')).toBe(false);
    expect(needsStrongQuoting('-Drevision=1.2', 'powershell')).toBe(true);
    expect(needsStrongQuoting('-Pdev,local', 'powershell')).toBe(true);
    expect(needsStrongQuoting('-Pdev,local', 'posix')).toBe(false);
    expect(needsStrongQuoting('-Dtest=A#m', 'posix')).toBe(true);
  });
});
