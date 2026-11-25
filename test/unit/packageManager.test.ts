import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectPackageManager, scriptCommandLine } from '../../src/run/packageManager';

describe('detectPackageManager', () => {
  const root = mkdtempSync(join(tmpdir(), 'unintellij-pm-'));
  const app = join(root, 'apps', 'web');
  mkdirSync(app, { recursive: true });

  it('defaults to npm', () => {
    expect(detectPackageManager(app, root)).toBe('npm');
  });

  it('finds a lock file in a parent directory up to the root', () => {
    writeFileSync(join(root, 'pnpm-lock.yaml'), '');
    expect(detectPackageManager(app, root)).toBe('pnpm');
  });

  it('prefers the closest lock file', () => {
    writeFileSync(join(app, 'yarn.lock'), '');
    expect(detectPackageManager(app, root)).toBe('yarn');
  });
});

describe('scriptCommandLine', () => {
  it('uses the package manager syntax', () => {
    expect(scriptCommandLine('npm', 'start')).toBe('npm run start');
    expect(scriptCommandLine('pnpm', 'build')).toBe('pnpm run build');
    expect(scriptCommandLine('yarn', 'test')).toBe('yarn test');
  });
});
