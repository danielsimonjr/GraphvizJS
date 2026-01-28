import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupNewDiagramAction } from '../../src/toolbar/new-diagram';

describe('toolbar/new-diagram', () => {
  let button: HTMLButtonElement;

  beforeEach(() => {
    button = document.createElement('button');
  });

  describe('setupNewDiagramAction()', () => {
    it('attaches click handler', () => {
      const addEventListenerSpy = vi.spyOn(button, 'addEventListener');
      setupNewDiagramAction({
        button,
        onNew: vi.fn(),
      });
      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('handles null button gracefully', () => {
      expect(() => {
        setupNewDiagramAction({
          button: null,
          onNew: vi.fn(),
        });
      }).not.toThrow();
    });
  });

  describe('Click behavior', () => {
    it('calls onNew callback when clicked', () => {
      const onNew = vi.fn();
      setupNewDiagramAction({
        button,
        onNew,
      });

      button.click();
      expect(onNew).toHaveBeenCalledTimes(1);
    });

    it('calls onNew on each click', () => {
      const onNew = vi.fn();
      setupNewDiagramAction({
        button,
        onNew,
      });

      button.click();
      button.click();
      button.click();
      expect(onNew).toHaveBeenCalledTimes(3);
    });
  });
});
