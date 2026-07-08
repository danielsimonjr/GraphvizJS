import { describe, expect, it } from 'vitest';
import { DOT_ATTRIBUTE_CATALOG, findAttribute } from '../../core/dot-catalog';
import { DOT_ATTRIBUTES } from '../../core/dot-vocab';

describe('dot-catalog', () => {
  it('every catalog attribute is a known DOT attribute', () => {
    const attrs = new Set(DOT_ATTRIBUTES.map((a) => a.toLowerCase()));
    for (const s of DOT_ATTRIBUTE_CATALOG) expect(attrs.has(s.name.toLowerCase())).toBe(true);
  });
  it('enum specs carry a non-empty value domain; non-enum do not', () => {
    for (const s of DOT_ATTRIBUTE_CATALOG) {
      if (s.type === 'enum') expect(s.values && s.values.length > 0).toBe(true);
      else expect(s.values).toBeUndefined();
    }
  });
  it('every spec has at least one context', () => {
    for (const s of DOT_ATTRIBUTE_CATALOG) expect(s.contexts.length).toBeGreaterThan(0);
  });
  it('findAttribute is case-insensitive', () => {
    expect(findAttribute('SHAPE')?.name.toLowerCase()).toBe('shape');
    expect(findAttribute('definitely-not-an-attr')).toBeUndefined();
  });
  it('covers the common enum attributes with their domains', () => {
    expect(findAttribute('shape')?.values).toEqual(
      expect.arrayContaining(['box', 'ellipse', 'record'])
    );
    expect(findAttribute('rankdir')?.values).toEqual(['TB', 'LR', 'BT', 'RL']);
    expect(findAttribute('dir')?.contexts).toContain('edge');
  });
});
