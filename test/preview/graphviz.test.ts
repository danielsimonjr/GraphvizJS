import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../mocks/graphviz';
import {
  configureMockError,
  DEFAULT_SVG,
  getCurrentInstance,
  mockGraphviz,
  resetMockGraphviz,
} from '../mocks/graphviz';

// Reset module state before each test
beforeEach(async () => {
  vi.resetModules();
  resetMockGraphviz();
});

describe('graphviz', () => {
  describe('initGraphviz()', () => {
    it('successfully initializes', async () => {
      const { initGraphviz } = await import('../../src/preview/graphviz');
      await initGraphviz();
      expect(mockGraphviz.load).toHaveBeenCalledTimes(1);
    });

    it('only loads once (singleton pattern)', async () => {
      const { initGraphviz } = await import('../../src/preview/graphviz');
      await initGraphviz();
      await initGraphviz();
      await initGraphviz();
      expect(mockGraphviz.load).toHaveBeenCalledTimes(1);
    });
  });

  describe('renderDotToSvg()', () => {
    it('renders simple digraph', async () => {
      const { renderDotToSvg } = await import('../../src/preview/graphviz');
      const result = await renderDotToSvg('digraph { a -> b }');
      expect(result).toBe(DEFAULT_SVG);
    });

    it('renders undirected graph', async () => {
      const { renderDotToSvg } = await import('../../src/preview/graphviz');
      const result = await renderDotToSvg('graph { a -- b }');
      expect(result).toBe(DEFAULT_SVG);
    });

    it('handles empty input', async () => {
      const { renderDotToSvg } = await import('../../src/preview/graphviz');
      const result = await renderDotToSvg('');
      expect(result).toBe(DEFAULT_SVG);
    });

    it('handles invalid DOT syntax (throws)', async () => {
      configureMockError(new Error('syntax error'));
      const { renderDotToSvg } = await import('../../src/preview/graphviz');
      await expect(renderDotToSvg('invalid { syntax')).rejects.toThrow('syntax error');
    });

    it("uses default 'dot' engine", async () => {
      const { renderDotToSvg, initGraphviz } = await import('../../src/preview/graphviz');
      await initGraphviz();
      const instance = getCurrentInstance();
      await renderDotToSvg('digraph { a -> b }');
      expect(instance?.layout).toHaveBeenCalledWith('digraph { a -> b }', 'svg', 'dot');
    });

    it('respects custom layout engine', async () => {
      const { renderDotToSvg, initGraphviz } = await import('../../src/preview/graphviz');
      await initGraphviz();
      const instance = getCurrentInstance();
      await renderDotToSvg('graph { a -- b }', 'neato');
      expect(instance?.layout).toHaveBeenCalledWith('graph { a -- b }', 'svg', 'neato');
    });

    it('auto-initializes if not ready', async () => {
      const { renderDotToSvg, isGraphvizReady } = await import('../../src/preview/graphviz');
      expect(isGraphvizReady()).toBe(false);
      await renderDotToSvg('digraph {}');
      expect(isGraphvizReady()).toBe(true);
    });
  });

  describe('isGraphvizReady()', () => {
    it('returns false before init', async () => {
      const { isGraphvizReady } = await import('../../src/preview/graphviz');
      expect(isGraphvizReady()).toBe(false);
    });

    it('returns true after init', async () => {
      const { initGraphviz, isGraphvizReady } = await import('../../src/preview/graphviz');
      await initGraphviz();
      expect(isGraphvizReady()).toBe(true);
    });
  });

  describe('LayoutEngine type', () => {
    it('validates all 8 engines', async () => {
      const { renderDotToSvg, initGraphviz } = await import('../../src/preview/graphviz');
      await initGraphviz();
      const instance = getCurrentInstance();

      const engines = [
        'dot',
        'neato',
        'fdp',
        'sfdp',
        'circo',
        'twopi',
        'osage',
        'patchwork',
      ] as const;

      for (const engine of engines) {
        await renderDotToSvg('digraph {}', engine);
      }

      expect(instance?.layout).toHaveBeenCalledTimes(8);
    });
  });
});
