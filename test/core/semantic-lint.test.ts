import { describe, expect, it } from 'vitest';
import { semanticDiagnostics } from '../../core/semantic-lint';

const codes = (src: string) => semanticDiagnostics(src).map((d) => d.code);

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
    const diags = semanticDiagnostics('a [rankdir=TP];');
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('invalid-value');
    expect(diags[0].fix?.text).toBe('TB');
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
});
