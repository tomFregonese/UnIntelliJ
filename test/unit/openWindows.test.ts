import { describe, expect, it } from 'vitest';
import { updateWindows } from '../../src/project/openWindows';

describe('updateWindows', () => {
  const windows = [
    { uri: 'file:///a', label: 'a', pid: 1 },
    { uri: 'file:///b', label: 'b', pid: 2 },
    { uri: 'file:///c', label: 'c', pid: 3 },
  ];

  it('replaces the entry of the window and drops closed windows', () => {
    expect(updateWindows(windows, 2, { uri: 'file:///d', label: 'd' }, (pid) => pid !== 3)).toEqual([
      { uri: 'file:///a', label: 'a', pid: 1 },
      { uri: 'file:///d', label: 'd', pid: 2 },
    ]);
  });

  it('removes the entry of a window closing', () => {
    expect(updateWindows(windows, 1, undefined, () => true).map((w) => w.pid)).toEqual([2, 3]);
  });
});
