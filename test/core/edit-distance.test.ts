import { describe, expect, it } from 'vitest';
import { editDistance, nearest } from '../../core/edit-distance';

describe('editDistance', () => {
  it('is 0 for identical strings', () => {
    expect(editDistance('shape', 'shape')).toBe(0);
    expect(editDistance('', '')).toBe(0);
  });

  it('counts a single substitution as 1', () => {
    expect(editDistance('shape', 'shaqe')).toBe(1);
  });

  it('counts a single insertion as 1', () => {
    expect(editDistance('shpe', 'shape')).toBe(1);
  });

  it('counts a single deletion as 1', () => {
    expect(editDistance('shape', 'shpe')).toBe(1);
  });

  it('handles a short typo against the full word', () => {
    expect(editDistance('shp', 'shape')).toBe(2);
  });

  it('is symmetric', () => {
    expect(editDistance('kitten', 'sitting')).toBe(editDistance('sitting', 'kitten'));
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });

  it('equals the length of the other string when one is empty', () => {
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', '')).toBe(3);
  });
});

describe('nearest', () => {
  it('returns the unique nearest candidate within maxDistance', () => {
    expect(nearest('shp', ['shape', 'style', 'color'])).toBe('shape');
  });

  it('returns undefined when nothing is within maxDistance', () => {
    expect(nearest('zzzz', ['shape'])).toBeUndefined();
  });

  it('returns undefined on a tie between two candidates at the minimum distance', () => {
    // 'cat' -> 'cot' and 'cut' are both distance 1
    expect(nearest('cat', ['cot', 'cut'])).toBeUndefined();
  });

  it('returns the candidate itself when it matches exactly', () => {
    expect(nearest('color', ['color', 'colour'])).toBe('color');
  });

  it('respects a custom maxDistance', () => {
    expect(nearest('shp', ['shape'], 1)).toBeUndefined();
    expect(nearest('shp', ['shape'], 2)).toBe('shape');
  });
});
