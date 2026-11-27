import { describe, expect, it } from 'vitest';
import { matchRanges, pickMatch, speedSearchMatch, step } from '../../src/search/speedSearch';

describe('speedSearchMatch', () => {
  it('prefers a contiguous match, else letters in order', () => {
    expect(speedSearchMatch('truc', 't_gts_bitrucmuche')).toEqual([8, 9, 10, 11]);
    expect(speedSearchMatch('gtsbi', 't_gts_bitrucmuche')).toEqual([2, 3, 4, 6, 7]);
    expect(speedSearchMatch('GTS', 't_gts_bitrucmuche')).toEqual([2, 3, 4]);
    expect(speedSearchMatch('gts_bi', 'gtsbitruc')).toEqual([0, 1, 2, 3, 4]);
    expect(speedSearchMatch('xyz', 'orders')).toBeUndefined();
    expect(speedSearchMatch('', 'orders')).toBeUndefined();
  });

  it('merges positions into ranges', () => {
    expect(matchRanges([2, 3, 4, 6, 7])).toEqual([
      [2, 5],
      [6, 8],
    ]);
  });
});

describe('match navigation', () => {
  const matches = [false, true, false, true];
  it('keeps the current match, else goes to the next one', () => {
    expect(pickMatch(matches, 3)).toBe(3);
    expect(pickMatch(matches, 2)).toBe(3);
    expect(pickMatch(matches, -1)).toBe(1);
    expect(pickMatch([false, false], 0)).toBe(-1);
  });

  it('steps forward and backward, wrapping', () => {
    expect(step(matches, 3, 1)).toBe(1);
    expect(step(matches, 1, -1)).toBe(3);
    expect(step(matches, -1, -1)).toBe(3);
  });
});
