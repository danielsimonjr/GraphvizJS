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
    it('starts an editor at the 16px base font size', () => {
      const { extension } = createEditorZoomExtension();
      const view = new EditorView({
        state: EditorState.create({ extensions: [extension] }),
        parent: container,
      });

      expect(scrollerFontSizes(view)).toEqual([16]);

      view.destroy();
    });
  });

  describe('createEditorZoomController()', () => {
    it('zoomIn() increases level', () => {
      const { extension, compartment } = createEditorZoomExtension();
      const view = new EditorView({
        state: EditorState.create({ extensions: [extension] }),
        parent: container,
      });

      const controller = createEditorZoomController(compartment);
      controller.attach(view);
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

      const controller = createEditorZoomController(compartment);
      controller.attach(view);
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

      const controller = createEditorZoomController(compartment);
      controller.attach(view);
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

      const controller = createEditorZoomController(compartment);
      controller.attach(view);

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

      const controller = createEditorZoomController(compartment);
      controller.attach(view);
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
      const controller = createEditorZoomController(compartment, onZoomChange);
      controller.attach(view);
      controller.zoomIn();
      expect(onZoomChange).toHaveBeenCalled();

      view.destroy();
    });

    describe('initial level', () => {
      it.each([
        [undefined, 1, 16],
        [2, 2, 32],
        [0, 0.5, 8],
        [5, 3, 48],
        [Number.NaN, 1, 16],
        [Number.POSITIVE_INFINITY, 1, 16],
      ])('an initial level of %s gives level %s and a %spx font', (initial, level, fontPx) => {
        const { extension, compartment } = createEditorZoomExtension();
        const view = new EditorView({
          state: EditorState.create({ extensions: [extension] }),
          parent: container,
        });
        const onZoomChange = vi.fn();
        const controller = createEditorZoomController(compartment, onZoomChange, initial);
        controller.attach(view);

        expect(controller.getLevel()).toBe(level);
        expect(scrollerFontSizes(view)).toEqual([fontPx]);
        expect(onZoomChange).not.toHaveBeenCalled();

        view.destroy();
      });
    });
  });

  describe('one level for every attached editor', () => {
    function setup() {
      const { extension, compartment } = createEditorZoomExtension();
      const newView = () =>
        new EditorView({
          state: EditorState.create({ extensions: [extension] }),
          parent: container,
        });
      return { compartment, newView };
    }

    it('an editor attached after a zoom starts at the current level', () => {
      const { compartment, newView } = setup();
      const controller = createEditorZoomController(compartment);
      const first = newView();
      controller.attach(first);
      controller.zoomIn();
      controller.zoomIn();

      const second = newView();
      controller.attach(second);

      expect(controller.getLevel()).toBe(1.2);
      expect(scrollerFontSizes(second)).toEqual([19]);

      first.destroy();
      second.destroy();
    });

    it('a zoom change applies to every attached editor', () => {
      const { compartment, newView } = setup();
      const controller = createEditorZoomController(compartment);
      const first = newView();
      const second = newView();
      controller.attach(first);
      controller.attach(second);

      controller.zoomIn();
      expect(scrollerFontSizes(first)).toEqual([18]);
      expect(scrollerFontSizes(second)).toEqual([18]);

      controller.reset();
      expect(scrollerFontSizes(first)).toEqual([16]);
      expect(scrollerFontSizes(second)).toEqual([16]);

      first.destroy();
      second.destroy();
    });

    it('an editor that is attached again catches up with the current level', () => {
      const { compartment, newView } = setup();
      const controller = createEditorZoomController(compartment);
      const view = newView();
      controller.attach(view);
      controller.zoomIn();
      controller.detach(view);
      controller.reset();
      expect(scrollerFontSizes(view)).toEqual([18]);

      controller.attach(view);

      expect(scrollerFontSizes(view)).toEqual([16]);

      view.destroy();
    });

    it('a detached editor no longer follows the level', () => {
      const { compartment, newView } = setup();
      const controller = createEditorZoomController(compartment);
      const kept = newView();
      const detached = newView();
      controller.attach(kept);
      controller.attach(detached);
      controller.detach(detached);

      controller.zoomIn();

      expect(scrollerFontSizes(kept)).toEqual([18]);
      expect(scrollerFontSizes(detached)).toEqual([16]);

      kept.destroy();
      detached.destroy();
    });

    it('onZoomChange runs once for each change, however many editors are attached', () => {
      const { compartment, newView } = setup();
      const onZoomChange = vi.fn();
      const controller = createEditorZoomController(compartment, onZoomChange);
      const first = newView();
      const second = newView();
      controller.attach(first);
      controller.attach(second);
      expect(onZoomChange).not.toHaveBeenCalled();

      controller.zoomIn();

      expect(onZoomChange).toHaveBeenCalledTimes(1);
      expect(onZoomChange).toHaveBeenCalledWith(1.1);

      first.destroy();
      second.destroy();
    });

    it('the initial level applies to every attached editor', () => {
      const { compartment, newView } = setup();
      const controller = createEditorZoomController(compartment, undefined, 2);
      const first = newView();
      const second = newView();
      controller.attach(first);
      controller.attach(second);

      expect(scrollerFontSizes(first)).toEqual([32]);
      expect(scrollerFontSizes(second)).toEqual([32]);

      first.destroy();
      second.destroy();
    });
  });

  describe('createEditorZoomKeymap()', () => {
    /** Press a key together with the Mod key of the platform in the content of an editor. */
    function pressMod(view: EditorView, key: string, init: KeyboardEventInit = {}): void {
      const mod = /Mac/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key, ...mod, ...init, bubbles: true, cancelable: true })
      );
    }

    it('binds Mod-= and Mod-+ to zoom in, Mod-- to zoom out and Mod-0 to reset', () => {
      const { extension, compartment } = createEditorZoomExtension();
      const controller = createEditorZoomController(compartment);
      const view = new EditorView({
        state: EditorState.create({ extensions: [extension, createEditorZoomKeymap(controller)] }),
        parent: container,
      });
      controller.attach(view);

      pressMod(view, '=');
      expect(controller.getLevel()).toBe(1.1);

      pressMod(view, '+', { shiftKey: true });
      expect(controller.getLevel()).toBe(1.2);
      expect(scrollerFontSizes(view)).toEqual([19]);

      pressMod(view, '-');
      expect(controller.getLevel()).toBe(1.1);
      expect(scrollerFontSizes(view)).toEqual([18]);

      pressMod(view, '0');
      expect(controller.getLevel()).toBe(1);
      expect(scrollerFontSizes(view)).toEqual([16]);

      view.destroy();
    });
  });
});
