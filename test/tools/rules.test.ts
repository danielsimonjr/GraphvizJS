import { describe, expect, it } from 'vitest';
import { checkLayering, layerOf } from '../../tools/dependency-graph/rules';
import type { ParsedFile } from '../../tools/dependency-graph/types';

const f = (path: string, deps: { file: string; typeOnly?: boolean }[] = []): ParsedFile => ({
  path,
  internalDeps: deps.map((d) => ({ file: d.file, imports: ['x'], typeOnly: !!d.typeOnly })),
  exports: [],
  loc: 1,
});

describe('layerOf', () => {
  it('classifies top-level layers', () => {
    expect(layerOf('core/render.ts')).toBe('core');
    expect(layerOf('cli/index.ts')).toBe('cli');
    expect(layerOf('electron/main.ts')).toBe('electron');
    expect(layerOf('src/preview/render.ts')).toBe('renderer');
    expect(layerOf('tools/dependency-graph/scan.ts')).toBe('tools');
  });
});

describe('checkLayering', () => {
  it('flags core importing outside core (core is a leaf)', () => {
    const files = [f('core/a.ts', [{ file: '../cli/x' }]), f('cli/x.ts')];
    const v = checkLayering(files);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ from: 'core/a.ts', to: 'cli/x.ts' });
    expect(v[0].rule).toMatch(/core is a leaf/i);
  });

  it('allows cli -> core but flags cli -> electron', () => {
    const files = [
      f('cli/a.ts', [{ file: '../core/c' }, { file: '../electron/e' }]),
      f('core/c.ts'),
      f('electron/e.ts'),
    ];
    expect(checkLayering(files).map((x) => x.to)).toEqual(['electron/e.ts']);
  });

  it('allows renderer type-only core/types but flags a runtime core import', () => {
    const files = [
      f('src/a.ts', [{ file: '../core/types', typeOnly: true }]),
      f('src/b.ts', [{ file: '../core/render' }]),
      f('core/types.ts'),
      f('core/render.ts'),
    ];
    const v = checkLayering(files);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ from: 'src/b.ts', to: 'core/render.ts' });
    expect(v[0].rule).toMatch(/renderer purity/i);
  });

  it('flags renderer importing electron or cli', () => {
    const files = [f('src/toolbar/a.ts', [{ file: '../../electron/main' }]), f('electron/main.ts')];
    expect(checkLayering(files)).toHaveLength(1);
  });

  it('allows electron to import a shared pure renderer module (menu/watch/platform)', () => {
    const files = [
      f('electron/app-menu.ts', [{ file: '../src/menu/menu-template' }]),
      f('src/menu/menu-template.ts'),
    ];
    expect(checkLayering(files)).toEqual([]);
  });

  it('flags electron reaching into renderer UI (not a shared module)', () => {
    const files = [
      f('electron/main.ts', [{ file: '../src/preview/render' }]),
      f('src/preview/render.ts'),
    ];
    const v = checkLayering(files);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ from: 'electron/main.ts', to: 'src/preview/render.ts' });
    expect(v[0].rule).toMatch(/shared renderer module/i);
  });

  it('allows electron to type-only-import any renderer type (erased at runtime)', () => {
    const files = [
      f('electron/app-menu.ts', [{ file: '../src/theme/color-scheme', typeOnly: true }]),
      f('src/theme/color-scheme.ts'),
    ];
    expect(checkLayering(files)).toEqual([]);
  });

  it('passes a clean graph (core leaf, cli->core, electron->core+shared, renderer type-only core)', () => {
    const files = [
      f('electron/m.ts', [{ file: '../core/c' }, { file: '../src/menu/t' }]),
      f('cli/i.ts', [{ file: '../core/c' }]),
      f('src/x.ts', [{ file: '../core/types', typeOnly: true }]),
      f('core/c.ts'),
      f('core/types.ts'),
      f('src/menu/t.ts'),
    ];
    expect(checkLayering(files)).toEqual([]);
  });
});
