import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../mocks/graphviz';
import '../mocks/tauri';
import { configureMockSvg, resetMockGraphviz } from '../mocks/graphviz';
import {
  configureOpenDialog,
  configureSaveDialog,
  mockDialog,
  mockFs,
  resetAllMocks,
} from '../mocks/tauri';

describe('toolbar/export-diagram', () => {
  let container: HTMLElement;
  let editor: EditorView;

  beforeEach(() => {
    vi.resetModules();
    resetAllMocks();
    resetMockGraphviz();
    container = document.createElement('div');
    document.body.appendChild(container);

    editor = new EditorView({
      state: EditorState.create({ doc: 'digraph { a -> b }' }),
      parent: container,
    });
  });

  afterEach(() => {
    editor.destroy();
    container.remove();
  });

  describe('createExportHandler()', () => {
    it('returns a function', async () => {
      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => null,
      });
      expect(typeof handler).toBe('function');
    });

    it('does nothing with empty document', async () => {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: '' },
      });

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => null,
      });

      await handler('svg');

      expect(mockDialog.save).not.toHaveBeenCalled();
    });

    it('does nothing with whitespace-only document', async () => {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: '   \n\t  ' },
      });

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => null,
      });

      await handler('svg');

      expect(mockDialog.save).not.toHaveBeenCalled();
    });
  });

  describe('SVG export', () => {
    it('opens save dialog for SVG', async () => {
      configureSaveDialog(null);
      configureMockSvg('<svg></svg>');

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => null,
      });

      await handler('svg');
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([expect.objectContaining({ extensions: ['svg'] })]),
        })
      );
    });

    it('uses default base name when no path', async () => {
      configureSaveDialog('/path/to/output.svg');
      configureMockSvg('<svg></svg>');

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => null,
      });

      await handler('svg');
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'diagram.svg',
        })
      );
    });

    it('uses file base name when path is set', async () => {
      configureSaveDialog('/path/to/output.svg');
      configureMockSvg('<svg></svg>');

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => '/path/to/myfile.dot',
      });

      await handler('svg');
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'myfile.svg',
        })
      );
    });

    it('writes SVG file when path selected', async () => {
      configureSaveDialog('/path/to/export.svg');
      configureMockSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => null,
      });

      await handler('svg');
      await new Promise((r) => setTimeout(r, 100));

      expect(mockFs.writeTextFile).toHaveBeenCalledWith('/path/to/export.svg', expect.any(String));
    });

    it('does nothing when save dialog cancelled', async () => {
      configureSaveDialog(null);
      configureMockSvg('<svg></svg>');

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => null,
      });

      await handler('svg');
      await new Promise((r) => setTimeout(r, 50));

      expect(mockFs.writeTextFile).not.toHaveBeenCalled();
    });
  });

  describe('PNG export', () => {
    it('opens save dialog for PNG', async () => {
      configureSaveDialog(null);
      configureMockSvg('<svg width="100" height="100"></svg>');

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => null,
      });

      await handler('png');
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([expect.objectContaining({ extensions: ['png'] })]),
        })
      );
    });

    it('opens save dialog for PNG @2x with suffix', async () => {
      configureSaveDialog(null);
      configureMockSvg('<svg width="100" height="100"></svg>');

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => null,
      });

      await handler('pngx2');
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'diagram@2x.png',
        })
      );
    });
  });

  describe('Base name inference', () => {
    it('handles path with extension', async () => {
      configureSaveDialog('/output.svg');
      configureMockSvg('<svg></svg>');

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => '/path/to/file.dot',
      });

      await handler('svg');
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'file.svg',
        })
      );
    });

    it('handles path without extension', async () => {
      configureSaveDialog('/output.svg');
      configureMockSvg('<svg></svg>');

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => '/path/to/noextension',
      });

      await handler('svg');
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'noextension.svg',
        })
      );
    });

    it('handles empty path string', async () => {
      configureSaveDialog('/output.svg');
      configureMockSvg('<svg></svg>');

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => '',
      });

      await handler('svg');
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'diagram.svg',
        })
      );
    });

    it('handles whitespace path', async () => {
      configureSaveDialog('/output.svg');
      configureMockSvg('<svg></svg>');

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => '   ',
      });

      await handler('svg');
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'diagram.svg',
        })
      );
    });

    it('handles Windows-style paths', async () => {
      configureSaveDialog('/output.svg');
      configureMockSvg('<svg></svg>');

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => 'C:\\Users\\test\\documents\\graph.gv',
      });

      await handler('svg');
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDialog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'graph.svg',
        })
      );
    });
  });

  describe('Error handling', () => {
    it('handles render error gracefully', async () => {
      configureSaveDialog('/path/to/export.svg');

      // Reset and configure mock to throw
      resetMockGraphviz();
      const { configureMockError } = await import('../mocks/graphviz');
      configureMockError(new Error('Render failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const { createExportHandler } = await import('../../src/toolbar/export-diagram');
      const handler = createExportHandler({
        editor,
        getPath: () => null,
      });

      await handler('svg');
      await new Promise((r) => setTimeout(r, 100));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
