import { describe, expect, it } from 'vitest';
import { offsetToLineCol } from '../../cli/index';

describe('offsetToLineCol', () => {
  it('maps offset 0 to line 1 column 1', () => {
    expect(offsetToLineCol('abc', 0)).toEqual({ line: 1, column: 1 });
  });

  it('counts columns within the first line', () => {
    expect(offsetToLineCol('abc', 2)).toEqual({ line: 1, column: 3 });
  });

  it('advances the line and resets the column after a newline', () => {
    // 'a\nbc' → offset 2 is 'b' at line 2 column 1
    expect(offsetToLineCol('a\nbc', 2)).toEqual({ line: 2, column: 1 });
    expect(offsetToLineCol('a\nbc', 3)).toEqual({ line: 2, column: 2 });
  });

  it('clamps an out-of-range offset to the end of the source', () => {
    expect(offsetToLineCol('ab', 999)).toEqual({ line: 1, column: 3 });
  });
});
