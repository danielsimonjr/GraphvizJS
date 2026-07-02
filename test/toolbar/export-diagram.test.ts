import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/platform', () => ({
  pickSavePath: vi.fn(),
  writeTextFile: vi.fn(),
  writeBinaryFile: vi.fn(),
}));
vi.mock('../../src/preview/graphviz', () => ({
  renderDotToSvg: vi.fn().mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
}));

import { pickSavePath, writeTextFile } from '../../src/platform';
import { renderDotToSvg } from '../../src/preview/graphviz';
import { createExportHandler } from '../../src/toolbar/export-diagram';

const editor = { state: { doc: { toString: () => 'digraph{a->b}' } } };

beforeEach(() => {
  vi.clearAllMocks();
  SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 }) as DOMRect;
});

describe('createExportHandler', () => {
  it('writes SVG text to the chosen path', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/out.svg');
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => '/g.dot',
    });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'g.svg' }));
    expect(writeTextFile).toHaveBeenCalledWith('/out.svg', expect.stringContaining('<svg'));
  });

  it('aborts when the save dialog is cancelled', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const handler = createExportHandler({ getEditor: () => editor as never, getPath: () => null });
    await handler('svg');
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it('does nothing with empty document', async () => {
    const emptyEditor = { state: { doc: { toString: () => '' } } };
    const handler = createExportHandler({
      getEditor: () => emptyEditor as never,
      getPath: () => null,
    });
    await handler('svg');
    expect(pickSavePath).not.toHaveBeenCalled();
  });

  it('does nothing with whitespace-only document', async () => {
    const wsEditor = { state: { doc: { toString: () => '   \n\t  ' } } };
    const handler = createExportHandler({
      getEditor: () => wsEditor as never,
      getPath: () => null,
    });
    await handler('svg');
    expect(pickSavePath).not.toHaveBeenCalled();
  });

  it('passes SVG filter to save dialog', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/out.svg');
    const handler = createExportHandler({ getEditor: () => editor as never, getPath: () => null });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.arrayContaining([{ name: 'SVG Image', extensions: ['svg'] }]),
      })
    );
  });

  it('uses default base name when path is null', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/out.svg');
    const handler = createExportHandler({ getEditor: () => editor as never, getPath: () => null });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'diagram.svg' })
    );
  });

  it('derives base name from file path', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/out.svg');
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => '/path/to/myfile.dot',
    });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'myfile.svg' })
    );
  });

  it('handles path without extension', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/out.svg');
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => '/path/to/noextension',
    });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'noextension.svg' })
    );
  });

  it('uses default base name for empty path string', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/out.svg');
    const handler = createExportHandler({ getEditor: () => editor as never, getPath: () => '' });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'diagram.svg' })
    );
  });

  it('uses default base name for whitespace path', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/out.svg');
    const handler = createExportHandler({ getEditor: () => editor as never, getPath: () => '   ' });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'diagram.svg' })
    );
  });

  it('handles Windows-style path', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/out.svg');
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => 'C:\\Users\\test\\documents\\graph.gv',
    });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'graph.svg' })
    );
  });

  it('handles render error gracefully', async () => {
    (renderDotToSvg as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Render failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = createExportHandler({ getEditor: () => editor as never, getPath: () => null });
    await handler('svg');
    expect(consoleSpy).toHaveBeenCalled();
    expect(pickSavePath).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handles path with extension', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/out.svg');
    const handler = createExportHandler({
      getEditor: () => editor as never,
      getPath: () => '/path/to/file.dot',
    });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'file.svg' }));
  });
});
