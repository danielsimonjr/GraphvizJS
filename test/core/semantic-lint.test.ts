import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { semanticDiagnostics } from '../../core/semantic-lint';

const codes = (src: string) => semanticDiagnostics(src).map((d) => d.code);

const EXAMPLES_DIR = join(__dirname, '../../src/examples');
const exampleFiles = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.dot'));

describe('semanticDiagnostics', () => {
  it('flags a near-miss typo enum value', () => {
    // 'boxx' is a one-letter typo of the valid shape 'box' — a real "did you mean" catch.
    const diags = semanticDiagnostics('a [shape=boxx];');
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('invalid-value');
    expect(diags[0].severity).toBe('warning');
    expect(diags[0].message).toMatch(/boxx/);
    expect(diags[0].fix?.text).toBe('box');
  });

  it('does not flag a valid enum value', () => {
    expect(semanticDiagnostics('a [shape=box];')).toEqual([]);
  });

  it('flags an invalid color name', () => {
    const diags = semanticDiagnostics('a [color=rd];');
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('invalid-color');
  });

  it('attaches a fix suggesting the nearest valid color', () => {
    const diags = semanticDiagnostics('a [color=rd];');
    expect(diags[0].fix?.text).toBe('red');
    expect(diags[0].fix?.label).toMatch(/rd/);
    expect(diags[0].fix?.label).toMatch(/red/);
  });

  it('does not flag a valid named color', () => {
    expect(semanticDiagnostics('a [color=red];')).toEqual([]);
  });

  it('does not flag a valid quoted hex color', () => {
    expect(semanticDiagnostics('a [color="#ff0000"];')).toEqual([]);
  });

  it('does not flag a valid unquoted hex color', () => {
    expect(semanticDiagnostics('a [color=#ff0000];')).toEqual([]);
  });

  it('suggests a did-you-mean fix for a typo enum value', () => {
    // `rankdir` is graph-only, so `a [rankdir=TP]` also trips wrong-context (asserted
    // separately below) — filter to the invalid-value diagnostic under test here.
    const diags = semanticDiagnostics('a [rankdir=TP];');
    const invalidValue = diags.find((d) => d.code === 'invalid-value');
    expect(invalidValue).toBeDefined();
    expect(invalidValue?.fix?.text).toBe('TB');
  });

  it('does not value-check a string-typed attribute', () => {
    expect(semanticDiagnostics('a [label="anything goes"];')).toEqual([]);
  });

  it('does not flag unquoted string-typed attribute values either', () => {
    expect(semanticDiagnostics('a [label=anything];')).toEqual([]);
  });

  it('does not check unknown attributes', () => {
    expect(semanticDiagnostics('a [shp=blorp];')).toEqual([]);
  });

  it('reports nothing for valid, unrelated DOT', () => {
    expect(semanticDiagnostics('digraph { a -> b; a [shape=box, color=blue]; }')).toEqual([]);
  });

  it('ignores color-looking text inside strings', () => {
    expect(semanticDiagnostics('a [label="color=zz"];')).toEqual([]);
  });

  it('finds multiple invalid entries across one list', () => {
    expect(codes('a [shape=boxx, color=rd];')).toEqual(
      expect.arrayContaining(['invalid-value', 'invalid-color'])
    );
  });

  describe('invalid-value / invalid-color false positives (C1/C2 regression)', () => {
    // Root cause: DOT_ATTRIBUTE_CATALOG enum tables and DOT_COLORS are small transcribed
    // subsets of what Graphviz actually accepts — flagging any unmatched value as invalid
    // (the old behavior) flags a huge amount of valid DOT. The fix gates both rules on
    // nearest() finding a close match: only a near-miss typo of a KNOWN value is flagged;
    // an unlisted-but-valid value has no close match and stays silent.
    it.each([
      ['a [shape=square];', 'an unlisted-but-valid shape'],
      ['a [color=coral];', 'an unlisted-but-valid color'],
      ['node [fillcolor=lightyellow];', 'an unlisted-but-valid fillcolor'],
      ['a -> b [arrowhead=onormal];', 'a composable arrowhead value'],
      ['edge [style=tapered];', 'an unlisted-but-valid style'],
      ['graph [ratio=0.7];', 'a numeric ratio value'],
    ])('stays silent for %s (%s)', (src) => {
      const diags = semanticDiagnostics(src).filter(
        (d) => d.code === 'invalid-value' || d.code === 'invalid-color'
      );
      expect(diags).toEqual([]);
    });

    it('stays silent for an enum value with no close match at all (e.g. a typo far from box)', () => {
      // Distinguishes "no near match → silent" from "near match → flagged": 'blorp' is
      // edit-distance >2 from every SHAPE_VALUES entry, so unlike 'boxx' above it must
      // NOT be flagged.
      expect(semanticDiagnostics('a [shape=blorp];')).toEqual([]);
    });

    it('still flags a near-miss color typo with a fix (rd -> red)', () => {
      const diags = semanticDiagnostics('a [color=rd];');
      expect(diags).toHaveLength(1);
      expect(diags[0].code).toBe('invalid-color');
      expect(diags[0].fix?.text).toBe('red');
    });

    it('still flags a near-miss enum typo with a fix (rankdir=TP -> TB)', () => {
      const diags = semanticDiagnostics('a [rankdir=TP];').filter(
        (d) => d.code === 'invalid-value'
      );
      expect(diags).toHaveLength(1);
      expect(diags[0].fix?.text).toBe('TB');
    });

    it('does not flag invalid-value on any real example diagram', () => {
      expect(exampleFiles.length).toBeGreaterThan(0);
      for (const file of exampleFiles) {
        const src = readFileSync(join(EXAMPLES_DIR, file), 'utf-8');
        const invalidValue = semanticDiagnostics(src).filter((d) => d.code === 'invalid-value');
        expect(invalidValue, `${file} should have no invalid-value diagnostics`).toEqual([]);
      }
    });

    it('does not flag invalid-color on any real example diagram', () => {
      expect(exampleFiles.length).toBeGreaterThan(0);
      for (const file of exampleFiles) {
        const src = readFileSync(join(EXAMPLES_DIR, file), 'utf-8');
        const invalidColor = semanticDiagnostics(src).filter((d) => d.code === 'invalid-color');
        expect(invalidColor, `${file} should have no invalid-color diagnostics`).toEqual([]);
      }
    });
  });

  describe('invalid-value / invalid-color residual false positives (domain-completeness fix)', () => {
    // Root cause of the residual: the C1/C2 fix gated invalid-value/invalid-color on
    // nearest() to stop flagging far-unlisted values, but the enum/color domains were
    // still INCOMPLETE — so a VALID value that happens to sit edit-distance <=2 from a
    // listed value (e.g. `Mdiamond` vs `diamond`, `gray0` vs `gray`) was still misflagged
    // as a typo. This fix completes the closed domains (shape, style, ...) and colors, and
    // retypes truly open-ended attributes (ratio, overlap) to 'other' so they're never
    // enum-checked at all. Every value below must now be silent.
    it.each([
      ['a [shape=Mdiamond];', 'the valid M-variant shape Mdiamond (near diamond)'],
      ['a [shape=Mcircle];', 'the valid M-variant shape Mcircle (near circle)'],
      ['a [shape=Msquare];', 'the valid M-variant shape Msquare'],
      ['a [shape=rect];', 'the valid shape synonym rect'],
      ['a [shape=rectangle];', 'the valid shape synonym rectangle'],
      ['a [shape=square];', 'the valid shape square'],
      ['edge [style=tapered];', 'the valid style tapered'],
      ['a -> b [arrowhead=onormal];', 'a composable arrowhead value'],
      ['graph [ratio=0.7];', 'a numeric ratio value (open-ended, not enum-checked)'],
      ['graph [overlap=scalexy];', 'a keyword overlap value (open-ended, not enum-checked)'],
      ['a [color=coral];', 'the valid SVG color coral'],
      ['node [fillcolor=lightyellow];', 'the valid SVG color lightyellow'],
      ['a [fontcolor=crimson];', 'the valid SVG color crimson'],
      ['a [color=steelblue];', 'the valid SVG color steelblue (near blue)'],
      ['a [color=gray0];', 'the valid X11 numbered variant gray0 (near gray)'],
      ['a [color="#ff0000"];', 'a valid quoted hex color'],
    ])('stays silent for %s (%s)', (src) => {
      const diags = semanticDiagnostics(src).filter(
        (d) => d.code === 'invalid-value' || d.code === 'invalid-color'
      );
      expect(diags).toEqual([]);
    });

    it.each([
      ['a [rankdir=TP];', 'TB'],
      ['a [color=rd];', 'red'],
      ['a [shape=boxx];', 'box'],
    ])('still flags a genuine typo for %s with fix -> %s', (src, expectedFix) => {
      const diags = semanticDiagnostics(src).filter(
        (d) => d.code === 'invalid-value' || d.code === 'invalid-color'
      );
      expect(diags).toHaveLength(1);
      expect(diags[0].fix?.text).toBe(expectedFix);
    });
  });

  describe('wrong-context', () => {
    it('flags a node-only attribute used on an edge', () => {
      const diags = semanticDiagnostics('digraph { a -> b [shape=box]; }');
      const wrongContext = diags.filter((d) => d.code === 'wrong-context');
      expect(wrongContext).toHaveLength(1);
      expect(wrongContext[0].severity).toBe('warning');
      expect(wrongContext[0].message).toMatch(/shape/);
      expect(wrongContext[0].fix).toBeUndefined();
    });

    it('flags a graph-only attribute used on a node', () => {
      const diags = semanticDiagnostics('x [rankdir=LR];');
      const wrongContext = diags.filter((d) => d.code === 'wrong-context');
      expect(wrongContext).toHaveLength(1);
      expect(wrongContext[0].message).toMatch(/rankdir/);
    });

    it('does not flag a graph-only attribute used via the graph keyword', () => {
      expect(codes('graph [rankdir=LR];')).not.toContain('wrong-context');
    });

    it('flags a node-only attribute set via the graph keyword at brace-depth 1', () => {
      // `graph [...]` at the top-level digraph body classifies as 'graph' context
      // (braceDepth === 1); `shape` is node-only, so this is a genuine wrong-context.
      const diags = semanticDiagnostics('digraph { graph [shape=box] }').filter(
        (d) => d.code === 'wrong-context'
      );
      expect(diags).toHaveLength(1);
      expect(diags[0].message).toMatch(/shape/);
    });

    it('does not flag valid contexts in a small realistic diagram', () => {
      const src =
        'digraph { rankdir=LR; a [shape=box]; a -> b [color=red]; ' +
        'subgraph cluster0 { label="c" } }';
      expect(codes(src)).not.toContain('wrong-context');
    });

    it('does not flag wrong-context on any real example diagram', () => {
      expect(exampleFiles.length).toBeGreaterThan(0);
      for (const file of exampleFiles) {
        const src = readFileSync(join(EXAMPLES_DIR, file), 'utf-8');
        const wrongContext = semanticDiagnostics(src).filter((d) => d.code === 'wrong-context');
        expect(wrongContext, `${file} should have no wrong-context diagnostics`).toEqual([]);
      }
    });

    it('does not flag a cluster-scoped graph attribute set via the graph keyword', () => {
      const src = 'digraph { subgraph cluster0 { graph [pencolor=red]; a; b; a -> b; } }';
      expect(codes(src).filter((c) => c === 'wrong-context')).toEqual([]);
    });

    it('does not flag another cluster-scoped graph attribute (peripheries)', () => {
      const src = 'digraph { subgraph cluster0 { graph [peripheries=2]; a; b; } }';
      expect(codes(src).filter((c) => c === 'wrong-context')).toEqual([]);
    });

    it('does not flag a graph attribute set via the graph keyword in an anonymous subgraph', () => {
      const src = 'digraph { { graph [rank=same]; a; b; } a -> b; }';
      expect(codes(src).filter((c) => c === 'wrong-context')).toEqual([]);
    });

    it('still flags a node-only attribute on an edge (regression guard)', () => {
      const diags = semanticDiagnostics('a -> b [shape=box]');
      const wrongContext = diags.filter((d) => d.code === 'wrong-context');
      expect(wrongContext).toHaveLength(1);
      expect(wrongContext[0].message).toMatch(/shape/);
    });

    it('still flags a graph-only attribute used on a node (regression guard)', () => {
      const diags = semanticDiagnostics('x [rankdir=LR];');
      const wrongContext = diags.filter((d) => d.code === 'wrong-context');
      expect(wrongContext).toHaveLength(1);
      expect(wrongContext[0].message).toMatch(/rankdir/);
    });
  });

  describe('duplicate-attribute', () => {
    it('flags the second occurrence of a repeated attribute in one list', () => {
      const src = 'a [color=red, color=blue]';
      const diags = semanticDiagnostics(src).filter((d) => d.code === 'duplicate-attribute');
      expect(diags).toHaveLength(1);
      expect(diags[0].severity).toBe('warning');
      expect(diags[0].fix).toBeUndefined();
      expect(diags[0].message).toMatch(/color/);
      // Flagged on the SECOND occurrence, not the first.
      const secondColorOffset = src.lastIndexOf('color');
      expect(diags[0].from).toBe(secondColorOffset);
      expect(diags[0].to).toBe(secondColorOffset + 'color'.length);
    });

    it('does not flag distinct attributes in one list', () => {
      expect(codes('a [color=red, shape=box]')).not.toContain('duplicate-attribute');
    });

    it('flags every repeat when an attribute appears three or more times', () => {
      const diags = semanticDiagnostics('a [color=red, color=blue, color=green]').filter(
        (d) => d.code === 'duplicate-attribute'
      );
      expect(diags).toHaveLength(2);
    });

    it('does not carry duplicate state across separate attribute lists', () => {
      expect(codes('a -> b [color=red] [color=blue]')).not.toContain('duplicate-attribute');
    });

    it('does not flag duplicate-attribute on any real example diagram', () => {
      expect(exampleFiles.length).toBeGreaterThan(0);
      for (const file of exampleFiles) {
        const src = readFileSync(join(EXAMPLES_DIR, file), 'utf-8');
        const dup = semanticDiagnostics(src).filter((d) => d.code === 'duplicate-attribute');
        expect(dup, `${file} should have no duplicate-attribute diagnostics`).toEqual([]);
      }
    });
  });

  describe('undefined-cluster', () => {
    it('flags lhead referencing an undeclared cluster', () => {
      const diags = semanticDiagnostics('a -> b [lhead=cluster9]').filter(
        (d) => d.code === 'undefined-cluster'
      );
      expect(diags).toHaveLength(1);
      expect(diags[0].severity).toBe('warning');
      expect(diags[0].fix).toBeUndefined();
      expect(diags[0].message).toMatch(/cluster9/);
    });

    it('does not flag lhead when the cluster is declared', () => {
      const src = 'digraph { subgraph cluster9 {} a -> b [lhead=cluster9]; }';
      expect(codes(src)).not.toContain('undefined-cluster');
    });

    it('does not flag ltail when the cluster is declared later in the file', () => {
      const src = 'digraph { a -> b [ltail=cluster9]; subgraph cluster9 {} }';
      expect(codes(src)).not.toContain('undefined-cluster');
    });

    it('flags ltail referencing an undeclared cluster', () => {
      expect(codes('a -> b [ltail=missing]')).toContain('undefined-cluster');
    });

    it('does not flag a quoted subgraph declaration as undeclared', () => {
      const src = 'digraph { subgraph "cluster9" {} a -> b [lhead=cluster9]; }';
      expect(codes(src)).not.toContain('undefined-cluster');
    });

    it('does not flag lhead when a comment sits between subgraph and its name', () => {
      const src = 'digraph { subgraph /* c */ cluster9 { a; } a -> b [lhead=cluster9]; }';
      expect(codes(src)).not.toContain('undefined-cluster');
    });

    it('does not flag lhead when a comment sits between subgraph and a quoted name', () => {
      const src = 'digraph { subgraph /* c */ "cluster9" { a; } a -> b [lhead=cluster9]; }';
      expect(codes(src)).not.toContain('undefined-cluster');
    });

    it('does not flag lhead/ltail values inside a small realistic diagram with clusters', () => {
      const src =
        'digraph { subgraph cluster0 { a; b; } subgraph cluster1 { c; d; } ' +
        'a -> c [lhead=cluster1, ltail=cluster0]; }';
      expect(codes(src)).not.toContain('undefined-cluster');
    });

    it('does not flag undefined-cluster on any real example diagram', () => {
      expect(exampleFiles.length).toBeGreaterThan(0);
      for (const file of exampleFiles) {
        const src = readFileSync(join(EXAMPLES_DIR, file), 'utf-8');
        const undef = semanticDiagnostics(src).filter((d) => d.code === 'undefined-cluster');
        expect(undef, `${file} should have no undefined-cluster diagnostics`).toEqual([]);
      }
    });
  });
});
