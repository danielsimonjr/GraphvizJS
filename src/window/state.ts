import { store } from '../platform';

const EDITOR_ZOOM_KEY = 'editorZoom';

/**
 * Read the saved editor zoom level from the store.
 * A failed read logs a warning and returns null.
 * @returns The saved zoom level, or null when none is saved or the read fails.
 */
export async function loadEditorZoom(): Promise<number | null> {
  try {
    const zoom = await store.get<number>(EDITOR_ZOOM_KEY);
    return zoom ?? null;
  } catch (error) {
    console.warn('Loading editor zoom failed', error);
    return null;
  }
}

/**
 * Write the editor zoom level to the store.
 * The level is stored as given, and a failed write logs a warning and does not throw.
 *
 * @param level - The zoom level, where 1 is 100 percent. The editor zoom range is 0.5 to 3.
 * @returns A promise that resolves when the write ends, even when the write fails.
 */
export async function saveEditorZoom(level: number): Promise<void> {
  try {
    await store.set(EDITOR_ZOOM_KEY, level);
  } catch (error) {
    console.warn('Saving editor zoom failed', error);
  }
}
