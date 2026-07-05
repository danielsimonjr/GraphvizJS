// src/session/session.ts

import type { LayoutEngine } from '../../core/types';
import { TAB_DRAFTS_KEY } from '../autosave/constants';
import type { PlatformStore } from '../platform';

/** Store key for the persisted open-tab session. */
export const SESSION_KEY = 'session';

const ENGINES: ReadonlySet<string> = new Set<LayoutEngine>([
  'dot',
  'neato',
  'fdp',
  'sfdp',
  'circo',
  'twopi',
  'osage',
  'patchwork',
]);

export interface SessionTab {
  filePath: string | null;
  content: string;
  savedContent: string;
  engine: LayoutEngine;
}

export interface SessionData {
  tabs: SessionTab[];
  activeIndex: number;
}

/** A tab's snapshot as captured from the running app (same shape as SessionTab). */
export type CapturableTab = SessionTab;

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.floor(index), Math.max(0, length - 1));
}

function isLayoutEngine(value: unknown): value is LayoutEngine {
  return typeof value === 'string' && ENGINES.has(value);
}

function toEngine(value: unknown): LayoutEngine {
  return isLayoutEngine(value) ? value : 'dot';
}

/** Assemble a SessionData from captured tab snapshots, clamping activeIndex. */
export function captureSession(tabs: CapturableTab[], activeIndex: number): SessionData {
  return { tabs: tabs.map((t) => ({ ...t })), activeIndex: clampIndex(activeIndex, tabs.length) };
}

/** Validate and normalize a stored session value, or null if malformed. */
export function deserializeSession(raw: unknown): SessionData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as { tabs?: unknown; activeIndex?: unknown };
  if (!Array.isArray(obj.tabs)) return null;
  const tabs: SessionTab[] = [];
  for (const entry of obj.tabs) {
    if (typeof entry !== 'object' || entry === null) return null;
    const t = entry as Record<string, unknown>;
    if (typeof t.content !== 'string') return null;
    if (t.filePath !== null && typeof t.filePath !== 'string') return null;
    tabs.push({
      filePath: (t.filePath as string | null) ?? null,
      content: t.content,
      savedContent: typeof t.savedContent === 'string' ? t.savedContent : t.content,
      engine: toEngine(t.engine),
    });
  }
  return { tabs, activeIndex: clampIndex(Number(obj.activeIndex ?? 0), tabs.length) };
}

/** Convert a legacy `tabDrafts` payload into a clean SessionData, or null. */
export function migrateLegacyDrafts(raw: unknown): SessionData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as { tabs?: unknown };
  if (!Array.isArray(obj.tabs) || obj.tabs.length === 0) return null;
  const tabs: SessionTab[] = [];
  for (const entry of obj.tabs) {
    if (typeof entry !== 'object' || entry === null) return null;
    const t = entry as Record<string, unknown>;
    if (typeof t.content !== 'string') return null;
    if (t.filePath !== null && t.filePath !== undefined && typeof t.filePath !== 'string')
      return null;
    tabs.push({
      filePath: (t.filePath as string | null) ?? null,
      content: t.content,
      savedContent: t.content,
      engine: 'dot',
    });
  }
  return { tabs, activeIndex: 0 };
}

/** Load the session, falling back to migrating legacy drafts. */
export async function loadSession(store: PlatformStore): Promise<SessionData | null> {
  const session = deserializeSession(await store.get<unknown>(SESSION_KEY));
  if (session) return session;
  return migrateLegacyDrafts(await store.get<unknown>(TAB_DRAFTS_KEY));
}

/** Persist the session. */
export async function persistSession(store: PlatformStore, data: SessionData): Promise<void> {
  await store.set(SESSION_KEY, data);
}
