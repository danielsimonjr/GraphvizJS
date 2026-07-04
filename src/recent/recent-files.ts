import type { PlatformStore } from '../platform';

/** Store key for the recent-files list (most-recent-first). */
export const RECENT_FILES_KEY = 'recentFiles';

/** Maximum number of recent files retained. */
export const MAX_RECENT = 10;

/** Return a new list with `path` moved/added to the front, deduped, capped. */
export function addRecent(list: readonly string[], path: string, cap = MAX_RECENT): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, cap);
}

/** Return a new list with `path` removed. */
export function removeRecent(list: readonly string[], path: string): string[] {
  return list.filter((p) => p !== path);
}

/** Read the recent-files list, tolerating missing or malformed data. */
export async function loadRecent(store: PlatformStore): Promise<string[]> {
  const raw = await store.get<unknown>(RECENT_FILES_KEY);
  if (Array.isArray(raw) && raw.every((p) => typeof p === 'string')) {
    return raw as string[];
  }
  return [];
}

/** Persist the recent-files list. */
export async function saveRecent(store: PlatformStore, list: readonly string[]): Promise<void> {
  await store.set(RECENT_FILES_KEY, [...list]);
}
