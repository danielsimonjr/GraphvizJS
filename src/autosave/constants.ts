/**
 * Store key for the legacy multi-tab draft data. Superseded by the `session`
 * store key; retained only so a pre-v1.3.0 draft is migrated into a session
 * once on first launch (see `src/session/session.ts` `migrateLegacyDrafts`).
 */
export const TAB_DRAFTS_KEY = 'tabDrafts';

/** Session-persistence backstop interval in milliseconds (30 seconds). */
export const AUTOSAVE_INTERVAL = 30_000;
