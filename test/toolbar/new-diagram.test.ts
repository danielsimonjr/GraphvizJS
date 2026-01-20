import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupNewDiagramAction } from '../../src/toolbar/new-diagram';

describe('toolbar/new-diagram', () => {
  let container: HTMLElement;
  let editor: EditorView;
  let button: HTMLButtonElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    editor = new EditorView({
      state: EditorState.create({ doc: 'existing content' }),
      parent: container,
    });

    button = document.createElement('button');
  });

  describe('setupNewDiagramAction()', () => {
    it('attaches click handler', () => {
      const addEventListenerSpy = vi.spyOn(button, 'addEventListener');
      setupNewDiagramAction({
        editor,
        schedulePreviewRender: vi.fn(),
        button,
        defaultSnippet: 'digraph {}',
        onPathChange: vi.fn(),
      });
      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));

      editor.destroy();
    });

    it('handles null button gracefully', () => {
      expect(() => {
        setupNewDiagramAction({
          editor,
          schedulePreviewRender: vi.fn(),
          button: null,
          defaultSnippet: 'digraph {}',
          onPathChange: vi.fn(),
        });
      }).not.toThrow();

      editor.destroy();
    });
  });

  describe('Click behavior', () => {
    it('replaces editor content with default snippet', async () => {
      const defaultSnippet = 'digraph { a -> b }';
      setupNewDiagramAction({
        editor,
        schedulePreviewRender: vi.fn(),
        button,
        defaultSnippet,
        onPathChange: vi.fn(),
      });

      button.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(editor.state.doc.toString()).toBe(defaultSnippet);
      editor.destroy();
    });

    it('calls schedulePreviewRender', async () => {
      const schedulePreviewRender = vi.fn();
      const defaultSnippet = 'digraph {}';
      setupNewDiagramAction({
        editor,
        schedulePreviewRender,
        button,
        defaultSnippet,
        onPathChange: vi.fn(),
      });

      button.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(schedulePreviewRender).toHaveBeenCalledWith(defaultSnippet);
      editor.destroy();
    });

    it('calls onPathChange with null', async () => {
      const onPathChange = vi.fn();
      setupNewDiagramAction({
        editor,
        schedulePreviewRender: vi.fn(),
        button,
        defaultSnippet: 'digraph {}',
        onPathChange,
      });

      button.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(onPathChange).toHaveBeenCalledWith(null);
      editor.destroy();
    });

    it('respects shouldReplace() returning false', async () => {
      const schedulePreviewRender = vi.fn();
      setupNewDiagramAction({
        editor,
        schedulePreviewRender,
        button,
        defaultSnippet: 'digraph {}',
        onPathChange: vi.fn(),
        shouldReplace: () => false,
      });

      button.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(schedulePreviewRender).not.toHaveBeenCalled();
      editor.destroy();
    });

    it('respects shouldReplace() returning true', async () => {
      const schedulePreviewRender = vi.fn();
      setupNewDiagramAction({
        editor,
        schedulePreviewRender,
        button,
        defaultSnippet: 'digraph {}',
        onPathChange: vi.fn(),
        shouldReplace: () => true,
      });

      button.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(schedulePreviewRender).toHaveBeenCalled();
      editor.destroy();
    });
  });
});
