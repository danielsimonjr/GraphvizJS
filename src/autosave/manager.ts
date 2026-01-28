import type { Store } from '@tauri-apps/plugin-store';
import {
  AUTOSAVE_INTERVAL,
  DRAFT_CONTENT_KEY,
  DRAFT_FILE_PATH_KEY,
  DRAFT_TIMESTAMP_KEY,
  TAB_DRAFTS_KEY,
} from './constants';

export interface TabDraft {
  content: string;
  filePath: string | null;
}

export interface TabDraftsData {
  tabs: TabDraft[];
  timestamp: string;
}

export interface AutosaveOptions {
  store: Store;
  getContent: () => string;
  getFilePath: () => string | null;
}

export interface MultiTabAutosaveOptions {
  store: Store;
  getTabDrafts: () => TabDraft[];
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
 * Set up periodic autosave for multiple tabs.
 * Saves all tab contents every 30 seconds when any tab content has changed.
 * Returns a cleanup function to stop autosaving.
 */
export function setupMultiTabAutosave(
  options: MultiTabAutosaveOptions,
  onDraftSaved?: () => void
): () => void {
  const { store, getTabDrafts } = options;
  let lastSavedHash = '';

  const intervalId = window.setInterval(async () => {
    const drafts = getTabDrafts();
    const hash = JSON.stringify(drafts);
    if (hash === lastSavedHash) return;

    try {
      await saveTabDrafts(store, drafts);
      lastSavedHash = hash;
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
 * Save a single draft to the store (legacy format).
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
 * Save multi-tab drafts to the store.
 */
export async function saveTabDrafts(store: Store, tabs: TabDraft[]): Promise<void> {
  const data: TabDraftsData = {
    tabs,
    timestamp: new Date().toISOString(),
  };
  await store.set(TAB_DRAFTS_KEY, data);
  await store.save();
}

/**
 * Clear draft data from the store.
 * Clears both legacy single-tab and multi-tab draft data.
 */
export async function clearDraft(store: Store): Promise<void> {
  try {
    await store.delete(DRAFT_CONTENT_KEY);
    await store.delete(DRAFT_TIMESTAMP_KEY);
    await store.delete(DRAFT_FILE_PATH_KEY);
    await store.delete(TAB_DRAFTS_KEY);
    await store.save();
  } catch (error) {
    console.warn('Failed to clear draft', error);
  }
}
