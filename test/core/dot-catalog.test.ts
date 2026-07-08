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

  describe('closed-domain completeness (residual invalid-value/invalid-color FP fix)', () => {
    // These enum domains must stay COMPLETE against the canonical Graphviz tables: an
    // incomplete closed domain is exactly what lets nearest() misflag a valid-but-unlisted
    // value (e.g. Mdiamond, gray0) as a typo of a listed one. Any future addition to these
    // canonical Graphviz value sets should be added here too.
    it('shape includes the full standard node-shape list, including the M-variants and rect synonyms', () => {
      const values = findAttribute('shape')?.values ?? [];
      expect(values).toEqual(
        expect.arrayContaining([
          'Mdiamond',
          'Msquare',
          'Mcircle',
          'rect',
          'rectangle',
          'square',
          'invhouse',
          'record',
          'Mrecord',
        ])
      );
    });

    it('style includes tapered', () => {
      expect(findAttribute('style')?.values).toEqual(expect.arrayContaining(['tapered']));
    });

    it('dir/rankdir/rank/splines carry their canonical closed domains', () => {
      expect(findAttribute('dir')?.values).toEqual(['forward', 'back', 'both', 'none']);
      expect(findAttribute('rank')?.values).toEqual(['same', 'min', 'source', 'max', 'sink']);
      expect(findAttribute('splines')?.values).toEqual(
        expect.arrayContaining([
          'none',
          'false',
          'line',
          'polyline',
          'curved',
          'ortho',
          'spline',
          'true',
        ])
      );
    });
  });

  describe('open-ended attributes are not enum-checked (residual FP fix)', () => {
    // ratio/overlap accept a value space (numeric + many keywords) too open-ended for a
    // closed enum table without either being wrong or unbounded — typed 'other' so
    // invalid-value never checks them at all. A missed lint here is an acceptable
    // false-negative; false-flagging a valid value is not.
    it.each(['ratio', 'overlap'])("%s is typed 'other', not 'enum'", (name) => {
      const spec = findAttribute(name);
      expect(spec?.type).toBe('other');
      expect(spec?.values).toBeUndefined();
    });
  });
});
