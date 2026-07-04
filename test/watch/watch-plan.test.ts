import { describe, expect, it } from 'vitest';
import { dirDiff, groupByDir } from '../../src/watch/watch-plan';

describe('groupByDir', () => {
  it('groups basenames under their parent directory', () => {
    const g = groupByDir(['C:/a/x.dot', 'C:/a/y.dot', 'C:/b/z.dot']);
    expect(new Set(g['C:/a'])).toEqual(new Set(['x.dot', 'y.dot']));
    expect(g['C:/b']).toEqual(['z.dot']);
  });
  it('handles an empty list', () => {
    expect(groupByDir([])).toEqual({});
  });
  it('normalizes backslashes so Windows paths group correctly', () => {
    const g = groupByDir(['C:\\a\\x.dot', 'C:/a/y.dot']);
    expect(Object.keys(g)).toEqual(['C:/a']);
    expect(new Set(g['C:/a'])).toEqual(new Set(['x.dot', 'y.dot']));
  });
});

describe('dirDiff', () => {
  it('computes directories to start and stop watching', () => {
    expect(dirDiff(['C:/a', 'C:/b'], ['C:/b', 'C:/c'])).toEqual({
      toWatch: ['C:/c'],
      toUnwatch: ['C:/a'],
    });
  });
  it('is empty when unchanged', () => {
    expect(dirDiff(['C:/a'], ['C:/a'])).toEqual({ toWatch: [], toUnwatch: [] });
  });
});
