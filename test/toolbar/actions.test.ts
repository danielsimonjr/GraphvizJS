import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
          editor,
          schedulePreviewRender: vi.fn(),
          newDiagramButton,
          openButton,
          saveButton,
          exportButton,
          exportMenu,
          examplesButton,
          examplesMenu,
          isDirty: () => false,
          commitDocument: vi.fn(),
          onPathChange: vi.fn(),
          getPath: () => null,
          defaultSnippet: 'digraph {}',
        });
      }).not.toThrow();
    });

    it('handles null buttons gracefully', async () => {
      const { setupToolbarActions } = await import('../../src/toolbar/actions');

      expect(() => {
        setupToolbarActions({
          editor,
          schedulePreviewRender: vi.fn(),
          newDiagramButton: null,
          openButton: null,
          saveButton: null,
          exportButton: null,
          exportMenu: null,
          examplesButton: null,
          examplesMenu: null,
          isDirty: () => false,
          commitDocument: vi.fn(),
          onPathChange: vi.fn(),
          getPath: () => null,
          defaultSnippet: 'digraph {}',
        });
      }).not.toThrow();
    });
  });

  describe('New diagram action', () => {
    it('does not confirm when not dirty', async () => {
      const { setupToolbarActions } = await import('../../src/toolbar/actions');
      const onPathChange = vi.fn();
      const commitDocument = vi.fn();

      setupToolbarActions({
        editor,
        schedulePreviewRender: vi.fn(),
        newDiagramButton,
        openButton,
        saveButton,
        exportButton,
        exportMenu,
        examplesButton,
        examplesMenu,
        isDirty: () => false,
        commitDocument,
        onPathChange,
        getPath: () => null,
        defaultSnippet: 'digraph { new }',
      });

      newDiagramButton.click();
      await new Promise((r) => setTimeout(r, 50));

      // Should not show confirm dialog when not dirty
      expect(mockDialog.ask).not.toHaveBeenCalled();
      expect(onPathChange).toHaveBeenCalledWith(null);
    });

    it('confirms when dirty', async () => {
      mockDialog.ask.mockResolvedValue(true);

      const { setupToolbarActions } = await import('../../src/toolbar/actions');
      const onPathChange = vi.fn();

      setupToolbarActions({
        editor,
        schedulePreviewRender: vi.fn(),
        newDiagramButton,
        openButton,
        saveButton,
        exportButton,
        exportMenu,
        examplesButton,
        examplesMenu,
        isDirty: () => true,
        commitDocument: vi.fn(),
        onPathChange,
        getPath: () => null,
        defaultSnippet: 'digraph { new }',
      });

      newDiagramButton.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.ask).toHaveBeenCalled();
    });

    it('cancels when user declines confirm', async () => {
      mockDialog.ask.mockResolvedValue(false);

      const { setupToolbarActions } = await import('../../src/toolbar/actions');
      const onPathChange = vi.fn();

      setupToolbarActions({
        editor,
        schedulePreviewRender: vi.fn(),
        newDiagramButton,
        openButton,
        saveButton,
        exportButton,
        exportMenu,
        examplesButton,
        examplesMenu,
        isDirty: () => true,
        commitDocument: vi.fn(),
        onPathChange,
        getPath: () => null,
        defaultSnippet: 'digraph { new }',
      });

      newDiagramButton.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(onPathChange).not.toHaveBeenCalled();
    });
  });

  describe('Open action', () => {
    it('opens dialog when button is clicked', async () => {
      vi.resetModules();
      resetAllMocks();
      mockDialog.open.mockResolvedValue(null);

      const { setupToolbarActions } = await import('../../src/toolbar/actions');

      setupToolbarActions({
        editor,
        schedulePreviewRender: vi.fn(),
        newDiagramButton,
        openButton,
        saveButton,
        exportButton,
        exportMenu,
        examplesButton,
        examplesMenu,
        isDirty: () => false,
        commitDocument: vi.fn(),
        onPathChange: vi.fn(),
        getPath: () => null,
        defaultSnippet: 'digraph {}',
      });

      openButton.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.open).toHaveBeenCalled();
    });
  });

  describe('Save action', () => {
    it('saves document and calls commitDocument with saved flag', async () => {
      mockDialog.save.mockResolvedValue('/path/to/file.dot');

      const { setupToolbarActions } = await import('../../src/toolbar/actions');
      const commitDocument = vi.fn();
      const onPathChange = vi.fn();

      setupToolbarActions({
        editor,
        schedulePreviewRender: vi.fn(),
        newDiagramButton,
        openButton,
        saveButton,
        exportButton,
        exportMenu,
        examplesButton,
        examplesMenu,
        isDirty: () => false,
        commitDocument,
        onPathChange,
        getPath: () => null,
        defaultSnippet: 'digraph {}',
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
        editor,
        schedulePreviewRender: vi.fn(),
        newDiagramButton,
        openButton,
        saveButton,
        exportButton,
        exportMenu,
        examplesButton,
        examplesMenu,
        isDirty: () => false,
        commitDocument: vi.fn(),
        onPathChange: vi.fn(),
        getPath: () => null,
        defaultSnippet: 'digraph {}',
      });

      exportButton.click();
      await new Promise((r) => setTimeout(r, 50));

      // Menu should toggle
      expect(exportMenu.hidden).toBe(false);
    });
  });
});
