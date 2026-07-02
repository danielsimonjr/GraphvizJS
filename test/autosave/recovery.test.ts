import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockStore, mockConfirm, resetPlatformMocks } from '../mocks/platform';

let store: ReturnType<typeof makeMockStore>;

describe('autosave/recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    store = makeMockStore();
    resetPlatformMocks();
  });

  describe('checkForRecovery()', () => {
    it('returns null when no draft exists', async () => {
      const { checkForRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForRecovery(store);
      expect(result).toBeNull();
    });

    it('returns draft data when valid draft exists', async () => {
      const timestamp = new Date().toISOString();
      store.get
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
      store.get
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
      store.get
        .mockResolvedValueOnce('old content') // draftContent
        .mockResolvedValueOnce(staleDate); // draftTimestamp

      const { checkForRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForRecovery(store);

      expect(result).toBeNull();
      // Should have cleaned up
      expect(store.delete).toHaveBeenCalledWith('draftContent');
      expect(store.delete).toHaveBeenCalledWith('draftTimestamp');
      expect(store.delete).toHaveBeenCalledWith('draftFilePath');
    });

    it('returns null when only content exists (no timestamp)', async () => {
      store.get
        .mockResolvedValueOnce('some content') // draftContent
        .mockResolvedValueOnce(null); // draftTimestamp - missing

      const { checkForRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForRecovery(store);
      expect(result).toBeNull();
    });

    it('handles store errors gracefully', async () => {
      store.get.mockRejectedValueOnce(new Error('Store read failed'));
      const { checkForRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForRecovery(store);
      expect(result).toBeNull();
    });
  });

  describe('promptRecovery()', () => {
    it('returns true when user accepts recovery', async () => {
      mockConfirm.mockResolvedValueOnce(true);
      const { promptRecovery } = await import('../../src/autosave/recovery');
      const result = await promptRecovery({
        content: 'digraph {}',
        timestamp: new Date().toISOString(),
        filePath: '/tmp/test.dot',
      });
      expect(result).toBe(true);
    });

    it('returns false when user declines recovery', async () => {
      mockConfirm.mockResolvedValueOnce(false);
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

      expect(mockConfirm).toHaveBeenCalledWith(expect.stringContaining('unsaved draft'), {
        title: 'Recover Unsaved Work',
        kind: 'warning',
      });
    });
  });

  describe('cleanupStaleDrafts()', () => {
    it('deletes all draft keys from store', async () => {
      const { cleanupStaleDrafts } = await import('../../src/autosave/recovery');
      await cleanupStaleDrafts(store);

      expect(store.delete).toHaveBeenCalledWith('draftContent');
      expect(store.delete).toHaveBeenCalledWith('draftTimestamp');
      expect(store.delete).toHaveBeenCalledWith('draftFilePath');
      expect(store.delete).toHaveBeenCalledWith('tabDrafts');
    });

    it('handles errors gracefully', async () => {
      store.delete.mockRejectedValueOnce(new Error('Delete failed'));
      const { cleanupStaleDrafts } = await import('../../src/autosave/recovery');
      await expect(cleanupStaleDrafts(store)).resolves.not.toThrow();
    });
  });

  describe('checkForMultiTabRecovery()', () => {
    it('returns null when no drafts exist', async () => {
      store.get.mockResolvedValue(null);
      const { checkForMultiTabRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForMultiTabRecovery(store);
      expect(result).toBeNull();
    });

    it('returns multi-tab data when valid drafts exist', async () => {
      const timestamp = new Date().toISOString();
      store.get.mockResolvedValueOnce({
        tabs: [
          { content: 'digraph { A }', filePath: '/tmp/a.dot' },
          { content: 'graph { B }', filePath: null },
        ],
        timestamp,
      });

      const { checkForMultiTabRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForMultiTabRecovery(store);

      expect(result).toEqual({
        tabs: [
          { content: 'digraph { A }', filePath: '/tmp/a.dot' },
          { content: 'graph { B }', filePath: null },
        ],
        timestamp,
      });
    });

    it('returns null and cleans up stale multi-tab drafts (>7 days)', async () => {
      const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      store.get.mockResolvedValueOnce({
        tabs: [{ content: 'old content', filePath: null }],
        timestamp: staleDate,
      });

      const { checkForMultiTabRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForMultiTabRecovery(store);

      expect(result).toBeNull();
      expect(store.delete).toHaveBeenCalledWith('tabDrafts');
    });

    it('falls back to legacy single-tab format when no multi-tab data', async () => {
      const timestamp = new Date().toISOString();
      // First call returns null for tabDrafts
      store.get
        .mockResolvedValueOnce(null) // tabDrafts
        .mockResolvedValueOnce('legacy content') // draftContent
        .mockResolvedValueOnce(timestamp) // draftTimestamp
        .mockResolvedValueOnce('/legacy/path.dot'); // draftFilePath

      const { checkForMultiTabRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForMultiTabRecovery(store);

      expect(result).toEqual({
        tabs: [{ content: 'legacy content', filePath: '/legacy/path.dot' }],
        timestamp,
      });
    });

    it('returns null when multi-tab data has empty tabs array', async () => {
      store.get
        .mockResolvedValueOnce({ tabs: [], timestamp: new Date().toISOString() }) // tabDrafts with empty tabs
        .mockResolvedValueOnce(null); // fallback: no draftContent

      const { checkForMultiTabRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForMultiTabRecovery(store);

      expect(result).toBeNull();
    });

    it('handles store errors gracefully', async () => {
      store.get.mockRejectedValueOnce(new Error('Store read failed'));
      const { checkForMultiTabRecovery } = await import('../../src/autosave/recovery');
      const result = await checkForMultiTabRecovery(store);
      expect(result).toBeNull();
    });
  });

  describe('promptMultiTabRecovery()', () => {
    it('returns true when user accepts recovery', async () => {
      mockConfirm.mockResolvedValueOnce(true);
      const { promptMultiTabRecovery } = await import('../../src/autosave/recovery');
      const result = await promptMultiTabRecovery({
        tabs: [
          { content: 'digraph {}', filePath: '/tmp/test.dot' },
          { content: 'graph {}', filePath: null },
        ],
        timestamp: new Date().toISOString(),
      });
      expect(result).toBe(true);
    });

    it('returns false when user declines recovery', async () => {
      mockConfirm.mockResolvedValueOnce(false);
      const { promptMultiTabRecovery } = await import('../../src/autosave/recovery');
      const result = await promptMultiTabRecovery({
        tabs: [{ content: 'digraph {}', filePath: null }],
        timestamp: new Date().toISOString(),
      });
      expect(result).toBe(false);
    });

    it('shows singular tab label for 1 tab', async () => {
      const { promptMultiTabRecovery } = await import('../../src/autosave/recovery');
      await promptMultiTabRecovery({
        tabs: [{ content: 'digraph {}', filePath: null }],
        timestamp: new Date().toISOString(),
      });

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.stringContaining('1 tab'),
        expect.any(Object)
      );
    });

    it('shows plural tab label for multiple tabs', async () => {
      const { promptMultiTabRecovery } = await import('../../src/autosave/recovery');
      await promptMultiTabRecovery({
        tabs: [
          { content: 'a', filePath: null },
          { content: 'b', filePath: null },
          { content: 'c', filePath: null },
        ],
        timestamp: new Date().toISOString(),
      });

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.stringContaining('3 tabs'),
        expect.any(Object)
      );
    });

    it('calls confirm with appropriate title', async () => {
      const { promptMultiTabRecovery } = await import('../../src/autosave/recovery');
      await promptMultiTabRecovery({
        tabs: [{ content: 'digraph {}', filePath: null }],
        timestamp: new Date().toISOString(),
      });

      expect(mockConfirm).toHaveBeenCalledWith(expect.any(String), {
        title: 'Recover Unsaved Work',
        kind: 'warning',
      });
    });
  });
});
