import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
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
  let container: HTMLElement;
  let editor: EditorView;
  let button: HTMLButtonElement;

  beforeEach(() => {
    vi.resetModules();
    resetAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);

    editor = new EditorView({
      state: EditorState.create({ doc: 'existing content' }),
      parent: container,
    });

    button = document.createElement('button');
  });

  describe('setupOpenDiagramAction()', () => {
    it('attaches click handler', async () => {
      const { setupOpenDiagramAction } = await import('../../src/toolbar/open-diagram');
      const addEventListenerSpy = vi.spyOn(button, 'addEventListener');
      setupOpenDiagramAction({
        editor,
        schedulePreviewRender: vi.fn(),
        button,
        onPathChange: vi.fn(),
      });
      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
      editor.destroy();
    });

    it('handles null button gracefully', async () => {
      const { setupOpenDiagramAction } = await import('../../src/toolbar/open-diagram');
      expect(() => {
        setupOpenDiagramAction({
          editor,
          schedulePreviewRender: vi.fn(),
          button: null,
          onPathChange: vi.fn(),
        });
      }).not.toThrow();
      editor.destroy();
    });
  });

  describe('Click behavior', () => {
    it('opens file dialog with .dot/.gv filters', async () => {
      const { setupOpenDiagramAction } = await import('../../src/toolbar/open-diagram');
      setupOpenDiagramAction({
        editor,
        schedulePreviewRender: vi.fn(),
        button,
        onPathChange: vi.fn(),
      });

      button.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(mockDialog.open).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([expect.objectContaining({ extensions: ['dot', 'gv'] })]),
        })
      );
      editor.destroy();
    });

    it('loads selected file content', async () => {
      configureOpenDialog('/path/to/file.dot');
      configureReadTextFile('digraph { loaded }');

      const { setupOpenDiagramAction } = await import('../../src/toolbar/open-diagram');
      setupOpenDiagramAction({
        editor,
        schedulePreviewRender: vi.fn(),
        button,
        onPathChange: vi.fn(),
      });

      button.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(mockFs.readTextFile).toHaveBeenCalledWith('/path/to/file.dot');
      editor.destroy();
    });

    it('updates editor with file content', async () => {
      configureOpenDialog('/path/to/file.dot');
      configureReadTextFile('digraph { new content }');

      const { setupOpenDiagramAction } = await import('../../src/toolbar/open-diagram');
      setupOpenDiagramAction({
        editor,
        schedulePreviewRender: vi.fn(),
        button,
        onPathChange: vi.fn(),
      });

      button.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(editor.state.doc.toString()).toBe('digraph { new content }');
      editor.destroy();
    });

    it('calls onPathChange with file path', async () => {
      configureOpenDialog('/path/to/file.dot');
      configureReadTextFile('content');

      const onPathChange = vi.fn();
      const { setupOpenDiagramAction } = await import('../../src/toolbar/open-diagram');
      setupOpenDiagramAction({
        editor,
        schedulePreviewRender: vi.fn(),
        button,
        onPathChange,
      });

      button.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(onPathChange).toHaveBeenCalledWith('/path/to/file.dot');
      editor.destroy();
    });

    it('handles dialog cancel gracefully', async () => {
      configureOpenDialog(null);

      const onPathChange = vi.fn();
      const { setupOpenDiagramAction } = await import('../../src/toolbar/open-diagram');
      setupOpenDiagramAction({
        editor,
        schedulePreviewRender: vi.fn(),
        button,
        onPathChange,
      });

      button.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(onPathChange).not.toHaveBeenCalled();
      editor.destroy();
    });
  });
});
