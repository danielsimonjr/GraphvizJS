import { store } from '../platform';

/** The user's color-scheme preference. `system` follows the OS. */
export type ColorScheme = 'system' | 'light' | 'dark';

export const COLOR_SCHEMES: readonly ColorScheme[] = ['system', 'light', 'dark'];
export const COLOR_SCHEME_KEY = 'colorScheme';

/** Whether dark styling should apply, given a scheme and the OS dark preference. */
export function resolveDark(scheme: ColorScheme, systemPrefersDark: boolean): boolean {
  if (scheme === 'dark') return true;
  if (scheme === 'light') return false;
  return systemPrefersDark; // 'system'
}

/** The next scheme when cycling (system → light → dark → system). */
export function nextScheme(scheme: ColorScheme): ColorScheme {
  const i = COLOR_SCHEMES.indexOf(scheme);
  return COLOR_SCHEMES[(i + 1) % COLOR_SCHEMES.length];
}

/** Toggle the `dark` class that drives every dark CSS variable. */
export function applyScheme(dark: boolean, body: HTMLElement = document.body): void {
  body.classList.toggle('dark', dark);
}

/** Read the persisted scheme, defaulting to `system` on absence/invalid/error. */
export async function loadColorScheme(): Promise<ColorScheme> {
  try {
    const value = await store.get<string>(COLOR_SCHEME_KEY);
    return COLOR_SCHEMES.includes(value as ColorScheme) ? (value as ColorScheme) : 'system';
  } catch (error) {
    console.warn('Loading color scheme failed', error);
    return 'system';
  }
}

/** Persist the chosen scheme, swallowing store errors (theme still applies). */
export async function saveColorScheme(scheme: ColorScheme): Promise<void> {
  try {
    await store.set(COLOR_SCHEME_KEY, scheme);
  } catch (error) {
    console.warn('Saving color scheme failed', error);
  }
}

export interface ColorSchemeController {
  get(): ColorScheme;
  /** Set, apply, persist, and notify. */
  set(scheme: ColorScheme): Promise<void>;
  /** Advance to the next scheme. */
  cycle(): Promise<void>;
}

export interface ColorSchemeDeps {
  initial: ColorScheme;
  /** Result of `matchMedia('(prefers-color-scheme: dark)')`. */
  media: Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;
  /** Called after each application with the scheme and the resolved dark flag. */
  onChange?: (scheme: ColorScheme, dark: boolean) => void;
  /** Persist the chosen scheme (omitted in tests). */
  persist?: (scheme: ColorScheme) => Promise<void> | void;
  body?: HTMLElement;
}

/**
 * Owns the live color scheme: applies it to the body, re-applies on OS changes
 * while in `system`, and persists/notifies on explicit changes.
 */
export function createColorSchemeController(deps: ColorSchemeDeps): ColorSchemeController {
  let scheme = deps.initial;
  const body = deps.body ?? document.body;

  const apply = () => {
    const dark = resolveDark(scheme, deps.media.matches);
    applyScheme(dark, body);
    deps.onChange?.(scheme, dark);
  };

  deps.media.addEventListener('change', () => {
    if (scheme === 'system') apply();
  });
  apply();

  const set = async (next: ColorScheme): Promise<void> => {
    scheme = next;
    apply();
    await deps.persist?.(next);
  };

  return {
    get: () => scheme,
    set,
    cycle: () => set(nextScheme(scheme)),
  };
}
