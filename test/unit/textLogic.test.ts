import { describe, expect, it } from 'vitest';
import { adjacentMethodLine, toggleCase } from '../../src/editor/textLogic';

describe('toggleCase', () => {
  it('upper-cases text containing lower-case letters', () => {
    expect(toggleCase('userName')).toBe('USERNAME');
    expect(toggleCase('MAX_retries')).toBe('MAX_RETRIES');
  });

  it('lower-cases text without lower-case letters', () => {
    expect(toggleCase('MAX_RETRIES')).toBe('max_retries');
    expect(toggleCase('42')).toBe('42');
  });
});

describe('adjacentMethodLine', () => {
  const lines = [30, 10, 20, 20];

  it('finds the next method strictly after the line', () => {
    expect(adjacentMethodLine(lines, 10, 'next')).toBe(20);
    expect(adjacentMethodLine(lines, 15, 'next')).toBe(20);
    expect(adjacentMethodLine(lines, 30, 'next')).toBeUndefined();
  });

  it('finds the previous method strictly before the line', () => {
    expect(adjacentMethodLine(lines, 20, 'previous')).toBe(10);
    expect(adjacentMethodLine(lines, 25, 'previous')).toBe(20);
    expect(adjacentMethodLine(lines, 10, 'previous')).toBeUndefined();
  });
});
