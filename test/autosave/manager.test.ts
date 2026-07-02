import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockStore, resetPlatformMocks } from '../mocks/platform';

let store: ReturnType<typeof makeMockStore>;

describe('autosave/manager', () => {
  beforeEach(() => {
    vi.resetModules();
    store = makeMockStore();
    resetPlatformMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('setupAutosave()', () => {
    it('returns a cleanup function', async () => {
      const { setupAutosave } = await import('../../src/autosave/manager');
      const cleanup = setupAutosave({
        store,
        getContent: () => 'digraph {}',
        getFilePath: () => null,
      });
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('saves draft after interval when content changes', async () => {
      const { setupAutosave } = await import('../../src/autosave/manager');
      const cleanup = setupAutosave({
        store,
        getContent: () => 'digraph { A -> B }',
        getFilePath: () => '/tmp/test.dot',
      });

      await vi.advanceTimersByTimeAsync(30_000);

      expect(store.set).toHaveBeenCalledWith('draftContent', 'digraph { A -> B }');
      expect(store.set).toHaveBeenCalledWith('draftFilePath', '/tmp/test.dot');
      expect(store.set).toHaveBeenCalledWith('draftTimestamp', expect.any(String));
      cleanup();
    });

    it('does not re-save when content is unchanged', async () => {
      const { setupAutosave } = await import('../../src/autosave/manager');
      const cleanup = setupAutosave({
        store,
        getContent: () => 'digraph {}',
        getFilePath: () => null,
      });

      // First interval: saves (3 set calls: content, timestamp, filePath)
      await vi.advanceTimersByTimeAsync(30_000);
      expect(store.set).toHaveBeenCalledTimes(3);

      // Second interval: same content, should not save again
      await vi.advanceTimersByTimeAsync(30_000);
      expect(store.set).toHaveBeenCalledTimes(3);

      cleanup();
    });

    it('calls onDraftSaved callback after saving', async () => {
      const onDraftSaved = vi.fn();
      const { setupAutosave } = await import('../../src/autosave/manager');
      const cleanup = setupAutosave(
        {
          store,
          getContent: () => 'digraph {}',
          getFilePath: () => null,
        },
        onDraftSaved
      );

      await vi.advanceTimersByTimeAsync(30_000);
      expect(onDraftSaved).toHaveBeenCalledTimes(1);
      cleanup();
    });

    it('handles store errors gracefully', async () => {
      store.set.mockRejectedValueOnce(new Error('Store write failed'));
      const { setupAutosave } = await import('../../src/autosave/manager');
      const cleanup = setupAutosave({
        store,
        getContent: () => 'digraph {}',
        getFilePath: () => null,
      });

      // Should not throw
      await vi.advanceTimersByTimeAsync(30_000);
      cleanup();
    });

    it('stops saving after cleanup is called', async () => {
      const { setupAutosave } = await import('../../src/autosave/manager');
      let content = 'v1';
      const cleanup = setupAutosave({
        store,
        getContent: () => content,
        getFilePath: () => null,
      });

      await vi.advanceTimersByTimeAsync(30_000);
      expect(store.set).toHaveBeenCalledTimes(3);

      cleanup();
      content = 'v2';

      await vi.advanceTimersByTimeAsync(30_000);
      // Should not have saved again
      expect(store.set).toHaveBeenCalledTimes(3);
    });
  });

  describe('saveDraft()', () => {
    it('saves content, timestamp, and filePath to store', async () => {
      const { saveDraft } = await import('../../src/autosave/manager');
      await saveDraft(store, 'digraph { X }', '/path/to/file.dot');

      expect(store.set).toHaveBeenCalledWith('draftContent', 'digraph { X }');
      expect(store.set).toHaveBeenCalledWith('draftTimestamp', expect.any(String));
      expect(store.set).toHaveBeenCalledWith('draftFilePath', '/path/to/file.dot');
    });

    it('saves null filePath for unsaved diagrams', async () => {
      const { saveDraft } = await import('../../src/autosave/manager');
      await saveDraft(store, 'digraph {}', null);

      expect(store.set).toHaveBeenCalledWith('draftFilePath', null);
    });
  });

  describe('clearDraft()', () => {
    it('deletes all draft keys from store', async () => {
      const { clearDraft } = await import('../../src/autosave/manager');
      await clearDraft(store);

      expect(store.delete).toHaveBeenCalledWith('draftContent');
      expect(store.delete).toHaveBeenCalledWith('draftTimestamp');
      expect(store.delete).toHaveBeenCalledWith('draftFilePath');
    });

    it('handles errors gracefully', async () => {
      store.delete.mockRejectedValueOnce(new Error('Delete failed'));
      const { clearDraft } = await import('../../src/autosave/manager');
      await expect(clearDraft(store)).resolves.not.toThrow();
    });

    it('deletes tabDrafts key as well', async () => {
      const { clearDraft } = await import('../../src/autosave/manager');
      await clearDraft(store);

      expect(store.delete).toHaveBeenCalledWith('tabDrafts');
    });
  });

  describe('setupMultiTabAutosave()', () => {
    it('returns a cleanup function', async () => {
      const { setupMultiTabAutosave } = await import('../../src/autosave/manager');
      const cleanup = setupMultiTabAutosave({
        store,
        getTabDrafts: () => [{ content: 'digraph {}', filePath: null }],
      });
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('saves tab drafts after interval when content changes', async () => {
      const { setupMultiTabAutosave } = await import('../../src/autosave/manager');
      const cleanup = setupMultiTabAutosave({
        store,
        getTabDrafts: () => [
          { content: 'digraph { A -> B }', filePath: '/tmp/test.dot' },
          { content: 'graph { X -- Y }', filePath: null },
        ],
      });

      await vi.advanceTimersByTimeAsync(30_000);

      expect(store.set).toHaveBeenCalledWith(
        'tabDrafts',
        expect.objectContaining({
          tabs: [
            { content: 'digraph { A -> B }', filePath: '/tmp/test.dot' },
            { content: 'graph { X -- Y }', filePath: null },
          ],
          timestamp: expect.any(String),
        })
      );
      cleanup();
    });

    it('does not re-save when content is unchanged', async () => {
      const { setupMultiTabAutosave } = await import('../../src/autosave/manager');
      const tabs = [{ content: 'digraph {}', filePath: null }];
      const cleanup = setupMultiTabAutosave({
        store,
        getTabDrafts: () => tabs,
      });

      // First interval: saves (1 set call for tabDrafts)
      await vi.advanceTimersByTimeAsync(30_000);
      expect(store.set).toHaveBeenCalledTimes(1);

      // Second interval: same content, should not save again
      await vi.advanceTimersByTimeAsync(30_000);
      expect(store.set).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('saves again when content changes', async () => {
      const { setupMultiTabAutosave } = await import('../../src/autosave/manager');
      let tabs = [{ content: 'v1', filePath: null }];
      const cleanup = setupMultiTabAutosave({
        store,
        getTabDrafts: () => tabs,
      });

      await vi.advanceTimersByTimeAsync(30_000);
      expect(store.set).toHaveBeenCalledTimes(1);

      // Change content
      tabs = [{ content: 'v2', filePath: null }];
      await vi.advanceTimersByTimeAsync(30_000);
      expect(store.set).toHaveBeenCalledTimes(2);

      cleanup();
    });

    it('calls onDraftSaved callback after saving', async () => {
      const onDraftSaved = vi.fn();
      const { setupMultiTabAutosave } = await import('../../src/autosave/manager');
      const cleanup = setupMultiTabAutosave(
        {
          store,
          getTabDrafts: () => [{ content: 'digraph {}', filePath: null }],
        },
        onDraftSaved
      );

      await vi.advanceTimersByTimeAsync(30_000);
      expect(onDraftSaved).toHaveBeenCalledTimes(1);
      cleanup();
    });

    it('handles store errors gracefully', async () => {
      store.set.mockRejectedValueOnce(new Error('Store write failed'));
      const { setupMultiTabAutosave } = await import('../../src/autosave/manager');
      const cleanup = setupMultiTabAutosave({
        store,
        getTabDrafts: () => [{ content: 'digraph {}', filePath: null }],
      });

      // Should not throw
      await vi.advanceTimersByTimeAsync(30_000);
      cleanup();
    });

    it('stops saving after cleanup is called', async () => {
      const { setupMultiTabAutosave } = await import('../../src/autosave/manager');
      let tabs = [{ content: 'v1', filePath: null }];
      const cleanup = setupMultiTabAutosave({
        store,
        getTabDrafts: () => tabs,
      });

      await vi.advanceTimersByTimeAsync(30_000);
      expect(store.set).toHaveBeenCalledTimes(1);

      cleanup();
      tabs = [{ content: 'v2', filePath: null }];

      await vi.advanceTimersByTimeAsync(30_000);
      // Should not have saved again
      expect(store.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveTabDrafts()', () => {
    it('saves tabs array with timestamp to store', async () => {
      const { saveTabDrafts } = await import('../../src/autosave/manager');
      const tabs = [
        { content: 'digraph { X }', filePath: '/path/to/file.dot' },
        { content: 'graph { Y }', filePath: null },
      ];
      await saveTabDrafts(store, tabs);

      expect(store.set).toHaveBeenCalledWith(
        'tabDrafts',
        expect.objectContaining({
          tabs,
          timestamp: expect.any(String),
        })
      );
    });

    it('saves empty tabs array', async () => {
      const { saveTabDrafts } = await import('../../src/autosave/manager');
      await saveTabDrafts(store, []);

      expect(store.set).toHaveBeenCalledWith(
        'tabDrafts',
        expect.objectContaining({
          tabs: [],
          timestamp: expect.any(String),
        })
      );
    });
  });
});
