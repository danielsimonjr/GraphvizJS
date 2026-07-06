import type { ColorScheme } from '../theme/color-scheme';

/** Icon (remixicon) and label shown for each scheme. */
const THEME_ICON: Record<ColorScheme, string> = {
  system: 'ri-computer-line',
  light: 'ri-sun-line',
  dark: 'ri-moon-line',
};
const THEME_LABEL: Record<ColorScheme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export interface ThemeButtonOptions {
  button: HTMLButtonElement;
  /** Called on click to advance the scheme. */
  onCycle: () => void;
}

/**
 * Wire the toolbar theme button: clicking cycles the scheme, and the returned
 * function refreshes its icon/label to reflect the current scheme.
 */
export function setupThemeButton({
  button,
  onCycle,
}: ThemeButtonOptions): (scheme: ColorScheme) => void {
  const icon = button.querySelector('i');
  button.addEventListener('click', onCycle);
  return (scheme: ColorScheme) => {
    if (icon) icon.className = THEME_ICON[scheme];
    const label = `Theme: ${THEME_LABEL[scheme]}`;
    button.title = label;
    button.setAttribute('aria-label', label);
  };
}
