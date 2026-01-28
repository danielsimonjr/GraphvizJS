import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../mocks/tauri';
import {
  configureOpenDialog,
  configureReadTextFile,
  mockDialog,
  mockFs,
  resetAllMocks,
} from '../mocks/tauri';

describe('toolbar/open-diagram', () => {
  let button: HTMLButtonElement;

  beforeEach(() => {
    vi.resetModules();
    resetAllMocks();
    button = document.createElement('button');
  });

  describe('setupOpenDiagramAction()', () => {
    it('attaches click handler', async () => {
      const { setupOpenDiagramAction } = await import('../../src/toolbar/open-diagram');
      const addEventListenerSpy = vi.spyOn(button, 'addEventListener');
      setupOpenDiagramAction({
        button,
        onOpen: vi.fn(),
      });
      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('handles null button gracefully', async () => {
      const { setupOpenDiagramAction } = await import('../../src/toolbar/open-diagram');
      expect(() => {
        setupOpenDiagramAction({
          button: null,
          onOpen: vi.fn(),
        });
      }).not.toThrow();
    });
  });

  describe('Click behavior', () => {
    it('opens file dialog with .dot/.gv filters', async () => {
      const { setupOpenDiagramAction } = await import('../../src/toolbar/open-diagram');
      setupOpenDiagramAction({
        button,
        onOpen: vi.fn(),
      });

      button.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(mockDialog.open).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([expect.objectContaining({ extensions: ['dot', 'gv'] })]),
        })
      );
    });

    it('reads selected file and calls onOpen', async () => {
      configureOpenDialog('/path/to/file.dot');
      configureReadTextFile('digraph { loaded }');

      const onOpen = vi.fn();
      const { setupOpenDiagramAction } = await import('../../src/toolbar/open-diagram');
      setupOpenDiagramAction({
        button,
        onOpen,
      });

      button.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(mockFs.readTextFile).toHaveBeenCalledWith('/path/to/file.dot');
      expect(onOpen).toHaveBeenCalledWith('digraph { loaded }', '/path/to/file.dot');
    });

    it('handles dialog cancel gracefully', async () => {
      configureOpenDialog(null);

      const onOpen = vi.fn();
      const { setupOpenDiagramAction } = await import('../../src/toolbar/open-diagram');
      setupOpenDiagramAction({
        button,
        onOpen,
      });

      button.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(onOpen).not.toHaveBeenCalled();
    });
  });
});
