import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupToolbarShortcuts } from '../../src/toolbar/shortcuts';

describe('toolbar/shortcuts', () => {
  let newButton: HTMLButtonElement;
  let openButton: HTMLButtonElement;
  let saveButton: HTMLButtonElement;

  beforeEach(() => {
    newButton = document.createElement('button');
    openButton = document.createElement('button');
    saveButton = document.createElement('button');
  });

  describe('setupToolbarShortcuts()', () => {
    it('registers event listeners', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      const cleanup = setupToolbarShortcuts({
        newButton,
        openButton,
        saveButton,
      });
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        expect.objectContaining({ capture: true })
      );
      cleanup();
    });

    it('returns cleanup function', () => {
      const cleanup = setupToolbarShortcuts({ newButton, openButton, saveButton });
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('cleanup removes event listener', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const cleanup = setupToolbarShortcuts({ newButton, openButton, saveButton });
      cleanup();
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        expect.objectContaining({ capture: true })
      );
    });
  });

  describe('Keyboard shortcuts', () => {
    it('Ctrl+N triggers new button', () => {
      const clickSpy = vi.spyOn(newButton, 'click');
      const cleanup = setupToolbarShortcuts({ newButton, openButton, saveButton });

      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'n',
          ctrlKey: true,
          bubbles: true,
        })
      );

      expect(clickSpy).toHaveBeenCalled();
      cleanup();
    });

    it('Ctrl+O triggers open button', () => {
      const clickSpy = vi.spyOn(openButton, 'click');
      const cleanup = setupToolbarShortcuts({ newButton, openButton, saveButton });

      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'o',
          ctrlKey: true,
          bubbles: true,
        })
      );

      expect(clickSpy).toHaveBeenCalled();
      cleanup();
    });

    it('Ctrl+S triggers save button', () => {
      const clickSpy = vi.spyOn(saveButton, 'click');
      const cleanup = setupToolbarShortcuts({ newButton, openButton, saveButton });

      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 's',
          ctrlKey: true,
          bubbles: true,
        })
      );

      expect(clickSpy).toHaveBeenCalled();
      cleanup();
    });

    it('does not trigger on regular key press', () => {
      const clickSpy = vi.spyOn(newButton, 'click');
      const cleanup = setupToolbarShortcuts({ newButton, openButton, saveButton });

      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'n',
          ctrlKey: false,
          bubbles: true,
        })
      );

      expect(clickSpy).not.toHaveBeenCalled();
      cleanup();
    });

    it('does not trigger on disabled button', () => {
      saveButton.disabled = true;
      const clickSpy = vi.spyOn(saveButton, 'click');
      const cleanup = setupToolbarShortcuts({ newButton, openButton, saveButton });

      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 's',
          ctrlKey: true,
          bubbles: true,
        })
      );

      expect(clickSpy).not.toHaveBeenCalled();
      cleanup();
    });
  });
});
