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

export function resetPlatformMocks(): void {
  mockConfirm.mockClear().mockResolvedValue(true);
}

// Intercept all imports of src/platform so that `confirm` is mockable.
vi.mock('../../src/platform', () => ({
  confirm: mockConfirm,
  store: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));
