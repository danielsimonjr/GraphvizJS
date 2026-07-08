import { describe, expect, it } from 'vitest';
import { DOT_COLORS, isColorAttribute } from '../../core/dot-colors';

describe('dot-colors', () => {
  it('knows common colors', () => {
    expect(DOT_COLORS).toEqual(expect.arrayContaining(['black', 'red', 'blue']));
  });
  it('identifies color-valued attributes', () => {
    expect(isColorAttribute('fillcolor')).toBe(true);
    expect(isColorAttribute('shape')).toBe(false);
  });
});
