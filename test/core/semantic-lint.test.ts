import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { semanticDiagnostics } from '../../core/semantic-lint';

const codes = (src: string) => semanticDiagnostics(src).map((d) => d.code);

const EXAMPLES_DIR = join(__dirname, '../../src/examples');
const exampleFiles = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.dot'));

describe('semanticDiagnostics', () => {
  it('flags an invalid enum value', () => {
    const diags = semanticDiagnostics('a [shape=blorp];');
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('invalid-value');
    expect(diags[0].severity).toBe('warning');
    expect(diags[0].message).toMatch(/blorp/);
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
    expect(codes('a [shape=blorp, color=rd];')).toEqual(
      expect.arrayContaining(['invalid-value', 'invalid-color'])
    );
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
});
