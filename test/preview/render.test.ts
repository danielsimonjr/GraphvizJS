import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DEFAULT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <circle cx="50" cy="50" r="40" fill="blue"/>
</svg>`;

function createRenderSpy(svg: string = DEFAULT_SVG) {
  return vi.fn().mockResolvedValue(svg);
}

function createFailingRenderSpy(error: Error) {
  return vi.fn().mockRejectedValue(error);
}

describe('render', () => {
  let previewEl: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    previewEl = document.createElement('div');
    previewEl.id = 'preview';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createPreview()', () => {
    it('returns scheduler function', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const scheduler = createPreview(previewEl, 100, { render: createRenderSpy() });
      expect(typeof scheduler).toBe('function');
    });
  });

  describe('Scheduler', () => {
    it('calls onRenderStart callback', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderStart = vi.fn();
      const scheduler = createPreview(previewEl, 100, {
        render: createRenderSpy(),
        callbacks: { onRenderStart },
      });

      scheduler('digraph { a -> b }');
      expect(onRenderStart).toHaveBeenCalledTimes(1);
    });

    it('calls onRenderSuccess on valid DOT', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderSuccess = vi.fn();
      const scheduler = createPreview(previewEl, 100, {
        render: createRenderSpy(),
        callbacks: { onRenderSuccess },
      });

      scheduler('digraph { a -> b }');
      await vi.advanceTimersByTimeAsync(100);

      expect(onRenderSuccess).toHaveBeenCalledTimes(1);
    });

    it('calls onRenderError on invalid DOT', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderError = vi.fn();
      const scheduler = createPreview(previewEl, 100, {
        render: createFailingRenderSpy(new Error('syntax error in DOT')),
        callbacks: { onRenderError },
      });

      scheduler('invalid { syntax');
      await vi.advanceTimersByTimeAsync(100);

      expect(onRenderError).toHaveBeenCalledWith('syntax error in DOT');
    });

    it('calls onRenderEmpty on empty input', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderEmpty = vi.fn();
      const scheduler = createPreview(previewEl, 100, {
        render: createRenderSpy(),
        callbacks: { onRenderEmpty },
      });

      scheduler('   ');
      await vi.advanceTimersByTimeAsync(100);

      expect(onRenderEmpty).toHaveBeenCalledTimes(1);
    });

    it('debounces rapid calls', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderSuccess = vi.fn();
      const scheduler = createPreview(previewEl, 100, {
        render: createRenderSpy(),
        callbacks: { onRenderSuccess },
      });

      scheduler('digraph { a }');
      scheduler('digraph { b }');
      scheduler('digraph { c }');

      await vi.advanceTimersByTimeAsync(100);
      expect(onRenderSuccess).toHaveBeenCalledTimes(1);
    });

    it('cancels stale renders (token check)', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderSuccess = vi.fn();
      const scheduler = createPreview(previewEl, 100, {
        render: createRenderSpy(),
        callbacks: { onRenderSuccess },
      });

      scheduler('digraph { old }');
      await vi.advanceTimersByTimeAsync(50);

      // New call should cancel the pending render
      scheduler('digraph { new }');
      await vi.advanceTimersByTimeAsync(100);

      // Only the new render should complete
      expect(onRenderSuccess).toHaveBeenCalledTimes(1);
    });

    it('calls the injected render function with the trimmed doc and engine', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const renderSpy = createRenderSpy();
      const scheduler = createPreview(previewEl, 0, { render: renderSpy });

      scheduler('  digraph { a -> b }  ');
      await vi.advanceTimersByTimeAsync(0);

      expect(renderSpy).toHaveBeenCalledWith('digraph { a -> b }', 'dot');
    });

    it('injects the resolved SVG into the preview element', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const svg = '<svg data-test="ok"></svg>';
      const scheduler = createPreview(previewEl, 0, { render: createRenderSpy(svg) });

      scheduler('digraph { a -> b }');
      await vi.advanceTimersByTimeAsync(0);

      expect(previewEl.innerHTML).toBe(svg);
    });
  });

  describe('showPreviewMessage()', () => {
    it('displays message correctly', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const scheduler = createPreview(previewEl, 0, { render: createRenderSpy() });

      scheduler('');
      await vi.advanceTimersByTimeAsync(0);

      expect(previewEl.classList.contains('preview-empty')).toBe(true);
      expect(previewEl.querySelector('.preview-message')).not.toBeNull();
      expect(previewEl.textContent).toContain('Add DOT markup');
    });
  });

  describe('showPreviewError()', () => {
    it('displays error with details', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const scheduler = createPreview(previewEl, 0, {
        render: createFailingRenderSpy(new Error('Test error details')),
      });

      scheduler('invalid syntax');
      await vi.advanceTimersByTimeAsync(0);

      expect(previewEl.classList.contains('preview-error')).toBe(true);
      expect(previewEl.querySelector('pre')).not.toBeNull();
      expect(previewEl.querySelector('pre')?.textContent).toContain('Test error details');
    });
  });

  describe('PreviewOptions API', () => {
    it('wires callbacks passed under { callbacks }', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const onRenderSuccess = vi.fn();
      const scheduler = createPreview(previewEl, 100, {
        render: createRenderSpy(),
        callbacks: { onRenderSuccess },
      });

      scheduler('digraph { a -> b }');
      await vi.advanceTimersByTimeAsync(100);

      expect(onRenderSuccess).toHaveBeenCalledTimes(1);
    });

    it('uses custom engine from getEngine option', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const renderSpy = createRenderSpy();
      const scheduler = createPreview(previewEl, 0, {
        render: renderSpy,
        callbacks: {},
        getEngine: () => 'neato',
      });

      scheduler('graph { a -- b }');
      await vi.advanceTimersByTimeAsync(0);

      expect(renderSpy).toHaveBeenCalledWith('graph { a -- b }', 'neato');
    });

    it('defaults to dot engine when getEngine not provided', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const renderSpy = createRenderSpy();
      const scheduler = createPreview(previewEl, 0, { render: renderSpy });

      scheduler('digraph { a -> b }');
      await vi.advanceTimersByTimeAsync(0);

      expect(renderSpy).toHaveBeenCalledWith('digraph { a -> b }', 'dot');
    });
  });

  describe('Preview element', () => {
    it('updates classList correctly', async () => {
      const { createPreview } = await import('../../src/preview/render');
      const scheduler = createPreview(previewEl, 0, { render: createRenderSpy() });

      // First show empty state
      scheduler('');
      await vi.advanceTimersByTimeAsync(0);
      expect(previewEl.classList.contains('preview-empty')).toBe(true);
      expect(previewEl.classList.contains('preview-error')).toBe(false);

      // Reset mocks and show success
      vi.resetModules();
      const { createPreview: cp2 } = await import('../../src/preview/render');
      const scheduler2 = cp2(previewEl, 0, { render: createRenderSpy() });

      scheduler2('digraph { a -> b }');
      await vi.advanceTimersByTimeAsync(0);
      expect(previewEl.classList.contains('preview-empty')).toBe(false);
      expect(previewEl.classList.contains('preview-error')).toBe(false);
    });
  });
});
