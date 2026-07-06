import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/platform', () => ({ store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() } }));

import { store } from '../../src/platform';
import {
  applyScheme,
  type ColorScheme,
  createColorSchemeController,
  loadColorScheme,
  nextScheme,
  resolveDark,
  saveColorScheme,
} from '../../src/theme/color-scheme';

/** A controllable stand-in for a `matchMedia('(prefers-color-scheme: dark)')` result. */
function fakeMedia(matches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  const media = {
    matches,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
    removeEventListener: vi.fn(),
    emitOsChange(next: boolean) {
      media.matches = next;
      for (const cb of listeners) cb({ matches: next });
    },
  };
  return media;
}

beforeEach(() => vi.clearAllMocks());

describe('resolveDark', () => {
  it('is true for dark, false for light, and follows the OS for system', () => {
    expect(resolveDark('dark', false)).toBe(true);
    expect(resolveDark('light', true)).toBe(false);
    expect(resolveDark('system', true)).toBe(true);
    expect(resolveDark('system', false)).toBe(false);
  });
});

describe('nextScheme', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextScheme('system')).toBe('light');
    expect(nextScheme('light')).toBe('dark');
    expect(nextScheme('dark')).toBe('system');
  });
});

describe('applyScheme', () => {
  it('toggles the dark class on the target element', () => {
    const el = document.createElement('div');
    applyScheme(true, el);
    expect(el.classList.contains('dark')).toBe(true);
    applyScheme(false, el);
    expect(el.classList.contains('dark')).toBe(false);
  });
});

describe('loadColorScheme', () => {
  it('returns a persisted valid scheme', async () => {
    (store.get as ReturnType<typeof vi.fn>).mockResolvedValue('dark');
    expect(await loadColorScheme()).toBe('dark');
    expect(store.get).toHaveBeenCalledWith('colorScheme');
  });
  it('defaults to system for an unset, invalid, or failing value', async () => {
    (store.get as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    expect(await loadColorScheme()).toBe('system');
    (store.get as ReturnType<typeof vi.fn>).mockResolvedValue('bogus');
    expect(await loadColorScheme()).toBe('system');
    (store.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('nope'));
    expect(await loadColorScheme()).toBe('system');
  });
});

describe('saveColorScheme', () => {
  it('persists the scheme, and swallows store errors', async () => {
    await saveColorScheme('dark');
    expect(store.set).toHaveBeenCalledWith('colorScheme', 'dark');
    (store.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('nope'));
    await expect(saveColorScheme('light')).resolves.not.toThrow();
  });
});

describe('createColorSchemeController', () => {
  const make = (initial: ColorScheme, prefersDark: boolean) => {
    const body = document.createElement('div');
    const media = fakeMedia(prefersDark);
    const onChange = vi.fn();
    const persist = vi.fn().mockResolvedValue(undefined);
    const controller = createColorSchemeController({ initial, media, body, onChange, persist });
    return { body, media, onChange, persist, controller };
  };

  it('applies the initial scheme immediately', () => {
    const { body, controller } = make('dark', false);
    expect(controller.get()).toBe('dark');
    expect(body.classList.contains('dark')).toBe(true);
  });

  it('set() applies, persists, and notifies', async () => {
    const { body, controller, persist, onChange } = make('dark', false);
    await controller.set('light');
    expect(controller.get()).toBe('light');
    expect(body.classList.contains('dark')).toBe(false);
    expect(persist).toHaveBeenCalledWith('light');
    expect(onChange).toHaveBeenLastCalledWith('light', false);
  });

  it('follows live OS changes only while in system', () => {
    const { body, media, controller } = make('system', false);
    expect(body.classList.contains('dark')).toBe(false);
    media.emitOsChange(true);
    expect(body.classList.contains('dark')).toBe(true); // system tracks OS
    controller.set('light');
    media.emitOsChange(true);
    expect(body.classList.contains('dark')).toBe(false); // light ignores OS
  });

  it('cycle() advances to the next scheme', async () => {
    const { controller } = make('system', false);
    await controller.cycle();
    expect(controller.get()).toBe('light');
  });
});
