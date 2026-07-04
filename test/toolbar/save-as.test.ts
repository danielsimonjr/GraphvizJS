import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/platform', () => ({ pickSavePath: vi.fn(), writeTextFile: vi.fn() }));

import { pickSavePath, writeTextFile } from '../../src/platform';
import { performSaveAs } from '../../src/toolbar/save-as';

const editor = { state: { doc: { toString: () => 'digraph{a}' } } } as never;
beforeEach(() => vi.clearAllMocks());

describe('performSaveAs', () => {
  it('always prompts for a path even when one already exists', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValueOnce('C:/new.dot');
    (writeTextFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const onPathChange = vi.fn();
    const onSave = vi.fn();
    await performSaveAs({
      getEditor: () => editor,
      getPath: () => 'C:/old.dot',
      onPathChange,
      onSave,
    });
    expect(pickSavePath).toHaveBeenCalledTimes(1);
    expect(writeTextFile).toHaveBeenCalledWith('C:/new.dot', 'digraph{a}');
    expect(onPathChange).toHaveBeenCalledWith('C:/new.dot');
    expect(onSave).toHaveBeenCalledWith('digraph{a}', 'C:/new.dot');
  });

  it('is a no-op when the dialog is cancelled', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const onSave = vi.fn();
    await performSaveAs({
      getEditor: () => editor,
      getPath: () => null,
      onPathChange: vi.fn(),
      onSave,
    });
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
