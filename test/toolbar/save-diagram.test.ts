import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../mocks/tauri';
import { configureSaveDialog, mockDialog, mockFs, resetAllMocks } from '../mocks/tauri';

describe('toolbar/save-diagram', () => {
  let container: HTMLElement;
  let editor: EditorView;
  let button: HTMLButtonElement;

  beforeEach(() => {
    vi.resetModules();
    resetAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    editor = new EditorView({
      state: EditorState.create({ doc: 'test content' }),
      parent: container,
    });

    button = document.createElement('button');
  });

  describe('setupSaveDiagramAction()', () => {
    it('attaches click handler', async () => {
      const { setupSaveDiagramAction } = await import('../../src/toolbar/save-diagram');
      const addEventListenerSpy = vi.spyOn(button, 'addEventListener');
      setupSaveDiagramAction({
        getEditor: () => editor,
        button,
        getPath: () => null,
        onPathChange: vi.fn(),
      });
      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
      editor.destroy();
    });

    it('handles null button gracefully', async () => {
      const { setupSaveDiagramAction } = await import('../../src/toolbar/save-diagram');
      expect(() => {
        setupSaveDiagramAction({
          getEditor: () => editor,
          button: null,
          getPath: () => null,
          onPathChange: vi.fn(),
        });
      }).not.toThrow();
      editor.destroy();
    });
  });

  describe('Click behavior', () => {
    it('opens save dialog with .dot default', async () => {
      const { setupSaveDiagramAction } = await import('../../src/toolbar/save-diagram');
      setupSaveDiagramAction({
        getEditor: () => editor,
        button,
        getPath: () => null,
        onPathChange: vi.fn(),
      });

      button.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(mockDialog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'diagram.dot',
        })
      );
      editor.destroy();
    });

    it('writes editor content to file', async () => {
      configureSaveDialog('/path/to/saved.dot');

      const { setupSaveDiagramAction } = await import('../../src/toolbar/save-diagram');
      setupSaveDiagramAction({
        getEditor: () => editor,
        button,
        getPath: () => null,
        onPathChange: vi.fn(),
      });

      button.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(mockFs.writeTextFile).toHaveBeenCalledWith('/path/to/saved.dot', 'test content');
      editor.destroy();
    });

    it('calls onPathChange with saved path', async () => {
      configureSaveDialog('/path/to/saved.dot');

      const onPathChange = vi.fn();
      const { setupSaveDiagramAction } = await import('../../src/toolbar/save-diagram');
      setupSaveDiagramAction({
        getEditor: () => editor,
        button,
        getPath: () => null,
        onPathChange,
      });

      button.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(onPathChange).toHaveBeenCalledWith('/path/to/saved.dot');
      editor.destroy();
    });

    it('uses existing path if available (save vs save-as)', async () => {
      const { setupSaveDiagramAction } = await import('../../src/toolbar/save-diagram');
      setupSaveDiagramAction({
        getEditor: () => editor,
        button,
        getPath: () => '/existing/path.dot',
        onPathChange: vi.fn(),
      });

      button.click();
      await new Promise((r) => setTimeout(r, 50));

      // Should not open dialog when path exists
      expect(mockDialog.save).not.toHaveBeenCalled();
      expect(mockFs.writeTextFile).toHaveBeenCalledWith('/existing/path.dot', 'test content');
      editor.destroy();
    });

    it('handles dialog cancel gracefully', async () => {
      configureSaveDialog(null);

      const onPathChange = vi.fn();
      const { setupSaveDiagramAction } = await import('../../src/toolbar/save-diagram');
      setupSaveDiagramAction({
        getEditor: () => editor,
        button,
        getPath: () => null,
        onPathChange,
      });

      button.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(mockFs.writeTextFile).not.toHaveBeenCalled();
      expect(onPathChange).not.toHaveBeenCalled();
      editor.destroy();
    });
  });
});
