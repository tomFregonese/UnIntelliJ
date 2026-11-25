import { describe, expect, it } from 'vitest';
import { npmCommandLine, parseEnv, uniqueName } from '../../src/run/runConfigLogic';

describe('runConfigLogic', () => {
  it('parses IntelliJ-style environment variables', () => {
    expect(parseEnv('A=1; B = two ;bad;C=x=y')).toEqual({ A: '1', B: 'two', C: 'x=y' });
    expect(parseEnv('')).toEqual({});
  });

  it('passes arguments the way each package manager expects', () => {
    expect(npmCommandLine('npm', 'start')).toBe('npm run start');
    expect(npmCommandLine('npm', 'start', '--port 4300')).toBe('npm run start -- --port 4300');
    expect(npmCommandLine('yarn', 'start', '--port 4300')).toBe('yarn start --port 4300');
    expect(npmCommandLine('pnpm', 'start', ' ')).toBe('pnpm run start');
  });

  it('names copies like IntelliJ', () => {
    expect(uniqueName('start', [])).toBe('start');
    expect(uniqueName('start', ['start', 'start (1)'])).toBe('start (2)');
  });
});
