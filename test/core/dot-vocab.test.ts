import { describe, expect, it } from 'vitest';
import { DOT_ATTRIBUTES, DOT_KEYWORDS } from '../../core/dot-vocab';

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
