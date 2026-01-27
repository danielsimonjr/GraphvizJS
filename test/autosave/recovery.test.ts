import type { Store } from '@tauri-apps/plugin-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../mocks/tauri';
import { mockDialog, mockStore, resetAllMocks } from '../mocks/tauri';

const store = mockStore as unknown as Store;

describe('autosave/recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    resetAllMocks();
  });

  describe('checkForRecovery()', () => {
    it('returns null when no draft exists', async () => {
      const { checkForRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForRecovery(store);
      expect(result).toBeNull();
    });

    it('returns draft data when valid draft exists', async () => {
      const timestamp = new Date().toISOString();
      mockStore.get
        .mockResolvedValueOnce('digraph { A -> B }') // draftContent
        .mockResolvedValueOnce(timestamp) // draftTimestamp
        .mockResolvedValueOnce('/tmp/test.dot'); // draftFilePath

      const { checkForRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForRecovery(store);

      expect(result).toEqual({
        content: 'digraph { A -> B }',
        timestamp,
        filePath: '/tmp/test.dot',
      });
    });

    it('returns null filePath when draft has no file path', async () => {
      const timestamp = new Date().toISOString();
      mockStore.get
        .mockResolvedValueOnce('digraph {}') // draftContent
        .mockResolvedValueOnce(timestamp) // draftTimestamp
        .mockResolvedValueOnce(null); // draftFilePath

      const { checkForRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForRecovery(store);

      expect(result).not.toBeNull();
      expect(result?.filePath).toBeNull();
    });

    it('returns null and cleans up stale drafts (>7 days)', async () => {
      const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      mockStore.get
        .mockResolvedValueOnce('old content') // draftContent
        .mockResolvedValueOnce(staleDate); // draftTimestamp

      const { checkForRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForRecovery(store);

      expect(result).toBeNull();
      // Should have cleaned up
      expect(mockStore.delete).toHaveBeenCalledWith('draftContent');
      expect(mockStore.delete).toHaveBeenCalledWith('draftTimestamp');
      expect(mockStore.delete).toHaveBeenCalledWith('draftFilePath');
    });

    it('returns null when only content exists (no timestamp)', async () => {
      mockStore.get
        .mockResolvedValueOnce('some content') // draftContent
        .mockResolvedValueOnce(null); // draftTimestamp - missing

      const { checkForRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForRecovery(store);
      expect(result).toBeNull();
    });

    it('handles store errors gracefully', async () => {
      mockStore.get.mockRejectedValueOnce(new Error('Store read failed'));
      const { checkForRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForRecovery(store);
      expect(result).toBeNull();
    });
  });

  describe('promptRecovery()', () => {
    it('returns true when user accepts recovery', async () => {
      mockDialog.confirm.mockResolvedValueOnce(true);
      const { promptRecovery } = await import('../../src/autosave/recovery');
      const result = await promptRecovery({
        content: 'digraph {}',
        timestamp: new Date().toISOString(),
        filePath: '/tmp/test.dot',
      });
      expect(result).toBe(true);
    });

    it('returns false when user declines recovery', async () => {
      mockDialog.confirm.mockResolvedValueOnce(false);
      const { promptRecovery } = await import('../../src/autosave/recovery');
      const result = await promptRecovery({
        content: 'digraph {}',
        timestamp: new Date().toISOString(),
        filePath: null,
      });
      expect(result).toBe(false);
    });

    it('calls confirm with appropriate message', async () => {
      const { promptRecovery } = await import('../../src/autosave/recovery');
      await promptRecovery({
        content: 'digraph {}',
        timestamp: new Date().toISOString(),
        filePath: '/tmp/test.dot',
      });

      expect(mockDialog.confirm).toHaveBeenCalledWith(expect.stringContaining('unsaved draft'), {
        title: 'Recover Unsaved Work',
        kind: 'warning',
      });
    });
  });

  describe('cleanupStaleDrafts()', () => {
    it('deletes all draft keys from store', async () => {
      const { cleanupStaleDrafts } = await import('../../src/autosave/recovery');
      await cleanupStaleDrafts(store);

      expect(mockStore.delete).toHaveBeenCalledWith('draftContent');
      expect(mockStore.delete).toHaveBeenCalledWith('draftTimestamp');
      expect(mockStore.delete).toHaveBeenCalledWith('draftFilePath');
      expect(mockStore.save).toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      mockStore.delete.mockRejectedValueOnce(new Error('Delete failed'));
      const { cleanupStaleDrafts } = await import('../../src/autosave/recovery');
      await expect(cleanupStaleDrafts(store)).resolves.not.toThrow();
    });
  });
});
