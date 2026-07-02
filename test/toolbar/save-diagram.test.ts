import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupSaveDiagramAction } from '../../src/toolbar/save-diagram';

vi.mock('../../src/platform', () => ({ pickSavePath: vi.fn(), writeTextFile: vi.fn() }));
import { pickSavePath, writeTextFile } from '../../src/platform';

const editor = { state: { doc: { toString: () => 'digraph{}' } } };
beforeEach(() => vi.clearAllMocks());

describe('setupSaveDiagramAction', () => {
  it('writes to the existing path without prompting', async () => {
    const button = document.createElement('button');
    const onPathChange = vi.fn();
    setupSaveDiagramAction({
      getEditor: () => editor as never,
      button,
      getPath: () => '/existing.dot',
      onPathChange,
    });
    button.click();
    await vi.waitFor(() => expect(writeTextFile).toHaveBeenCalledWith('/existing.dot', 'digraph{}'));
    expect(pickSavePath).not.toHaveBeenCalled();
    expect(onPathChange).toHaveBeenCalledWith('/existing.dot');
  });

  it('prompts for a path when none is set', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/new.dot');
    const button = document.createElement('button');
    const onPathChange = vi.fn();
    setupSaveDiagramAction({ getEditor: () => editor as never, button, getPath: () => null, onPathChange });
    button.click();
    await vi.waitFor(() => expect(writeTextFile).toHaveBeenCalledWith('/new.dot', 'digraph{}'));
    expect(onPathChange).toHaveBeenCalledWith('/new.dot');
  });
});
