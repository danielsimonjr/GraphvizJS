import { describe, expect, it } from 'vitest';
import {
  computeImpact,
  computeStats,
  detectCycles,
  detectUnused,
  mapTestCoverage,
} from '../../tools/dependency-graph/analyze';
import type { ParsedFile } from '../../tools/dependency-graph/types';

const f = (
  path: string,
  deps: { file: string; typeOnly?: boolean; imports?: string[] }[] = [],
  exports: string[] = []
): ParsedFile => ({
  path,
  internalDeps: deps.map((d) => ({
    file: d.file,
    imports: d.imports ?? ['x'],
    typeOnly: !!d.typeOnly,
  })),
  exports,
  loc: 1,
});

describe('detectCycles', () => {
  it('reports none for an acyclic graph', () => {
    const files = [f('src/a.ts', [{ file: './b' }]), f('src/b.ts')];
    expect(detectCycles(files).runtime).toEqual([]);
  });

  it('finds a runtime cycle', () => {
    const files = [f('src/a.ts', [{ file: './b' }]), f('src/b.ts', [{ file: './a' }])];
    expect(detectCycles(files).runtime.length).toBeGreaterThan(0);
  });

  it('classifies a type-only cycle separately from runtime', () => {
    const files = [
      f('src/a.ts', [{ file: './b' }]),
      f('src/b.ts', [{ file: './a', typeOnly: true }]),
    ];
    const c = detectCycles(files);
    expect(c.runtime).toEqual([]);
    expect(c.typeOnly.length).toBeGreaterThan(0);
  });
});

describe('detectUnused', () => {
  it('flags a file nothing imports (not entry-like)', () => {
    const files = [
      f('src/a.ts', [{ file: './b' }]),
      f('src/b.ts'),
      f('src/orphan.ts', [], ['dead']),
    ];
    const r = detectUnused(files, [], new Set(['src/a.ts']));
    expect(r.unusedFiles).toContain('src/orphan.ts');
    expect(r.unusedFiles).not.toContain('src/a.ts'); // entry-like
  });

  it('does not flag a file imported only by a test', () => {
    const files = [f('src/helper.ts', [], ['help'])];
    const tests = [f('test/helper.test.ts', [{ file: '../src/helper', imports: ['help'] }])];
    const r = detectUnused(files, tests, new Set());
    expect(r.unusedFiles).not.toContain('src/helper.ts');
  });

  it('flags an export no one imports by name', () => {
    const files = [
      f('src/a.ts', [{ file: './b', imports: ['used'] }]),
      f('src/b.ts', [], ['used', 'unusedExport']),
    ];
    const r = detectUnused(files, [], new Set(['src/a.ts']));
    expect(r.unusedExports).toContainEqual({ file: 'src/b.ts', name: 'unusedExport' });
    expect(r.unusedExports).not.toContainEqual({ file: 'src/b.ts', name: 'used' });
  });

  it('does not flag exports of a file imported via namespace (import * as NS)', () => {
    const files = [
      f('src/a.ts', [{ file: './ns', imports: ['* as NS'] }]),
      f('src/ns.ts', [], ['alpha', 'beta']),
    ];
    const r = detectUnused(files, [], new Set(['src/a.ts']));
    expect(r.unusedExports).toEqual([]); // namespace import consumes all exports of ns.ts
  });

  it('distinguishes a dead-cluster leaf (dormant) from its unused root', () => {
    const files = [
      f('src/entry.ts', [{ file: './live' }]),
      f('src/live.ts'),
      f('src/deadRoot.ts', [{ file: './deadLeaf' }]), // nothing imports deadRoot
      f('src/deadLeaf.ts'), // only deadRoot (itself dead) imports it
    ];
    const r = detectUnused(files, [], new Set(['src/entry.ts']));
    expect(r.unusedFiles).toEqual(['src/deadRoot.ts']); // 0 importers → unused
    expect(r.dormantFiles).toEqual(['src/deadLeaf.ts']); // has an importer, but it's dead code
  });

  it('treats a mutually-importing cluster with no entry as all dormant', () => {
    const files = [
      f('src/entry.ts', [{ file: './live' }]),
      f('src/live.ts'),
      f('src/x.ts', [{ file: './y' }]),
      f('src/y.ts', [{ file: './x' }]), // x<->y cycle, unreachable from entry
    ];
    const r = detectUnused(files, [], new Set(['src/entry.ts']));
    expect(r.unusedFiles).toEqual([]); // each has an importer (the other)
    expect(r.dormantFiles).toEqual(['src/x.ts', 'src/y.ts']);
  });

  it('does not flag a file reachable only through a test as dormant', () => {
    const files = [f('src/helper.ts', [], ['h'])];
    const tests = [f('test/helper.test.ts', [{ file: '../src/helper', imports: ['h'] }])];
    const r = detectUnused(files, tests, new Set());
    expect(r.dormantFiles).toEqual([]);
  });
});

describe('mapTestCoverage', () => {
  it('maps a src file to the test that imports it', () => {
    const src = [f('src/preview/render.ts', [], ['render'])];
    const tests = [f('test/preview/render.test.ts', [{ file: '../../src/preview/render' }])];
    expect(mapTestCoverage(src, tests)).toEqual([
      { file: 'src/preview/render.ts', testFiles: ['test/preview/render.test.ts'] },
    ]);
  });

  it('lists a src file with no tests as uncovered', () => {
    const src = [f('src/lonely.ts')];
    expect(mapTestCoverage(src, [])).toEqual([{ file: 'src/lonely.ts', testFiles: [] }]);
  });
});

describe('computeImpact', () => {
  it('returns the transitive reverse-dependencies of a file', () => {
    // chain: a -> b -> c ; and a test importing a
    const files = [
      f('src/a.ts', [{ file: './b' }]),
      f('src/b.ts', [{ file: './c' }]),
      f('src/c.ts'),
    ];
    const tests = [f('test/a.test.ts', [{ file: '../src/a' }])];
    const r = computeImpact(files, tests, 'src/c.ts');
    expect(r.found).toBe(true);
    expect(r.importers).toEqual(['src/a.ts', 'src/b.ts', 'test/a.test.ts']);
  });

  it('reports found:false for an unknown target', () => {
    const r = computeImpact([f('src/a.ts')], [], 'src/nope.ts');
    expect(r).toEqual({ found: false, importers: [] });
  });

  it('returns an empty blast radius for a leaf nothing imports', () => {
    const r = computeImpact([f('src/a.ts', [{ file: './b' }]), f('src/b.ts')], [], 'src/a.ts');
    expect(r).toEqual({ found: true, importers: [] });
  });
});

describe('computeStats', () => {
  it('computes counts over files and modules', () => {
    const files = [
      f('src/preview/render.ts', [{ file: './graphviz' }], ['render']),
      f('src/preview/graphviz.ts', [], ['initGraphviz']),
    ];
    const modules = new Map<string, string[]>([['preview', files.map((x) => x.path)]]);
    const edges = new Map<string, Set<string>>();
    const s = computeStats(files, modules, edges);
    expect(s.fileCount).toBe(2);
    expect(s.moduleCount).toBe(1);
    expect(s.totalLoc).toBe(2); // f() sets loc:1 each
    expect(s.edgeCount).toBe(1); // render → graphviz resolves to a known file
    expect(s.exportCount).toBe(2);
  });
});
