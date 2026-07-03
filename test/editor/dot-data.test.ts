import { describe, expect, it } from 'vitest';
import {
  DOT_ATTR_VALUES,
  DOT_ATTRIBUTES,
  DOT_COLORS,
  DOT_KEYWORDS,
  isColorAttribute,
} from '../../src/editor/dot-data';

describe('dot-data', () => {
  it('exposes the DOT keywords', () => {
    expect(DOT_KEYWORDS).toEqual(
      expect.arrayContaining(['graph', 'digraph', 'subgraph', 'node', 'edge', 'strict'])
    );
  });

  it('exposes attributes including shape and rankdir', () => {
    expect(DOT_ATTRIBUTES).toEqual(expect.arrayContaining(['shape', 'rankdir', 'label', 'color']));
  });

  it('maps attribute names to enum values', () => {
    expect(DOT_ATTR_VALUES.shape).toEqual(expect.arrayContaining(['box', 'ellipse', 'record']));
    expect(DOT_ATTR_VALUES.rankdir).toEqual(['TB', 'LR', 'BT', 'RL']);
    expect(DOT_ATTR_VALUES.dir).toEqual(
      expect.arrayContaining(['forward', 'back', 'both', 'none'])
    );
  });

  it('every DOT_ATTR_VALUES key is a known attribute', () => {
    for (const key of Object.keys(DOT_ATTR_VALUES)) {
      expect(DOT_ATTRIBUTES).toContain(key);
    }
  });

  it('identifies color-valued attributes', () => {
    expect(isColorAttribute('color')).toBe(true);
    expect(isColorAttribute('fillcolor')).toBe(true);
    expect(isColorAttribute('shape')).toBe(false);
    expect(DOT_COLORS).toEqual(expect.arrayContaining(['black', 'white', 'red', 'blue']));
  });
});
