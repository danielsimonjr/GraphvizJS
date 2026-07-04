import { describe, expect, it, vi } from 'vitest';
import {
  addRecent,
  loadRecent,
  MAX_RECENT,
  RECENT_FILES_KEY,
  removeRecent,
  saveRecent,
} from '../../src/recent/recent-files';

describe('addRecent', () => {
  it('adds a new path to the front', () => {
    expect(addRecent(['b', 'c'], 'a')).toEqual(['a', 'b', 'c']);
  });
  it('moves an existing path to the front (dedupe)', () => {
    expect(addRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });
  it('caps the list length, dropping the oldest', () => {
    const start = Array.from({ length: MAX_RECENT }, (_, i) => `f${i}`);
    const result = addRecent(start, 'new');
    expect(result).toHaveLength(MAX_RECENT);
    expect(result[0]).toBe('new');
    expect(result).not.toContain(`f${MAX_RECENT - 1}`);
  });
  it('does not mutate the input list', () => {
    const input = ['a', 'b'];
    addRecent(input, 'c');
    expect(input).toEqual(['a', 'b']);
  });
});

describe('removeRecent', () => {
  it('removes the given path', () => {
    expect(removeRecent(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
  it('is a no-op for an absent path', () => {
    expect(removeRecent(['a'], 'z')).toEqual(['a']);
  });
});

describe('loadRecent / saveRecent', () => {
  const makeStore = (value: unknown) => ({
    get: vi.fn().mockResolvedValue(value),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  });
  it('returns [] when nothing stored', async () => {
    expect(await loadRecent(makeStore(undefined))).toEqual([]);
  });
  it('returns [] when stored value is not a string array', async () => {
    expect(await loadRecent(makeStore({ nope: 1 }))).toEqual([]);
    expect(await loadRecent(makeStore(['ok', 3]))).toEqual([]);
  });
  it('round-trips a valid list', async () => {
    const store = makeStore(['a', 'b']);
    expect(await loadRecent(store)).toEqual(['a', 'b']);
    await saveRecent(store, ['x']);
    expect(store.set).toHaveBeenCalledWith(RECENT_FILES_KEY, ['x']);
  });
});
