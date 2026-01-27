/** Store keys for autosave draft data. */
export const DRAFT_CONTENT_KEY = 'draftContent';
export const DRAFT_TIMESTAMP_KEY = 'draftTimestamp';
export const DRAFT_FILE_PATH_KEY = 'draftFilePath';

/** Maximum age (in days) before a draft is considered stale and auto-cleaned. */
export const MAX_DRAFT_AGE_DAYS = 7;

/** Autosave interval in milliseconds (30 seconds). */
export const AUTOSAVE_INTERVAL = 30_000;
