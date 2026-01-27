import { confirm } from '@tauri-apps/plugin-dialog';
import type { Store } from '@tauri-apps/plugin-store';
import {
  DRAFT_CONTENT_KEY,
  DRAFT_FILE_PATH_KEY,
  DRAFT_TIMESTAMP_KEY,
  MAX_DRAFT_AGE_DAYS,
} from './constants';

export interface RecoveryData {
  content: string;
  timestamp: string;
  filePath: string | null;
}

/**
 * Check the store for a recoverable draft.
 * Returns the draft data if found and not stale, or null otherwise.
 */
export async function checkForRecovery(store: Store): Promise<RecoveryData | null> {
  try {
    const content = await store.get<string>(DRAFT_CONTENT_KEY);
    const timestamp = await store.get<string>(DRAFT_TIMESTAMP_KEY);

    if (!content || !timestamp) return null;

    const draftDate = new Date(timestamp);
    const ageMs = Date.now() - draftDate.getTime();
    const maxAgeMs = MAX_DRAFT_AGE_DAYS * 24 * 60 * 60 * 1000;

    if (ageMs > maxAgeMs) {
      await cleanupStaleDrafts(store);
      return null;
    }

    const filePath = await store.get<string | null>(DRAFT_FILE_PATH_KEY);

    return { content, timestamp, filePath: filePath ?? null };
  } catch (error) {
    console.warn('Failed to check for recovery', error);
    return null;
  }
}

/**
 * Prompt the user to recover or discard a draft.
 * Returns true if the user chose to recover.
 */
export async function promptRecovery(data: RecoveryData): Promise<boolean> {
  const draftDate = new Date(data.timestamp);
  const timeStr = draftDate.toLocaleString();
  const fileInfo = data.filePath ? `\nFile: ${data.filePath}` : '\nUnsaved diagram';

  return confirm(`An unsaved draft was found from ${timeStr}.${fileInfo}\n\nRecover this draft?`, {
    title: 'Recover Unsaved Work',
    kind: 'warning',
  });
}

/**
 * Remove stale draft data from the store.
 */
export async function cleanupStaleDrafts(store: Store): Promise<void> {
  try {
    await store.delete(DRAFT_CONTENT_KEY);
    await store.delete(DRAFT_TIMESTAMP_KEY);
    await store.delete(DRAFT_FILE_PATH_KEY);
    await store.save();
  } catch (error) {
    console.warn('Failed to cleanup stale drafts', error);
  }
}
