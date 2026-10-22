import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEditorZoomController,
  createEditorZoomExtension,
  createEditorZoomKeymap,
} from '../../src/editor/zoom';

/** The font sizes, in px, that the themes of an editor set on its scroller. */
function scrollerFontSizes(view: EditorView): number[] {
  const rules = view.state
    .facet(EditorView.styleModule)
    .map((module) => module.getRules())
    .join('\n');
  return [...rules.matchAll(/\.cm-scroller\s*\{[^}]*?font-size:\s*(\d+)px/g)].map((match) =>
    Number(match[1])
  );
}

describe('editor/zoom', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('createEditorZoomExtension()', () => {
    it('returns Compartment and extension', () => {
      const result = createEditorZoomExtension();
      expect(result.extension).toBeDefined();
      expect(result.compartment).toBeDefined();
    });
  });

  describe('createEditorZoomController()', () => {
    it('returns controller object', () => {
      const { extension, compartment } = createEditorZoomExtension();
      const view = new EditorView({
        state: EditorState.create({ extensions: [extension] }),
        parent: container,
      });

      const controller = createEditorZoomController(view, compartment);
      expect(controller.zoomIn).toBeDefined();
      expect(controller.zoomOut).toBeDefined();
      expect(controller.reset).toBeDefined();
      expect(controller.getLevel).toBeDefined();

      view.destroy();
    });

    it('zoomIn() increases level', () => {
      const { extension, compartment } = createEditorZoomExtension();
      const view = new EditorView({
        state: EditorState.create({ extensions: [extension] }),
        parent: container,
      });

      const controller = createEditorZoomController(view, compartment);
      const initialLevel = controller.getLevel();
      controller.zoomIn();
      expect(controller.getLevel()).toBeGreaterThan(initialLevel);

      view.destroy();
    });

    it('zoomOut() decreases level', () => {
      const { extension, compartment } = createEditorZoomExtension();
      const view = new EditorView({
        state: EditorState.create({ extensions: [extension] }),
        parent: container,
      });

      const controller = createEditorZoomController(view, compartment);
      controller.zoomIn(); // First increase to have room to decrease
      const level = controller.getLevel();
      controller.zoomOut();
      expect(controller.getLevel()).toBeLessThan(level);

      view.destroy();
    });

    it('reset() returns to default', () => {
      const { extension, compartment } = createEditorZoomExtension();
      const view = new EditorView({
        state: EditorState.create({ extensions: [extension] }),
        parent: container,
      });

      const controller = createEditorZoomController(view, compartment);
      controller.zoomIn();
      controller.zoomIn();
      controller.reset();
      expect(controller.getLevel()).toBe(1);

      view.destroy();
    });

    it('respects min/max bounds', () => {
      const { extension, compartment } = createEditorZoomExtension();
      const view = new EditorView({
        state: EditorState.create({ extensions: [extension] }),
        parent: container,
      });

      const controller = createEditorZoomController(view, compartment);

      // Zoom out many times - should stop at min (0.5)
      for (let i = 0; i < 20; i++) {
        controller.zoomOut();
      }
      expect(controller.getLevel()).toBeGreaterThanOrEqual(0.5);

      // Zoom in many times - should stop at max (3)
      for (let i = 0; i < 50; i++) {
        controller.zoomIn();
      }
      expect(controller.getLevel()).toBeLessThanOrEqual(3);

      view.destroy();
    });

    it('getLevel() returns current level', () => {
      const { extension, compartment } = createEditorZoomExtension();
      const view = new EditorView({
        state: EditorState.create({ extensions: [extension] }),
        parent: container,
      });

      const controller = createEditorZoomController(view, compartment);
      expect(controller.getLevel()).toBe(1);

      view.destroy();
    });

    it('calls onZoomChange callback', () => {
      const { extension, compartment } = createEditorZoomExtension();
      const view = new EditorView({
        state: EditorState.create({ extensions: [extension] }),
        parent: container,
      });

      const onZoomChange = vi.fn();
      const controller = createEditorZoomController(view, compartment, onZoomChange);
      controller.zoomIn();
      expect(onZoomChange).toHaveBeenCalled();

      view.destroy();
    });

    describe('initial level', () => {
      function createEditor() {
        const { extension, compartment } = createEditorZoomExtension();
        const view = new EditorView({
          state: EditorState.create({ extensions: [extension] }),
          parent: container,
        });
        return { view, compartment };
      }

      it('keeps level 1 and the default font when no level is given', () => {
        const { view, compartment } = createEditor();
        const controller = createEditorZoomController(view, compartment);

        expect(controller.getLevel()).toBe(1);
        expect(scrollerFontSizes(view)).toEqual([16]);

        view.destroy();
      });

      it('applies a level inside the limits to the font without calling onZoomChange', () => {
        const { view, compartment } = createEditor();
        const onZoomChange = vi.fn();
        const controller = createEditorZoomController(view, compartment, onZoomChange, 2);

        expect(controller.getLevel()).toBe(2);
        expect(scrollerFontSizes(view)).toEqual([32]);
        expect(onZoomChange).not.toHaveBeenCalled();

        view.destroy();
      });

      it('raises a level below the minimum to 0.5 and applies it to the font', () => {
        const { view, compartment } = createEditor();
        const controller = createEditorZoomController(view, compartment, undefined, 0);

        expect(controller.getLevel()).toBe(0.5);
        expect(scrollerFontSizes(view)).toEqual([8]);

        view.destroy();
      });

      it('lowers a level above the maximum to 3 and applies it to the font', () => {
        const { view, compartment } = createEditor();
        const controller = createEditorZoomController(view, compartment, undefined, 5);

        expect(controller.getLevel()).toBe(3);
        expect(scrollerFontSizes(view)).toEqual([48]);

        view.destroy();
      });

      it.each([Number.NaN, Number.POSITIVE_INFINITY])(
        'uses level 1 and the default font for the level %s',
        (level) => {
          const { view, compartment } = createEditor();
          const controller = createEditorZoomController(view, compartment, undefined, level);

          expect(controller.getLevel()).toBe(1);
          expect(scrollerFontSizes(view)).toEqual([16]);

          view.destroy();
        }
      );
    });
  });

  describe('createEditorZoomKeymap()', () => {
    it('returns keymap array', () => {
      const { extension, compartment } = createEditorZoomExtension();
      const view = new EditorView({
        state: EditorState.create({ extensions: [extension] }),
        parent: container,
      });

      const controller = createEditorZoomController(view, compartment);
      const keymapExtension = createEditorZoomKeymap(controller);
      expect(keymapExtension).toBeDefined();

      view.destroy();
    });
  });
});
