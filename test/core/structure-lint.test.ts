import { describe, expect, it } from 'vitest';
import { structuralDiagnostics } from '../../core/structure-lint';

const messages = (src: string) => structuralDiagnostics(src).map((d) => d.message);

describe('structuralDiagnostics', () => {
  it('reports nothing for valid DOT', () => {
    expect(structuralDiagnostics('digraph { a -> b; a [shape=box]; }')).toEqual([]);
  });

  it('flags an unclosed brace', () => {
    expect(messages('digraph { a').some((m) => /Unclosed/.test(m))).toBe(true);
  });

  it('flags an unknown attribute name', () => {
    expect(messages('a [shp=box];').some((m) => /Unknown attribute 'shp'/.test(m))).toBe(true);
  });

  it('does not flag a known attribute', () => {
    expect(messages('a [shape=box];')).toEqual([]);
  });

  it('flags a missing = in an attribute list', () => {
    expect(messages('a [shape box];').some((m) => /missing '='/i.test(m))).toBe(true);
  });

  it('ignores attribute-looking text inside strings', () => {
    expect(structuralDiagnostics('a [label="shp=1"];')).toEqual([]);
  });

  it('does not flag valid compound-graph attributes as unknown', () => {
    const src = 'digraph { a -> b [ltail=cluster0, lhead=cluster1]; }';
    expect(structuralDiagnostics(src).filter((d) => /Unknown attribute/.test(d.message))).toEqual(
      []
    );
  });

  it('catches an unknown attribute after the first entry in a whitespace-separated list', () => {
    expect(messages('a [shape=box shp=red];').some((m) => /Unknown attribute 'shp'/.test(m))).toBe(
      true
    );
  });

  it('does not false-flag an attribute with spaces around = (name = value)', () => {
    expect(structuralDiagnostics('a [shape = box];')).toEqual([]);
  });

  it('still flags a comma-separated unknown attribute', () => {
    expect(messages('a [shape=box, shp=red];').some((m) => /Unknown attribute 'shp'/.test(m))).toBe(
      true
    );
  });
});
