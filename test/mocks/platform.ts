import { vi } from 'vitest';

/**
 * Create a fresh mock store backed by a Map.
 * Each returned instance has independent vi.fn() spies for get/set/delete.
 * Tests may override behaviour with .mockResolvedValueOnce() etc.
 */
export function makeMockStore(initial?: Map<string, unknown>) {
  const data = new Map<string, unknown>(initial);

  return {
    get: vi.fn(<T>(key: string): Promise<T | undefined> =>
      Promise.resolve(data.get(key) as T | undefined)
    ),
    set: vi.fn((key: string, value: unknown): Promise<void> => {
      data.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string): Promise<void> => {
      data.delete(key);
      return Promise.resolve();
    }),
  };
}

/** Stable confirm mock — reset between tests via resetPlatformMocks(). */
export const mockConfirm = vi.fn().mockResolvedValue(true);

// Factory-level store spies lifted out so resetPlatformMocks() can clear them.
// Variables must start with "mock" for vitest's hoisting to allow factory references.
const mockStoreGet = vi.fn().mockResolvedValue(undefined);
const mockStoreSet = vi.fn().mockResolvedValue(undefined);
const mockStoreDel = vi.fn().mockResolvedValue(undefined);

export function resetPlatformMocks(): void {
  mockConfirm.mockClear().mockResolvedValue(true);
  mockStoreGet.mockClear().mockResolvedValue(undefined);
  mockStoreSet.mockClear().mockResolvedValue(undefined);
  mockStoreDel.mockClear().mockResolvedValue(undefined);
}

// Intercept all imports of src/platform so that `confirm` is mockable.
vi.mock('../../src/platform', () => ({
  confirm: mockConfirm,
  store: {
    get: mockStoreGet,
    set: mockStoreSet,
    delete: mockStoreDel,
  },
}));
