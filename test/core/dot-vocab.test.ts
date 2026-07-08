import { describe, expect, it } from 'vitest';
import { DOT_ATTRIBUTES, DOT_KEYWORDS } from '../../core/dot-vocab';

describe('dot-vocab', () => {
  it('exposes the core DOT keywords', () => {
    expect(DOT_KEYWORDS).toContain('digraph');
    expect(DOT_KEYWORDS).toContain('subgraph');
  });

  it('exposes common DOT attributes, lowercased-unique', () => {
    expect(DOT_ATTRIBUTES).toContain('color');
    expect(DOT_ATTRIBUTES).toContain('label');
    const lower = DOT_ATTRIBUTES.map((a) => a.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });
});
