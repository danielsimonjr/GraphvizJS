import { describe, expect, it } from 'vitest';
import { formatDot } from '../../src/editor/format';

describe('formatDot', () => {
  it('reindents by brace depth with 2 spaces', () => {
    const out = formatDot('digraph G {\na->b;\n}');
    expect(out).toBe('digraph G {\n  a -> b;\n}');
  });

  it('dedents the closing brace to its block level', () => {
    const out = formatDot('digraph {\nsubgraph c {\nx;\n}\n}');
    expect(out).toBe('digraph {\n  subgraph c {\n    x;\n  }\n}');
  });

  it('normalizes spacing around -> and -- but not inside strings', () => {
    expect(formatDot('a->b')).toBe('a -> b');
    expect(formatDot('a--b')).toBe('a -- b');
    expect(formatDot('n [label="a->b"]')).toBe('n [label="a->b"]');
  });

  it('is idempotent', () => {
    const messy = 'digraph{a->b;subgraph s{c--d}}';
    const once = formatDot(messy);
    expect(formatDot(once)).toBe(once);
  });

  it('preserves a multi-line HTML label verbatim', () => {
    const src = 'n [label=<\n  <b>hi</b>\n>];';
    expect(formatDot(src)).toContain('<b>hi</b>');
  });

  it('collapses runs of blank lines to one', () => {
    expect(formatDot('a;\n\n\n\nb;')).toBe('a;\n\nb;');
  });

  it('returns the input unchanged when braces are unbalanced (fail-safe)', () => {
    const broken = 'digraph { a';
    expect(formatDot(broken)).toBe(broken);
  });

  it('preserves a single trailing newline', () => {
    expect(formatDot('a;\n')).toBe('a;\n');
  });

  // Adversarial cases beyond the brief — literal-safety must hold for
  // comments too, not just strings/HTML, and unrelated literal punctuation
  // must never influence formatting decisions.

  it('does not reformat -> or -- inside a line comment', () => {
    expect(formatDot('a->b; // x->y and c--d')).toBe('a -> b; // x->y and c--d');
  });

  it('does not reformat -> inside a block comment', () => {
    expect(formatDot('a->b; /* x->y */')).toBe('a -> b; /* x->y */');
  });

  it('ignores a } inside a string when tracking brace depth', () => {
    const src = 'digraph {\na[label="}"];\n}';
    expect(formatDot(src)).toBe('digraph {\n  a[label="}"];\n}');
  });

  it('leaves an already-canonically-formatted document unchanged', () => {
    const canonical = 'digraph G {\n  a -> b;\n  subgraph c {\n    x;\n  }\n}\n';
    expect(formatDot(canonical)).toBe(canonical);
  });

  it('does not collapse a run of internal spaces inside a string literal', () => {
    const src = 'n [label="a    b"];';
    expect(formatDot(src)).toBe(src);
  });
});
