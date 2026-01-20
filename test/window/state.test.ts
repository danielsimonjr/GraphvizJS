import type { Store } from '@tauri-apps/plugin-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../mocks/tauri';
import {
  configureStoreGet,
  mockStore,
  mockStoreLoad,
  mockWindow,
  resetAllMocks,
} from '../mocks/tauri';

// Type assertion helper for mock store
const store = mockStore as unknown as Store;

describe('window/state', () => {
  beforeEach(() => {
    vi.resetModules();
    resetAllMocks();
  });

  describe('loadSettingsStore()', () => {
    it('returns store when successful', async () => {
      const { loadSettingsStore } = await import('../../src/window/state');
      const store = await loadSettingsStore();
      expect(store).not.toBeNull();
    });

    it('returns null on error', async () => {
      mockStoreLoad.mockRejectedValueOnce(new Error('Store load failed'));
      const { loadSettingsStore } = await import('../../src/window/state');
      const store = await loadSettingsStore();
      expect(store).toBeNull();
    });
  });

  describe('loadEditorZoom()', () => {
    it('returns saved zoom level', async () => {
      configureStoreGet(1.5);
      const { loadEditorZoom } = await import('../../src/window/state');
      const zoom = await loadEditorZoom(store);
      expect(zoom).toBe(1.5);
    });

    it('returns null when no zoom saved', async () => {
      configureStoreGet(null);
      const { loadEditorZoom } = await import('../../src/window/state');
      const zoom = await loadEditorZoom(store);
      expect(zoom).toBeNull();
    });

    it('returns null on error', async () => {
      mockStore.get.mockRejectedValueOnce(new Error('Get failed'));
      const { loadEditorZoom } = await import('../../src/window/state');
      const zoom = await loadEditorZoom(store);
      expect(zoom).toBeNull();
    });
  });

  describe('saveEditorZoom()', () => {
    it('saves zoom level to store', async () => {
      const { saveEditorZoom } = await import('../../src/window/state');
      await saveEditorZoom(store, 1.5);
      expect(mockStore.set).toHaveBeenCalledWith('editorZoom', 1.5);
      expect(mockStore.save).toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      mockStore.set.mockRejectedValueOnce(new Error('Set failed'));
      const { saveEditorZoom } = await import('../../src/window/state');
      // Should not throw
      await expect(saveEditorZoom(store, 1.5)).resolves.not.toThrow();
    });
  });

  describe('persistWindowState()', () => {
    it('saves window position and size', async () => {
      const appWindow = mockWindow.getCurrentWindow();
      const { persistWindowState } = await import('../../src/window/state');
      await persistWindowState(store, appWindow);

      expect(mockStore.set).toHaveBeenCalledWith(
        'windowState',
        expect.objectContaining({
          maximized: false,
        })
      );
      expect(mockStore.save).toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      mockStore.set.mockRejectedValueOnce(new Error('Set failed'));
      const appWindow = mockWindow.getCurrentWindow();
      const { persistWindowState } = await import('../../src/window/state');
      // Should not throw
      await expect(persistWindowState(store, appWindow)).resolves.not.toThrow();
    });

    it('saves all window state properties', async () => {
      const appWindow = mockWindow.getCurrentWindow();
      const { persistWindowState } = await import('../../src/window/state');
      await persistWindowState(store, appWindow);

      expect(mockStore.set).toHaveBeenCalledWith(
        'windowState',
        expect.objectContaining({
          width: expect.any(Number),
          height: expect.any(Number),
          x: expect.any(Number),
          y: expect.any(Number),
          maximized: expect.any(Boolean),
        })
      );
    });
  });

  describe('setupWindowPersistence()', () => {
    it('registers resize and move listeners', async () => {
      const appWindow = mockWindow.getCurrentWindow();
      const { setupWindowPersistence } = await import('../../src/window/state');

      await setupWindowPersistence(store, appWindow, 100);

      expect(appWindow.onResized).toHaveBeenCalled();
      expect(appWindow.onMoved).toHaveBeenCalled();
      expect(appWindow.onCloseRequested).toHaveBeenCalled();
    });

    it('persists state on close request', async () => {
      const appWindow = mockWindow.getCurrentWindow();

      // Capture the close handler
      let closeHandler: ((event: { preventDefault: () => void }) => Promise<void>) | null = null;
      appWindow.onCloseRequested.mockImplementation(async (handler) => {
        closeHandler = handler;
        return () => undefined;
      });

      const { setupWindowPersistence } = await import('../../src/window/state');
      await setupWindowPersistence(store, appWindow, 100);

      // Simulate close request
      const mockEvent = { preventDefault: vi.fn() };
      if (closeHandler) {
        await closeHandler(mockEvent);
      }

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(appWindow.close).toHaveBeenCalled();
    });
  });
});
