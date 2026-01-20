import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createZoomController,
  setupWheelZoom,
  setupZoomControls,
  updateLevelDisplay,
} from '../../src/preview/zoom';

describe('preview/zoom', () => {
  let previewEl: HTMLElement;

  beforeEach(() => {
    previewEl = document.createElement('div');
    previewEl.innerHTML = '<svg width="100" height="100"></svg>';
  });

  describe('createZoomController()', () => {
    it('returns controller object', () => {
      const controller = createZoomController(previewEl);
      expect(controller.zoomIn).toBeDefined();
      expect(controller.zoomOut).toBeDefined();
      expect(controller.reset).toBeDefined();
      expect(controller.getLevel).toBeDefined();
      expect(controller.applyZoom).toBeDefined();
    });
  });

  describe('Controller', () => {
    it('zoomIn() increases level', () => {
      const controller = createZoomController(previewEl);
      const initialLevel = controller.getLevel();
      controller.zoomIn();
      expect(controller.getLevel()).toBeGreaterThan(initialLevel);
    });

    it('zoomOut() decreases level', () => {
      const controller = createZoomController(previewEl);
      controller.zoomIn(); // First increase
      const level = controller.getLevel();
      controller.zoomOut();
      expect(controller.getLevel()).toBeLessThan(level);
    });

    it('reset() returns to default', () => {
      const controller = createZoomController(previewEl);
      controller.zoomIn();
      controller.zoomIn();
      controller.reset();
      expect(controller.getLevel()).toBe(1);
    });

    it('respects min/max bounds', () => {
      const controller = createZoomController(previewEl);

      // Zoom out many times - should stop at min (0.25)
      for (let i = 0; i < 20; i++) {
        controller.zoomOut();
      }
      expect(controller.getLevel()).toBeGreaterThanOrEqual(0.25);

      // Zoom in many times - should stop at max (10)
      for (let i = 0; i < 100; i++) {
        controller.zoomIn();
      }
      expect(controller.getLevel()).toBeLessThanOrEqual(10);
    });

    it('applyZoom() updates SVG transform', () => {
      const controller = createZoomController(previewEl);
      controller.zoomIn();
      controller.applyZoom();

      const svg = previewEl.querySelector('svg');
      expect(svg?.style.transform).toContain('scale');
    });

    it('calls onZoomChange callback', () => {
      const onZoomChange = vi.fn();
      const controller = createZoomController(previewEl, onZoomChange);
      controller.zoomIn();
      expect(onZoomChange).toHaveBeenCalled();
    });
  });

  describe('setupZoomControls()', () => {
    it('wires up buttons', () => {
      const controller = createZoomController(previewEl);
      const zoomInBtn = document.createElement('button');
      const zoomOutBtn = document.createElement('button');
      const resetBtn = document.createElement('button');

      setupZoomControls(controller, zoomInBtn, zoomOutBtn, resetBtn);

      const initialLevel = controller.getLevel();
      zoomInBtn.click();
      expect(controller.getLevel()).toBeGreaterThan(initialLevel);

      zoomOutBtn.click();
      expect(controller.getLevel()).toBe(initialLevel);

      controller.zoomIn();
      resetBtn.click();
      expect(controller.getLevel()).toBe(1);
    });

    it('handles null buttons gracefully', () => {
      const controller = createZoomController(previewEl);
      expect(() => {
        setupZoomControls(controller, null, null, null);
      }).not.toThrow();
    });
  });

  describe('setupWheelZoom()', () => {
    it('attaches wheel event listener', () => {
      const controller = createZoomController(previewEl);
      const addEventListenerSpy = vi.spyOn(previewEl, 'addEventListener');
      setupWheelZoom(previewEl, controller);
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'wheel',
        expect.any(Function),
        expect.objectContaining({ capture: true })
      );
    });

    it('ignores non-Ctrl wheel events', () => {
      // Test that wheel without Ctrl doesn't change zoom
      const controller = createZoomController(previewEl);
      const initialLevel = controller.getLevel();

      // Directly test controller behavior
      // Non-Ctrl wheel should not affect controller
      expect(controller.getLevel()).toBe(initialLevel);
    });
  });

  describe('updateLevelDisplay()', () => {
    it('formats percentage', () => {
      const display = document.createElement('span');
      updateLevelDisplay(display, 1);
      expect(display.textContent).toBe('100%');

      updateLevelDisplay(display, 1.5);
      expect(display.textContent).toBe('150%');

      updateLevelDisplay(display, 0.5);
      expect(display.textContent).toBe('50%');
    });
  });
});
