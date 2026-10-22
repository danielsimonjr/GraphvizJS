import { searchPanelOpen } from '@codemirror/search';
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
const mockFormatDot = vi.fn();

vi.mock('../../src/platform', () => ({
  openTextFile: mockOpenTextFile,
  pickSavePath: mockPickSavePath,
  writeTextFile: mockWriteTextFile,
  formatDot: mockFormatDot,
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
  let saveAsButton: HTMLButtonElement;
  let recentButton: HTMLButtonElement;
  let recentMenu: HTMLDivElement;
  let findButton: HTMLButtonElement;
  let formatButton: HTMLButtonElement;

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
    exportMenu.hidden = true;
    examplesButton = document.createElement('button');
    examplesMenu = document.createElement('div');
    saveAsButton = document.createElement('button');
    recentButton = document.createElement('button');
    recentMenu = document.createElement('div');
    findButton = document.createElement('button');
    formatButton = document.createElement('button');

    // Setup export menu items
    const pngItem = document.createElement('button');
    pngItem.className = 'toolbar-menu-item';
    pngItem.dataset.export = 'png';
    exportMenu.appendChild(pngItem);
  });

  afterEach(() => {
    editor.destroy();
  });

  /**
   * The full options for setupToolbarActions. The seven core elements are set, and the save-as,
   * recent, find and format elements are null. The callbacks that tests assert on are mocks.
   */
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
    it('sets up the core toolbar actions without errors', async () => {
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

  describe('Save as action', () => {
    it('asks for a new path, writes the document there and commits it as saved', async () => {
      mockPickSavePath.mockResolvedValue('/path/to/copy.dot');
      mockWriteTextFile.mockResolvedValue(undefined);

      const { setupToolbarActions } = await import('../../src/toolbar/actions');
      const commitDocument = vi.fn();
      const onPathChange = vi.fn();

      setupToolbarActions(
        makeOptions({ saveAsButton, commitDocument, onPathChange, getPath: () => '/work/old.dot' })
      );

      saveAsButton.click();
      await vi.waitFor(() => expect(commitDocument).toHaveBeenCalled());

      expect(mockPickSavePath).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: 'old.dot' })
      );
      expect(mockWriteTextFile).toHaveBeenCalledTimes(1);
      expect(mockWriteTextFile).toHaveBeenCalledWith('/path/to/copy.dot', 'digraph { a -> b }');
      expect(onPathChange).toHaveBeenCalledWith('/path/to/copy.dot');
      expect(commitDocument).toHaveBeenCalledWith('digraph { a -> b }', { saved: true });
    });
  });

  describe('Find action', () => {
    it('opens the search panel of the editor when the find button is clicked', async () => {
      const { setupToolbarActions } = await import('../../src/toolbar/actions');

      setupToolbarActions(makeOptions({ findButton }));
      expect(searchPanelOpen(editor.state)).toBe(false);

      findButton.click();

      expect(searchPanelOpen(editor.state)).toBe(true);
    });
  });

  describe('Format action', () => {
    it('formats the editor document and reports the new text', async () => {
      const formatted = 'digraph {\n  a -> b\n}\n';
      mockFormatDot.mockResolvedValue(formatted);

      const { setupToolbarActions } = await import('../../src/toolbar/actions');
      const onFormat = vi.fn();

      setupToolbarActions(makeOptions({ formatButton, onFormat }));

      formatButton.click();
      await vi.waitFor(() => expect(onFormat).toHaveBeenCalledWith(formatted));

      expect(mockFormatDot).toHaveBeenCalledWith('digraph { a -> b }');
      expect(editor.state.doc.toString()).toBe(formatted);
    });
  });

  describe('Recent menu', () => {
    it('lists the recent paths and passes the chosen path on', async () => {
      const { setupToolbarActions } = await import('../../src/toolbar/actions');
      const onPickRecent = vi.fn();

      setupToolbarActions(
        makeOptions({
          recentButton,
          recentMenu,
          getRecent: () => ['/work/one.dot', 'C:\\work\\two.dot'],
          onPickRecent,
        })
      );

      recentMenu.hidden = true;
      recentButton.click();
      const items = [...recentMenu.querySelectorAll<HTMLButtonElement>('.toolbar-menu-item')];

      expect(recentMenu.hidden).toBe(false);
      expect(recentButton.getAttribute('aria-expanded')).toBe('true');
      expect(items.map((item) => item.textContent)).toEqual(['one.dot', 'two.dot']);

      items[1]?.click();

      expect(onPickRecent).toHaveBeenCalledWith('C:\\work\\two.dot');
      expect(recentMenu.hidden).toBe(true);
      expect(recentButton.getAttribute('aria-expanded')).toBe('false');
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
