// test/session/session.test.ts
import { describe, expect, it, vi } from 'vitest';
import { TAB_DRAFTS_KEY } from '../../src/autosave/constants';
import {
  captureSession,
  deserializeSession,
  loadSession,
  migrateLegacyDrafts,
  persistSession,
  SESSION_KEY,
} from '../../src/session/session';

const tab = (filePath: string | null, content: string, savedContent: string, engine = 'dot') =>
  ({ filePath, content, savedContent, engine }) as const;

describe('captureSession', () => {
  it('assembles tabs and clamps activeIndex into range', () => {
    const data = captureSession([tab(null, 'a', 'a'), tab('C:/f.dot', 'b*', 'b')], 5);
    expect(data.tabs).toHaveLength(2);
    expect(data.tabs[1]).toEqual({
      filePath: 'C:/f.dot',
      content: 'b*',
      savedContent: 'b',
      engine: 'dot',
    });
    expect(data.activeIndex).toBe(1); // clamped to last index
  });
  it('clamps a negative activeIndex to 0', () => {
    expect(captureSession([tab(null, 'a', 'a')], -1).activeIndex).toBe(0);
  });
});

describe('deserializeSession', () => {
  it('accepts a well-formed object', () => {
    const raw = { tabs: [tab('C:/f.dot', 'x', 'x', 'neato')], activeIndex: 0 };
    expect(deserializeSession(raw)).toEqual(raw);
  });
  it('rejects malformed input', () => {
    expect(deserializeSession(null)).toBeNull();
    expect(deserializeSession({ tabs: 'no' })).toBeNull();
    expect(deserializeSession({ tabs: [{ filePath: 1 }], activeIndex: 0 })).toBeNull();
  });
  it('clamps activeIndex and defaults a missing engine to dot', () => {
    const raw = { tabs: [{ filePath: null, content: 'c', savedContent: 'c' }], activeIndex: 9 };
    const out = deserializeSession(raw);
    expect(out?.activeIndex).toBe(0);
    expect(out?.tabs[0].engine).toBe('dot');
  });
  it('defaults savedContent to content when absent', () => {
    const raw = { tabs: [{ filePath: null, content: 'c' }], activeIndex: 0 };
    expect(deserializeSession(raw)?.tabs[0].savedContent).toBe('c');
  });
});

describe('migrateLegacyDrafts', () => {
  it('converts a tabDrafts payload into a clean session', () => {
    const legacy = {
      tabs: [
        { content: 'a', filePath: null },
        { content: 'b', filePath: 'C:/b.dot' },
      ],
      timestamp: 't',
    };
    const out = migrateLegacyDrafts(legacy);
    expect(out?.tabs).toHaveLength(2);
    expect(out?.tabs[0]).toEqual({
      filePath: null,
      content: 'a',
      savedContent: 'a',
      engine: 'dot',
    });
    expect(out?.activeIndex).toBe(0);
  });
  it('returns null for non-legacy input', () => {
    expect(migrateLegacyDrafts(undefined)).toBeNull();
    expect(migrateLegacyDrafts({ tabs: [] })).toBeNull();
  });
});

describe('loadSession / persistSession', () => {
  const store = (map: Record<string, unknown>) => ({
    get: vi.fn(async (k: string) => map[k]),
    set: vi.fn(),
    delete: vi.fn(),
  });
  it('prefers a stored session', async () => {
    const s = { tabs: [tab(null, 'a', 'a')], activeIndex: 0 };
    expect(await loadSession(store({ [SESSION_KEY]: s }))).toEqual(s);
  });
  it('falls back to migrating legacy drafts', async () => {
    const legacy = { tabs: [{ content: 'a', filePath: null }], timestamp: 't' };
    const out = await loadSession(store({ [TAB_DRAFTS_KEY]: legacy }));
    expect(out?.tabs[0].content).toBe('a');
  });
  it('returns null when neither exists', async () => {
    expect(await loadSession(store({}))).toBeNull();
  });
  it('persistSession writes under SESSION_KEY', async () => {
    const s = store({});
    const data = { tabs: [tab(null, 'a', 'a')], activeIndex: 0 };
    await persistSession(s, data);
    expect(s.set).toHaveBeenCalledWith(SESSION_KEY, data);
  });
});
