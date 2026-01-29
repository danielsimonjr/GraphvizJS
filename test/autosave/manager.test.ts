import type { Store } from '@tauri-apps/plugin-store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../mocks/tauri';
import { mockStore, resetAllMocks } from '../mocks/tauri';

const store = mockStore as unknown as Store;

describe('autosave/manager', () => {
  beforeEach(() => {
    vi.resetModules();
    resetAllMocks();
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

      expect(mockStore.set).toHaveBeenCalledWith('draftContent', 'digraph { A -> B }');
      expect(mockStore.set).toHaveBeenCalledWith('draftFilePath', '/tmp/test.dot');
      expect(mockStore.set).toHaveBeenCalledWith('draftTimestamp', expect.any(String));
      expect(mockStore.save).toHaveBeenCalled();
      cleanup();
    });

    it('does not re-save when content is unchanged', async () => {
      const { setupAutosave } = await import('../../src/autosave/manager');
      const cleanup = setupAutosave({
        store,
        getContent: () => 'digraph {}',
        getFilePath: () => null,
      });

      // First interval: saves
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockStore.save).toHaveBeenCalledTimes(1);

      // Second interval: same content, should not save again
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockStore.save).toHaveBeenCalledTimes(1);

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
      mockStore.set.mockRejectedValueOnce(new Error('Store write failed'));
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
      expect(mockStore.save).toHaveBeenCalledTimes(1);

      cleanup();
      content = 'v2';

      await vi.advanceTimersByTimeAsync(30_000);
      // Should not have saved again
      expect(mockStore.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveDraft()', () => {
    it('saves content, timestamp, and filePath to store', async () => {
      const { saveDraft } = await import('../../src/autosave/manager');
      await saveDraft(store, 'digraph { X }', '/path/to/file.dot');

      expect(mockStore.set).toHaveBeenCalledWith('draftContent', 'digraph { X }');
      expect(mockStore.set).toHaveBeenCalledWith('draftTimestamp', expect.any(String));
      expect(mockStore.set).toHaveBeenCalledWith('draftFilePath', '/path/to/file.dot');
      expect(mockStore.save).toHaveBeenCalled();
    });

    it('saves null filePath for unsaved diagrams', async () => {
      const { saveDraft } = await import('../../src/autosave/manager');
      await saveDraft(store, 'digraph {}', null);

      expect(mockStore.set).toHaveBeenCalledWith('draftFilePath', null);
    });
  });

  describe('clearDraft()', () => {
    it('deletes all draft keys from store', async () => {
      const { clearDraft } = await import('../../src/autosave/manager');
      await clearDraft(store);

      expect(mockStore.delete).toHaveBeenCalledWith('draftContent');
      expect(mockStore.delete).toHaveBeenCalledWith('draftTimestamp');
      expect(mockStore.delete).toHaveBeenCalledWith('draftFilePath');
      expect(mockStore.save).toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      mockStore.delete.mockRejectedValueOnce(new Error('Delete failed'));
      const { clearDraft } = await import('../../src/autosave/manager');
      await expect(clearDraft(store)).resolves.not.toThrow();
    });

    it('deletes tabDrafts key as well', async () => {
      const { clearDraft } = await import('../../src/autosave/manager');
      await clearDraft(store);

      expect(mockStore.delete).toHaveBeenCalledWith('tabDrafts');
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

      expect(mockStore.set).toHaveBeenCalledWith(
        'tabDrafts',
        expect.objectContaining({
          tabs: [
            { content: 'digraph { A -> B }', filePath: '/tmp/test.dot' },
            { content: 'graph { X -- Y }', filePath: null },
          ],
          timestamp: expect.any(String),
        })
      );
      expect(mockStore.save).toHaveBeenCalled();
      cleanup();
    });

    it('does not re-save when content is unchanged', async () => {
      const { setupMultiTabAutosave } = await import('../../src/autosave/manager');
      const tabs = [{ content: 'digraph {}', filePath: null }];
      const cleanup = setupMultiTabAutosave({
        store,
        getTabDrafts: () => tabs,
      });

      // First interval: saves
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockStore.save).toHaveBeenCalledTimes(1);

      // Second interval: same content, should not save again
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockStore.save).toHaveBeenCalledTimes(1);

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
      expect(mockStore.save).toHaveBeenCalledTimes(1);

      // Change content
      tabs = [{ content: 'v2', filePath: null }];
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockStore.save).toHaveBeenCalledTimes(2);

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
      mockStore.set.mockRejectedValueOnce(new Error('Store write failed'));
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
      expect(mockStore.save).toHaveBeenCalledTimes(1);

      cleanup();
      tabs = [{ content: 'v2', filePath: null }];

      await vi.advanceTimersByTimeAsync(30_000);
      // Should not have saved again
      expect(mockStore.save).toHaveBeenCalledTimes(1);
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

      expect(mockStore.set).toHaveBeenCalledWith(
        'tabDrafts',
        expect.objectContaining({
          tabs,
          timestamp: expect.any(String),
        })
      );
      expect(mockStore.save).toHaveBeenCalled();
    });

    it('saves empty tabs array', async () => {
      const { saveTabDrafts } = await import('../../src/autosave/manager');
      await saveTabDrafts(store, []);

      expect(mockStore.set).toHaveBeenCalledWith(
        'tabDrafts',
        expect.objectContaining({
          tabs: [],
          timestamp: expect.any(String),
        })
      );
    });
  });
});
