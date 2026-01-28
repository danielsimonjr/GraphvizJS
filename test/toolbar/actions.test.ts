import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../mocks/graphviz';
import '../mocks/tauri';
import { resetMockGraphviz } from '../mocks/graphviz';
import { mockDialog, resetAllMocks } from '../mocks/tauri';

describe('toolbar/actions', () => {
  let container: HTMLElement;
  let editor: EditorView;
  let newDiagramButton: HTMLButtonElement;
  let openButton: HTMLButtonElement;
  let saveButton: HTMLButtonElement;
  let exportButton: HTMLButtonElement;
  let exportMenu: HTMLDivElement;
  let examplesButton: HTMLButtonElement;
  let examplesMenu: HTMLDivElement;

  beforeEach(() => {
    vi.resetModules();
    resetAllMocks();
    resetMockGraphviz();

    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);

    editor = new EditorView({
      state: EditorState.create({ doc: 'digraph { a -> b }' }),
      parent: container,
    });

    // Create toolbar elements
    newDiagramButton = document.createElement('button');
    openButton = document.createElement('button');
    saveButton = document.createElement('button');
    exportButton = document.createElement('button');
    exportMenu = document.createElement('div');
    examplesButton = document.createElement('button');
    examplesMenu = document.createElement('div');

    // Setup export menu items
    const pngItem = document.createElement('button');
    pngItem.className = 'toolbar-menu-item';
    pngItem.dataset.export = 'png';
    exportMenu.appendChild(pngItem);
  });

  afterEach(() => {
    editor.destroy();
  });

  describe('setupToolbarActions()', () => {
    it('sets up all toolbar actions without errors', async () => {
      const { setupToolbarActions } = await import('../../src/toolbar/actions');

      expect(() => {
        setupToolbarActions({
          getEditor: () => editor,

          newDiagramButton,
          openButton,
          saveButton,
          exportButton,
          exportMenu,
          examplesButton,
          examplesMenu,
          commitDocument: vi.fn(),
          onNew: vi.fn(),
          onOpen: vi.fn(),
          onLoadExample: vi.fn(),
          onPathChange: vi.fn(),
          getPath: () => null,
        });
      }).not.toThrow();
    });

    it('handles null buttons gracefully', async () => {
      const { setupToolbarActions } = await import('../../src/toolbar/actions');

      expect(() => {
        setupToolbarActions({
          getEditor: () => editor,

          newDiagramButton: null,
          openButton: null,
          saveButton: null,
          exportButton: null,
          exportMenu: null,
          examplesButton: null,
          examplesMenu: null,
          commitDocument: vi.fn(),
          onNew: vi.fn(),
          onOpen: vi.fn(),
          onLoadExample: vi.fn(),
          onPathChange: vi.fn(),
          getPath: () => null,
        });
      }).not.toThrow();
    });
  });

  describe('New diagram action', () => {
    it('calls onNew when button is clicked', async () => {
      const { setupToolbarActions } = await import('../../src/toolbar/actions');
      const onNew = vi.fn();

      setupToolbarActions({
        getEditor: () => editor,
        schedulePreviewRender: vi.fn(),
        newDiagramButton,
        openButton,
        saveButton,
        exportButton,
        exportMenu,
        examplesButton,
        examplesMenu,
        commitDocument: vi.fn(),
        onNew,
        onOpen: vi.fn(),
        onPathChange: vi.fn(),
        getPath: () => null,
      });

      newDiagramButton.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(onNew).toHaveBeenCalledTimes(1);
    });
  });

  describe('Open action', () => {
    it('opens dialog when button is clicked', async () => {
      vi.resetModules();
      resetAllMocks();
      mockDialog.open.mockResolvedValue(null);

      const { setupToolbarActions } = await import('../../src/toolbar/actions');

      setupToolbarActions({
        getEditor: () => editor,
        schedulePreviewRender: vi.fn(),
        newDiagramButton,
        openButton,
        saveButton,
        exportButton,
        exportMenu,
        examplesButton,
        examplesMenu,
        commitDocument: vi.fn(),
        onNew: vi.fn(),
        onOpen: vi.fn(),
        onPathChange: vi.fn(),
        getPath: () => null,
      });

      openButton.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.open).toHaveBeenCalled();
    });
  });

  describe('Save action', () => {
    it('saves document when save button is clicked', async () => {
      mockDialog.save.mockResolvedValue('/path/to/file.dot');

      const { setupToolbarActions } = await import('../../src/toolbar/actions');
      const commitDocument = vi.fn();
      const onPathChange = vi.fn();

      setupToolbarActions({
        getEditor: () => editor,
        schedulePreviewRender: vi.fn(),
        newDiagramButton,
        openButton,
        saveButton,
        exportButton,
        exportMenu,
        examplesButton,
        examplesMenu,
        commitDocument,
        onNew: vi.fn(),
        onOpen: vi.fn(),
        onLoadExample: vi.fn(),
        onPathChange,
        getPath: () => null,
      });

      saveButton.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.save).toHaveBeenCalled();
    });
  });

  describe('Export menu', () => {
    it('sets up export menu click handler', async () => {
      const { setupToolbarActions } = await import('../../src/toolbar/actions');

      setupToolbarActions({
        getEditor: () => editor,
        schedulePreviewRender: vi.fn(),
        newDiagramButton,
        openButton,
        saveButton,
        exportButton,
        exportMenu,
        examplesButton,
        examplesMenu,
        commitDocument: vi.fn(),
        onNew: vi.fn(),
        onOpen: vi.fn(),
        onPathChange: vi.fn(),
        getPath: () => null,
      });

      exportButton.click();
      await new Promise((r) => setTimeout(r, 50));

      // Menu should toggle
      expect(exportMenu.hidden).toBe(false);
    });
  });
});
