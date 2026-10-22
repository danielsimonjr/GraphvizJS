import { describe, expect, it } from 'vitest';
import { DOT_ATTRIBUTE_CATALOG } from '../../core/dot-catalog';
import { DOT_COLORS, isColorAttribute } from '../../core/dot-colors';
import { buildDotVocabulary, DOT_ATTRIBUTES, DOT_KEYWORDS } from '../../core/dot-vocab';

describe('dot-vocab', () => {
  it('exposes the DOT keywords', () => {
    expect(DOT_KEYWORDS).toEqual(
      expect.arrayContaining(['graph', 'digraph', 'subgraph', 'node', 'edge', 'strict'])
    );
  });

  it('exposes attributes including shape, rankdir, label, color', () => {
    expect(DOT_ATTRIBUTES).toEqual(expect.arrayContaining(['shape', 'rankdir', 'label', 'color']));
  });

  it('includes compound-graph and common attributes (no false-unknown)', () => {
    expect(DOT_ATTRIBUTES).toEqual(
      expect.arrayContaining(['ltail', 'lhead', 'weight', 'constraint', 'penwidth', 'nodesep'])
    );
  });

  it('lists attributes lowercased-unique', () => {
    const lower = DOT_ATTRIBUTES.map((a) => a.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });
});

describe('buildDotVocabulary', () => {
  it('carries the keywords, the attribute names and the named colors', () => {
    const vocab = buildDotVocabulary();
    expect(vocab.keywords).toEqual([...DOT_KEYWORDS]);
    expect(vocab.attributes).toEqual([...DOT_ATTRIBUTES]);
    expect(vocab.colors).toEqual([...DOT_COLORS]);
  });

  it('maps each enum attribute of the catalog to its value domain', () => {
    const { attributeValues } = buildDotVocabulary();
    expect(attributeValues.shape).toEqual(expect.arrayContaining(['box', 'ellipse', 'record']));
    const enums = DOT_ATTRIBUTE_CATALOG.filter((spec) => spec.type === 'enum' && spec.values);
    expect(Object.keys(attributeValues).sort()).toEqual(enums.map((spec) => spec.name).sort());
  });

  it('names the color attributes, pencolor included', () => {
    const { colorAttributes } = buildDotVocabulary();
    expect(colorAttributes).toEqual(
      expect.arrayContaining(['color', 'bgcolor', 'fillcolor', 'fontcolor', 'pencolor'])
    );
  });

  it('names exactly the catalog attributes of type color', () => {
    const fromCatalog = DOT_ATTRIBUTE_CATALOG.filter((spec) => spec.type === 'color').map(
      (spec) => spec.name
    );
    expect([...buildDotVocabulary().colorAttributes].sort()).toEqual(fromCatalog.sort());
  });

  it('names only attributes that the lint treats as colors and the vocabulary lists', () => {
    const { colorAttributes, attributes } = buildDotVocabulary();
    for (const name of colorAttributes) {
      expect(isColorAttribute(name)).toBe(true);
      expect(attributes).toContain(name);
    }
  });

  it('returns lists that the caller may change without changing the constants', () => {
    const vocab = buildDotVocabulary();
    vocab.keywords.push('extra');
    vocab.colorAttributes.push('extra');
    expect(buildDotVocabulary().keywords).not.toContain('extra');
    expect(buildDotVocabulary().colorAttributes).not.toContain('extra');
  });
});
