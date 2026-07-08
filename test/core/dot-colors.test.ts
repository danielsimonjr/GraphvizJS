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
  it('identifies pencolor as a color-valued attribute', () => {
    expect(isColorAttribute('pencolor')).toBe(true);
  });

  describe('canonical SVG/CSS named-color set (residual invalid-color FP fix)', () => {
    // Root cause of the residual FP: an incomplete color list lets nearest() misflag a
    // valid-but-unlisted color (e.g. coral, steelblue) as a typo of a listed one it sits
    // edit-distance <=2 from. This list must stay complete against the canonical
    // ~148-name SVG/CSS named-color set (also Graphviz's default color scheme).
    it('is the full canonical set (~148 names), no duplicates', () => {
      expect(DOT_COLORS.length).toBeGreaterThanOrEqual(148);
      expect(new Set(DOT_COLORS).size).toBe(DOT_COLORS.length);
    });

    it('includes colors that previously false-flagged as typos of a listed name', () => {
      expect(DOT_COLORS).toEqual(
        expect.arrayContaining([
          'coral',
          'steelblue',
          'crimson',
          'lightyellow',
          'lightblue',
          'darkgreen',
        ])
      );
    });
  });
});
