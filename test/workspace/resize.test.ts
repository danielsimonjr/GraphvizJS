import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initHorizontalResize } from '../../src/workspace/resize';

describe('workspace/resize', () => {
  let container: HTMLElement;
  let editorPane: HTMLElement;
  let previewPane: HTMLElement;
  let divider: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '1000px';
    editorPane = document.createElement('div');
    previewPane = document.createElement('div');
    divider = document.createElement('div');

    container.appendChild(editorPane);
    container.appendChild(divider);
    container.appendChild(previewPane);
    document.body.appendChild(container);
  });

  describe('initHorizontalResize()', () => {
    it('attaches drag handlers', () => {
      const addEventListenerSpy = vi.spyOn(divider, 'addEventListener');
      initHorizontalResize(container, editorPane, previewPane, divider);
      expect(addEventListenerSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('dblclick', expect.any(Function));
    });

    it('sets initial editor width ratio', () => {
      initHorizontalResize(container, editorPane, previewPane, divider);
      expect(editorPane.style.flex).toContain('0.5');
      expect(previewPane.style.flex).toContain('0.5');
    });

    it('handles null elements gracefully', () => {
      expect(() => {
        initHorizontalResize(null, editorPane, previewPane, divider);
      }).not.toThrow();

      expect(() => {
        initHorizontalResize(container, null, previewPane, divider);
      }).not.toThrow();
    });

    it('double-click resets to default ratio', () => {
      initHorizontalResize(container, editorPane, previewPane, divider);

      // Simulate some drag that changed the ratio
      editorPane.style.flex = '0.7 1 0';
      previewPane.style.flex = '0.3 1 0';

      // Double-click to reset
      divider.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      expect(editorPane.style.flex).toContain('0.5');
    });

    it('adds dragging class on pointerdown', () => {
      initHorizontalResize(container, editorPane, previewPane, divider);

      // Mock getBoundingClientRect
      container.getBoundingClientRect = vi.fn().mockReturnValue({ width: 1000 });
      editorPane.getBoundingClientRect = vi.fn().mockReturnValue({ width: 500 });

      divider.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 500,
          bubbles: true,
        })
      );

      expect(divider.classList.contains('dragging')).toBe(true);

      // Clean up - trigger pointerup to remove listener
      window.dispatchEvent(new PointerEvent('pointerup'));
    });
  });
});
