import { describe, expect, it } from 'vitest';
import { parseGraph, tokenizeDot } from '../../core/parse-graph';

const kinds = (src: string) => tokenizeDot(src).map((t) => `${t.kind}:${t.value}`);

describe('tokenizeDot', () => {
  it('tokenizes a simple directed edge', () => {
    expect(kinds('digraph { a -> b }')).toEqual([
      'id:digraph',
      'lbrace:{',
      'id:a',
      'edgeop:->',
      'id:b',
      'rbrace:}',
    ]);
  });

  it('treats -- as one edge op', () => {
    expect(kinds('graph { a -- b }')).toContain('edgeop:--');
  });

  it('unquotes string ids and concatenates with +', () => {
    expect(kinds('digraph { "a b" -> "c" + "d" }')).toEqual([
      'id:digraph',
      'lbrace:{',
      'id:a b',
      'edgeop:->',
      'id:cd',
      'rbrace:}',
    ]);
  });

  it('collapses ports and compass points to the head id', () => {
    expect(kinds('digraph { a:p:sw -> b:e }')).toEqual([
      'id:digraph',
      'lbrace:{',
      'id:a',
      'edgeop:->',
      'id:b',
      'rbrace:}',
    ]);
  });

  it('keeps an HTML label span as a single id token', () => {
    const t = tokenizeDot('digraph { a [label=<<b>x</b>>] }');
    expect(t.some((x) => x.kind === 'id' && x.value.startsWith('<') && x.value.endsWith('>'))).toBe(
      true
    );
  });

  it('skips comments and never throws on garbage', () => {
    expect(() => tokenizeDot('digraph { a // c\n -> b } /* x')).not.toThrow();
    expect(kinds('digraph { a // hi\n -> b }')).toEqual([
      'id:digraph',
      'lbrace:{',
      'id:a',
      'edgeop:->',
      'id:b',
      'rbrace:}',
    ]);
  });

  it('emits eq for attribute assignments', () => {
    expect(kinds('digraph { rankdir = LR }')).toEqual([
      'id:digraph',
      'lbrace:{',
      'id:rankdir',
      'eq:=',
      'id:LR',
      'rbrace:}',
    ]);
  });

  it('classifies brackets, braces, and separators by kind', () => {
    expect(kinds('digraph { a [k=v]; b, c }')).toEqual([
      'id:digraph',
      'lbrace:{',
      'id:a',
      'lbracket:[',
      'id:k',
      'eq:=',
      'id:v',
      'rbracket:]',
      'semi:;',
      'id:b',
      'comma:,',
      'id:c',
      'rbrace:}',
    ]);
  });
});

describe('parseGraph', () => {
  it('reads directed/strict from the header', () => {
    expect(parseGraph('strict digraph G { }')).toMatchObject({ directed: true, strict: true });
    expect(parseGraph('graph { }')).toMatchObject({ directed: false, strict: false });
  });

  it('collects distinct nodes in first-seen order (implicit on edges)', () => {
    const m = parseGraph('digraph { a -> b -> c; a }');
    expect(m.nodes).toEqual(['a', 'b', 'c']);
    expect(m.edges).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
  });

  it('does not count attribute-list contents or default-attr statements as nodes', () => {
    const m = parseGraph('digraph { node [shape=box]; edge [color=red]; a [label="x"] -> b }');
    expect(m.nodes).toEqual(['a', 'b']);
    // An attribute list attached directly to the left endpoint (before the edge
    // operator) terminates that statement in parseGraph's grammar, so the `-> b`
    // that follows is not chained onto `a` as an edge. `a` and `b` are still
    // collected as nodes (see assertion above); no edge is recorded here.
    expect(m.edges).toEqual([]);
  });

  it('treats a bare id=id as a graph attribute, not a node', () => {
    const m = parseGraph('digraph { rankdir=LR; bgcolor="white"; a -> b }');
    expect(m.nodes).toEqual(['a', 'b']);
  });

  it('counts a node literally named node when used as an endpoint', () => {
    const m = parseGraph('digraph { node -> x }');
    expect(m.nodes).toEqual(['node', 'x']);
  });

  it('records subgraphs and detects clusters by name prefix', () => {
    const m = parseGraph('digraph { subgraph cluster_0 { a; b } subgraph s1 { c } }');
    expect(m.subgraphs).toEqual([
      { name: 'cluster_0', isCluster: true },
      { name: 's1', isCluster: false },
    ]);
    expect(m.nodes).toEqual(['a', 'b', 'c']);
  });

  it('expands a subgraph endpoint to the cross product', () => {
    const m = parseGraph('digraph { {a b} -> c }');
    expect(m.edges).toEqual([
      { from: 'a', to: 'c' },
      { from: 'b', to: 'c' },
    ]);
    expect(m.nodes).toEqual(['a', 'b', 'c']);
    expect(m.subgraphs).toEqual([{ name: undefined, isCluster: false }]);
  });

  it('records edges when a trailing attribute list follows the chain', () => {
    const m1 = parseGraph('digraph { a -> b [label="x"] }');
    expect(m1.nodes).toEqual(['a', 'b']);
    expect(m1.edges).toEqual([{ from: 'a', to: 'b' }]);

    const m2 = parseGraph('digraph { a -> b -> c [color=red] }');
    expect(m2.nodes).toEqual(['a', 'b', 'c']);
    expect(m2.edges).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
  });

  it('never throws on malformed input', () => {
    expect(() => parseGraph('digraph { a -> ')).not.toThrow();
    expect(() => parseGraph('')).not.toThrow();
    expect(() => parseGraph('not dot at all')).not.toThrow();
  });

  it('does not throw on pathologically deep nesting (zero-throw invariant)', () => {
    const deep = `digraph {${' subgraph {'.repeat(5000)}${' }'.repeat(5000)} }`;
    expect(() => parseGraph(deep)).not.toThrow();
  });
});
