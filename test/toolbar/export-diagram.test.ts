import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/platform', () => ({
  exportRender: vi.fn(),
  pickSavePath: vi.fn(),
  writeBinaryFile: vi.fn(),
}));
vi.mock('../../src/toolbar/pdf-options-dialog', () => ({
  openPdfOptionsDialog: vi.fn(),
}));

import { exportRender, pickSavePath, writeBinaryFile } from '../../src/platform';
import { createExportHandler } from '../../src/toolbar/export-diagram';
import { openPdfOptionsDialog } from '../../src/toolbar/pdf-options-dialog';

const editor = { state: { doc: { toString: () => 'digraph{a->b}' } } };
const PDF_OPTIONS = { mode: 'fit', pageSize: 'letter', orientation: 'auto' } as const;
const BYTES = new Uint8Array([1, 2, 3]);

beforeEach(() => {
  vi.clearAllMocks();
  (exportRender as ReturnType<typeof vi.fn>).mockResolvedValue(BYTES);
  (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/out.svg');
  (openPdfOptionsDialog as ReturnType<typeof vi.fn>).mockResolvedValue(PDF_OPTIONS);
});

describe('createExportHandler', () => {
  it('reads DOT from the editor and renders svg via exportRender, then writes the bytes', async () => {
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => '/g.dot',
      getEngine: () => 'dot',
    });
    await handler('svg');
    expect(exportRender).toHaveBeenCalledWith('digraph{a->b}', 'dot', 'svg', undefined);
    expect(writeBinaryFile).toHaveBeenCalledWith('/out.svg', BYTES);
  });

  it('renders png via exportRender', async () => {
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => null,
      getEngine: () => 'neato',
    });
    await handler('png');
    expect(exportRender).toHaveBeenCalledWith('digraph{a->b}', 'neato', 'png', undefined);
  });

  it('renders pngx2 via exportRender', async () => {
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => null,
      getEngine: () => 'dot',
    });
    await handler('pngx2');
    expect(exportRender).toHaveBeenCalledWith('digraph{a->b}', 'dot', 'pngx2', undefined);
  });

  it('opens the PDF options dialog and passes the chosen options to exportRender', async () => {
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => null,
      getEngine: () => 'dot',
    });
    await handler('pdf');
    expect(openPdfOptionsDialog).toHaveBeenCalled();
    expect(exportRender).toHaveBeenCalledWith('digraph{a->b}', 'dot', 'pdf', PDF_OPTIONS);
  });

  it('aborts the PDF export when the options dialog is cancelled', async () => {
    (openPdfOptionsDialog as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => null,
      getEngine: () => 'dot',
    });
    await handler('pdf');
    expect(pickSavePath).not.toHaveBeenCalled();
    expect(exportRender).not.toHaveBeenCalled();
    expect(writeBinaryFile).not.toHaveBeenCalled();
  });

  it('aborts when the save dialog is cancelled', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => null,
      getEngine: () => 'dot',
    });
    await handler('svg');
    expect(exportRender).not.toHaveBeenCalled();
    expect(writeBinaryFile).not.toHaveBeenCalled();
  });

  it('does nothing with empty document', async () => {
    const emptyEditor = { state: { doc: { toString: () => '' } } };
    const handler = createExportHandler({
      getEditor: () => emptyEditor as never,
      getPath: () => null,
      getEngine: () => 'dot',
    });
    await handler('svg');
    expect(pickSavePath).not.toHaveBeenCalled();
    expect(exportRender).not.toHaveBeenCalled();
  });

  it('does nothing with whitespace-only document', async () => {
    const wsEditor = { state: { doc: { toString: () => '   \n\t  ' } } };
    const handler = createExportHandler({
      getEditor: () => wsEditor as never,
      getPath: () => null,
      getEngine: () => 'dot',
    });
    await handler('svg');
    expect(pickSavePath).not.toHaveBeenCalled();
  });

  it('passes SVG filter to save dialog', async () => {
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => null,
      getEngine: () => 'dot',
    });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.arrayContaining([{ name: 'SVG Image', extensions: ['svg'] }]),
      })
    );
  });

  it('uses a @2x suffix for the pngx2 default filename', async () => {
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => '/g.dot',
      getEngine: () => 'dot',
    });
    await handler('pngx2');
    expect(pickSavePath).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'g@2x.png' }));
  });

  it('uses default base name when path is null', async () => {
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => null,
      getEngine: () => 'dot',
    });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'diagram.svg' })
    );
  });

  it('derives base name from file path', async () => {
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => '/path/to/myfile.dot',
      getEngine: () => 'dot',
    });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'myfile.svg' })
    );
  });

  it('handles path without extension', async () => {
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => '/path/to/noextension',
      getEngine: () => 'dot',
    });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'noextension.svg' })
    );
  });

  it('uses default base name for empty path string', async () => {
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => '',
      getEngine: () => 'dot',
    });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'diagram.svg' })
    );
  });

  it('uses default base name for whitespace path', async () => {
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => '   ',
      getEngine: () => 'dot',
    });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'diagram.svg' })
    );
  });

  it('handles Windows-style path', async () => {
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => 'C:\\Users\\test\\documents\\graph.gv',
      getEngine: () => 'dot',
    });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'graph.svg' })
    );
  });

  it('handles path with extension', async () => {
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => '/path/to/file.dot',
      getEngine: () => 'dot',
    });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'file.svg' }));
  });

  it('handles render error gracefully', async () => {
    (exportRender as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Render failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => null,
      getEngine: () => 'dot',
    });
    await handler('svg');
    expect(consoleSpy).toHaveBeenCalled();
    expect(writeBinaryFile).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
