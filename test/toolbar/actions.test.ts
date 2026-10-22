import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolbarActionsOptions } from '../../src/toolbar/actions';
import '../mocks/graphviz';
import { resetMockGraphviz } from '../mocks/graphviz';

// Stable mock instances declared outside the factory so they survive vi.resetModules()
// calls between tests while still being the same objects the factory returns.
const mockOpenTextFile = vi.fn();
const mockPickSavePath = vi.fn();
const mockWriteTextFile = vi.fn();

vi.mock('../../src/platform', () => ({
  openTextFile: mockOpenTextFile,
  pickSavePath: mockPickSavePath,
  writeTextFile: mockWriteTextFile,
  writeBinaryFile: vi.fn(),
  store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  confirm: vi.fn().mockResolvedValue(false),
  openExternal: vi.fn(),
  appInfo: vi.fn().mockResolvedValue({ name: 'GraphvizJS', version: '1.0.0' }),
}));

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
    vi.resetAllMocks();
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

  /** The full options for setupToolbarActions: every element is set and every callback is a mock. */
  const makeOptions = (overrides: Partial<ToolbarActionsOptions> = {}): ToolbarActionsOptions => ({
    getEditor: () => editor,
    newDiagramButton,
    openButton,
    saveButton,
    saveAsButton: null,
    exportButton,
    exportMenu,
    examplesButton,
    examplesMenu,
    recentButton: null,
    recentMenu: null,
    findButton: null,
    formatButton: null,
    commitDocument: vi.fn(),
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onLoadExample: vi.fn(),
    onPathChange: vi.fn(),
    onFormat: vi.fn(),
    getPath: () => null,
    getRecent: () => [],
    onPickRecent: vi.fn(),
    getEngine: () => 'dot',
    ...overrides,
  });

  describe('setupToolbarActions()', () => {
    it('sets up all toolbar actions without errors', async () => {
      const { setupToolbarActions } = await import('../../src/toolbar/actions');

      expect(() => {
        setupToolbarActions(makeOptions());
      }).not.toThrow();
    });

    it('handles null buttons gracefully', async () => {
      const { setupToolbarActions } = await import('../../src/toolbar/actions');

      expect(() => {
        setupToolbarActions(
          makeOptions({
            newDiagramButton: null,
            openButton: null,
            saveButton: null,
            exportButton: null,
            exportMenu: null,
            examplesButton: null,
            examplesMenu: null,
          })
        );
      }).not.toThrow();
    });
  });

  describe('New diagram action', () => {
    it('calls onNew when button is clicked', async () => {
      const { setupToolbarActions } = await import('../../src/toolbar/actions');
      const onNew = vi.fn();

      setupToolbarActions(makeOptions({ onNew }));

      newDiagramButton.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(onNew).toHaveBeenCalledTimes(1);
    });
  });

  describe('Open action', () => {
    it('opens dialog when button is clicked', async () => {
      mockOpenTextFile.mockResolvedValue(null);

      const { setupToolbarActions } = await import('../../src/toolbar/actions');

      setupToolbarActions(makeOptions());

      openButton.click();
      await vi.waitFor(() => expect(mockOpenTextFile).toHaveBeenCalled());
    });
  });

  describe('Save action', () => {
    it('saves document when save button is clicked', async () => {
      mockPickSavePath.mockResolvedValue('/path/to/file.dot');

      const { setupToolbarActions } = await import('../../src/toolbar/actions');
      const commitDocument = vi.fn();
      const onPathChange = vi.fn();

      setupToolbarActions(makeOptions({ commitDocument, onPathChange }));

      saveButton.click();
      await vi.waitFor(() => expect(mockPickSavePath).toHaveBeenCalled());
    });
  });

  describe('Export menu', () => {
    it('sets up export menu click handler', async () => {
      const { setupToolbarActions } = await import('../../src/toolbar/actions');

      setupToolbarActions(makeOptions());

      exportButton.click();
      await new Promise((r) => setTimeout(r, 50));

      // Menu should toggle
      expect(exportMenu.hidden).toBe(false);
    });
  });
});
