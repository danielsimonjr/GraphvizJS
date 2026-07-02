import { describe, expect, it } from 'vitest';
import { categorize, computeModuleEdges, moduleOf } from '../../tools/dependency-graph/categorize';
import type { ParsedFile } from '../../tools/dependency-graph/types';

const file = (path: string, deps: string[] = []): ParsedFile => ({
  path,
  internalDeps: deps.map((file) => ({ file, imports: ['x'], typeOnly: false })),
  exports: [],
  loc: 1,
});

describe('moduleOf', () => {
  it('uses the second path segment for nested files', () => {
    expect(moduleOf('src/preview/render.ts')).toBe('preview');
  });
  it('buckets root-level src files under "root"', () => {
    expect(moduleOf('src/main.ts')).toBe('root');
  });
});

describe('categorize', () => {
  it('groups files by module', () => {
    const map = categorize([
      file('src/preview/render.ts'),
      file('src/preview/zoom.ts'),
      file('src/main.ts'),
    ]);
    expect(map.get('preview')).toEqual(['src/preview/render.ts', 'src/preview/zoom.ts']);
    expect(map.get('root')).toEqual(['src/main.ts']);
  });
});

describe('computeModuleEdges', () => {
  it('aggregates file edges into module edges, dropping self-edges', () => {
    const files = [
      file('src/toolbar/actions.ts', ['../preview/render', './export-menu']),
      file('src/preview/render.ts', ['./graphviz']),
      file('src/preview/graphviz.ts'),
      file('src/preview/zoom.ts'),
      file('src/toolbar/export-menu.ts'),
    ];
    const edges = computeModuleEdges(files);
    expect([...(edges.get('toolbar') ?? [])]).toEqual(['preview']); // ./export-menu is self → dropped
    expect(edges.get('preview')?.has('preview')).not.toBe(true); // self-edge dropped
  });
});
