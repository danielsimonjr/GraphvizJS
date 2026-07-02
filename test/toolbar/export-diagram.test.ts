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
import { createExportHandler } from '../../src/toolbar/export-diagram';

const editor = { state: { doc: { toString: () => 'digraph{a->b}' } } };

beforeEach(() => {
  vi.clearAllMocks();
  SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 }) as DOMRect;
});

describe('createExportHandler', () => {
  it('writes SVG text to the chosen path', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/out.svg');
    const handler = createExportHandler({ getEditor: () => editor as never, getPath: () => '/g.dot' });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: expect.stringMatching(/\.svg$/) }),
    );
    expect(writeTextFile).toHaveBeenCalledWith('/out.svg', expect.stringContaining('<svg'));
  });

  it('aborts when the save dialog is cancelled', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const handler = createExportHandler({ getEditor: () => editor as never, getPath: () => null });
    await handler('svg');
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});
