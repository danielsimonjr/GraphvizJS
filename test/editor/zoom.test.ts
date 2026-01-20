import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEditorZoomController,
  createEditorZoomExtension,
  createEditorZoomKeymap,
} from '../../src/editor/zoom';

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
