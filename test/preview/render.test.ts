import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../mocks/graphviz';
import {
  configureMockError,
  configureMockSvg,
  DEFAULT_SVG,
  resetMockGraphviz,
} from '../mocks/graphviz';

describe('render', () => {
  let previewEl: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    resetMockGraphviz();
    previewEl = document.createElement('div');
    previewEl.id = 'preview';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createPreview()', () => {
    it('returns scheduler function', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const scheduler = createPreview(previewEl, 100);
      expect(typeof scheduler).toBe('function');
    });
  });

  describe('Scheduler', () => {
    it('calls onRenderStart callback', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderStart = vi.fn();
      const scheduler = createPreview(previewEl, 100, { onRenderStart });

      scheduler('digraph { a -> b }');
      expect(onRenderStart).toHaveBeenCalledTimes(1);
    });

    it('calls onRenderSuccess on valid DOT', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderSuccess = vi.fn();
      const scheduler = createPreview(previewEl, 100, { onRenderSuccess });

      scheduler('digraph { a -> b }');
      await vi.advanceTimersByTimeAsync(100);

      expect(onRenderSuccess).toHaveBeenCalledTimes(1);
    });

    it('calls onRenderError on invalid DOT', async () => {
      configureMockError(new Error('syntax error in DOT'));
      const { createPreview } = await import('../../src/preview/render');
      const onRenderError = vi.fn();
      const scheduler = createPreview(previewEl, 100, { onRenderError });

      scheduler('invalid { syntax');
      await vi.advanceTimersByTimeAsync(100);

      expect(onRenderError).toHaveBeenCalledWith('syntax error in DOT');
    });

    it('calls onRenderEmpty on empty input', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderEmpty = vi.fn();
      const scheduler = createPreview(previewEl, 100, { onRenderEmpty });

      scheduler('   ');
      await vi.advanceTimersByTimeAsync(100);

      expect(onRenderEmpty).toHaveBeenCalledTimes(1);
    });

    it('debounces rapid calls', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderSuccess = vi.fn();
      const scheduler = createPreview(previewEl, 100, { onRenderSuccess });

      scheduler('digraph { a }');
      scheduler('digraph { b }');
      scheduler('digraph { c }');

      await vi.advanceTimersByTimeAsync(100);
      expect(onRenderSuccess).toHaveBeenCalledTimes(1);
    });

    it('cancels stale renders (token check)', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderSuccess = vi.fn();
      const scheduler = createPreview(previewEl, 100, { onRenderSuccess });

      scheduler('digraph { old }');
      await vi.advanceTimersByTimeAsync(50);

      // New call should cancel the pending render
      scheduler('digraph { new }');
      await vi.advanceTimersByTimeAsync(100);

      // Only the new render should complete
      expect(onRenderSuccess).toHaveBeenCalledTimes(1);
    });
  });

  describe('showPreviewMessage()', () => {
    it('displays message correctly', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const scheduler = createPreview(previewEl, 0);

      scheduler('');
      await vi.advanceTimersByTimeAsync(0);

      expect(previewEl.classList.contains('preview-empty')).toBe(true);
      expect(previewEl.querySelector('.preview-message')).not.toBeNull();
      expect(previewEl.textContent).toContain('Add DOT markup');
    });
  });

  describe('showPreviewError()', () => {
    it('displays error with details', async () => {
      configureMockError(new Error('Test error details'));
      const { createPreview } = await import('../../src/preview/render');
      const scheduler = createPreview(previewEl, 0);

      scheduler('invalid syntax');
      await vi.advanceTimersByTimeAsync(0);

      expect(previewEl.classList.contains('preview-error')).toBe(true);
      expect(previewEl.querySelector('pre')).not.toBeNull();
      expect(previewEl.querySelector('pre')?.textContent).toContain('Test error details');
    });
  });

  describe('Backward-compatible API (PreviewStatusCallbacks)', () => {
    it('works when passing callbacks directly (old API)', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderSuccess = vi.fn();
      // Old API: pass PreviewStatusCallbacks directly, not wrapped in { callbacks }
      const scheduler = createPreview(previewEl, 100, { onRenderSuccess });

      scheduler('digraph { a -> b }');
      await vi.advanceTimersByTimeAsync(100);

      expect(onRenderSuccess).toHaveBeenCalledTimes(1);
    });

    it('works when passing PreviewOptions with callbacks (new API)', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderSuccess = vi.fn();
      // New API: wrap in { callbacks }
      const scheduler = createPreview(previewEl, 100, {
        callbacks: { onRenderSuccess },
      });

      scheduler('digraph { a -> b }');
      await vi.advanceTimersByTimeAsync(100);

      expect(onRenderSuccess).toHaveBeenCalledTimes(1);
    });

    it('uses custom engine from getEngine option', async () => {
      const graphvizModule = await import('../../src/preview/graphviz');
      const renderSpy = vi.spyOn(graphvizModule, 'renderDotToSvg');

      const { createPreview } = await import('../../src/preview/render');
      const scheduler = createPreview(previewEl, 0, {
        callbacks: {},
        getEngine: () => 'neato',
      });

      scheduler('graph { a -- b }');
      await vi.advanceTimersByTimeAsync(0);

      expect(renderSpy).toHaveBeenCalledWith('graph { a -- b }', 'neato');
      renderSpy.mockRestore();
    });

    it('defaults to dot engine when getEngine not provided', async () => {
      const graphvizModule = await import('../../src/preview/graphviz');
      const renderSpy = vi.spyOn(graphvizModule, 'renderDotToSvg');

      const { createPreview } = await import('../../src/preview/render');
      const scheduler = createPreview(previewEl, 0);

      scheduler('digraph { a -> b }');
      await vi.advanceTimersByTimeAsync(0);

      expect(renderSpy).toHaveBeenCalledWith('digraph { a -> b }', 'dot');
      renderSpy.mockRestore();
    });
  });

  describe('Preview element', () => {
    it('updates classList correctly', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const scheduler = createPreview(previewEl, 0);

      // First show empty state
      scheduler('');
      await vi.advanceTimersByTimeAsync(0);
      expect(previewEl.classList.contains('preview-empty')).toBe(true);
      expect(previewEl.classList.contains('preview-error')).toBe(false);

      // Reset mocks and show success
      resetMockGraphviz();
      vi.resetModules();
      const { createPreview: cp2 } = await import('../../src/preview/render');
      const scheduler2 = cp2(previewEl, 0);

      scheduler2('digraph { a -> b }');
      await vi.advanceTimersByTimeAsync(0);
      expect(previewEl.classList.contains('preview-empty')).toBe(false);
      expect(previewEl.classList.contains('preview-error')).toBe(false);
    });
  });
});
