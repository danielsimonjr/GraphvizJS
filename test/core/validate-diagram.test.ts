import { describe, expect, it, vi } from 'vitest';
import '../mocks/graphviz';
import { configureMockError, resetMockGraphviz } from '../mocks/graphviz';

describe('validateDiagram', () => {
  it('valid DOT with no structural issues → syntax null, structural empty', async () => {
    vi.resetModules();
    resetMockGraphviz();
    const { validateDiagram } = await import('../../core/validate');
    const result = await validateDiagram('digraph { a -> b }');
    expect(result.syntax).toBeNull();
    expect(result.structural).toEqual([]);
  });

  it('surfaces a Graphviz syntax error in syntax, independent of structural', async () => {
    vi.resetModules();
    resetMockGraphviz();
    configureMockError(new Error('Error: <stdin>: syntax error in line 2'));
    const { validateDiagram } = await import('../../core/validate');
    const result = await validateDiagram('digraph { a -> }');
    expect(result.syntax?.line).toBe(2);
  });

  it('reports structural warnings even when syntax is valid', async () => {
    vi.resetModules();
    resetMockGraphviz();
    const { validateDiagram } = await import('../../core/validate');
    const result = await validateDiagram('digraph { a [shp=box] }');
    expect(result.syntax).toBeNull();
    expect(result.structural.some((d) => /Unknown attribute 'shp'/.test(d.message))).toBe(true);
  });
});
