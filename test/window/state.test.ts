import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/platform', () => ({ store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() } }));

import { store } from '../../src/platform';
import { loadEditorZoom, saveEditorZoom } from '../../src/window/state';

beforeEach(() => vi.clearAllMocks());

describe('editor zoom persistence', () => {
  it('loads zoom from the store', async () => {
    (store.get as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    expect(await loadEditorZoom()).toBe(2);
    expect(store.get).toHaveBeenCalledWith('editorZoom');
  });

  it('returns null when unset', async () => {
    (store.get as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    expect(await loadEditorZoom()).toBeNull();
  });

  it('returns null on error', async () => {
    (store.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Get failed'));
    expect(await loadEditorZoom()).toBeNull();
  });

  it('saves zoom to the store', async () => {
    await saveEditorZoom(3);
    expect(store.set).toHaveBeenCalledWith('editorZoom', 3);
  });

  it('handles errors gracefully', async () => {
    (store.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Set failed'));
    await expect(saveEditorZoom(1.5)).resolves.not.toThrow();
  });
});
