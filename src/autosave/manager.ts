import type { Store } from '@tauri-apps/plugin-store';

const DRAFT_CONTENT_KEY = 'draftContent';
const DRAFT_TIMESTAMP_KEY = 'draftTimestamp';
const DRAFT_FILE_PATH_KEY = 'draftFilePath';

const AUTOSAVE_INTERVAL = 30_000;

export interface AutosaveOptions {
  store: Store;
  getContent: () => string;
  getFilePath: () => string | null;
}

/**
 * Set up periodic autosave of editor drafts.
 * Saves every 30 seconds when content has changed since last autosave.
 * Returns a cleanup function to stop autosaving.
 */
export function setupAutosave(options: AutosaveOptions, onDraftSaved?: () => void): () => void {
  const { store, getContent, getFilePath } = options;
  let lastSavedContent: string | null = null;

  const intervalId = window.setInterval(async () => {
    const content = getContent();
    if (content === lastSavedContent) return;

    try {
      await saveDraft(store, content, getFilePath());
      lastSavedContent = content;
      onDraftSaved?.();
    } catch (error) {
      console.warn('Autosave failed', error);
    }
  }, AUTOSAVE_INTERVAL);

  return () => {
    window.clearInterval(intervalId);
  };
}

/**
 * Save a draft to the store.
 */
export async function saveDraft(
  store: Store,
  content: string,
  filePath: string | null
): Promise<void> {
  await store.set(DRAFT_CONTENT_KEY, content);
  await store.set(DRAFT_TIMESTAMP_KEY, new Date().toISOString());
  await store.set(DRAFT_FILE_PATH_KEY, filePath);
  await store.save();
}

/**
 * Clear draft data from the store.
 * Call after a successful manual save.
 */
export async function clearDraft(store: Store): Promise<void> {
  try {
    await store.delete(DRAFT_CONTENT_KEY);
    await store.delete(DRAFT_TIMESTAMP_KEY);
    await store.delete(DRAFT_FILE_PATH_KEY);
    await store.save();
  } catch (error) {
    console.warn('Failed to clear draft', error);
  }
}
