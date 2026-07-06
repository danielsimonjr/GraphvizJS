import type { ColorScheme } from '../theme/color-scheme';

const THEME_LABEL: Record<ColorScheme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export interface PreferencesDialogOptions {
  /** Selectable schemes, in display order. */
  schemes: readonly ColorScheme[];
  /** Current theme, read each time the dialog opens. */
  getTheme: () => ColorScheme;
  /** Called when the user picks a different theme. */
  onTheme: (scheme: ColorScheme) => void;
}

export interface PreferencesDialog {
  open(): void;
  close(): void;
  isOpen(): boolean;
  readonly element: HTMLElement;
}

/**
 * A small Preferences dialog. Today it hosts a single Appearance ▸ Theme
 * setting (wired to the live color-scheme controller); the structure is meant
 * to grow additional sections. Renders a hidden overlay into `parent`.
 */
export function createPreferencesDialog(
  options: PreferencesDialogOptions,
  parent: HTMLElement = document.body
): PreferencesDialog {
  const overlay = document.createElement('div');
  overlay.className = 'preferences-dialog';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Preferences');
  overlay.hidden = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'preferences-backdrop';

  const box = document.createElement('div');
  box.className = 'preferences-box';

  const header = document.createElement('header');
  header.className = 'preferences-header';
  const title = document.createElement('h2');
  title.textContent = 'Preferences';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'preferences-close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.textContent = '×';
  header.append(title, closeButton);

  // Appearance ▸ Theme
  const section = document.createElement('fieldset');
  section.className = 'preferences-section';
  const legend = document.createElement('legend');
  legend.textContent = 'Appearance';
  section.appendChild(legend);

  const radios = new Map<ColorScheme, HTMLInputElement>();
  for (const scheme of options.schemes) {
    const label = document.createElement('label');
    label.className = 'preferences-radio';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'theme';
    input.value = scheme;
    input.addEventListener('change', () => {
      if (input.checked) options.onTheme(scheme);
    });
    const text = document.createElement('span');
    text.textContent = THEME_LABEL[scheme];
    label.append(input, text);
    section.appendChild(label);
    radios.set(scheme, input);
  }

  box.append(header, section);
  overlay.append(backdrop, box);
  parent.append(overlay);

  function open(): void {
    const current = options.getTheme();
    for (const [scheme, input] of radios) input.checked = scheme === current;
    overlay.hidden = false;
  }

  function close(): void {
    overlay.hidden = true;
  }

  const isOpen = () => !overlay.hidden;

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  backdrop.addEventListener('mousedown', close);
  closeButton.addEventListener('click', close);

  return {
    open,
    close,
    isOpen,
    get element() {
      return overlay;
    },
  };
}
