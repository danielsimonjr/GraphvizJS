import { describe, expect, it, vi } from 'vitest';
import { createPreferencesDialog } from '../../src/preferences/preferences-dialog';

const setup = (theme: 'system' | 'light' | 'dark' = 'system') => {
  document.body.innerHTML = '';
  let current = theme;
  const onTheme = vi.fn((t: 'system' | 'light' | 'dark') => {
    current = t;
  });
  const dialog = createPreferencesDialog({
    schemes: ['system', 'light', 'dark'],
    getTheme: () => current,
    onTheme,
  });
  const radio = (scheme: string) =>
    dialog.element.querySelector<HTMLInputElement>(`input[value="${scheme}"]`)!;
  return { dialog, onTheme, radio };
};

describe('createPreferencesDialog', () => {
  it('opens hidden→visible and checks the current theme', () => {
    const { dialog, radio } = setup('dark');
    expect(dialog.isOpen()).toBe(false);
    dialog.open();
    expect(dialog.isOpen()).toBe(true);
    expect(radio('dark').checked).toBe(true);
    expect(radio('system').checked).toBe(false);
  });

  it('calls onTheme when a different theme is chosen', () => {
    const { dialog, onTheme, radio } = setup('system');
    dialog.open();
    radio('light').checked = true;
    radio('light').dispatchEvent(new Event('change', { bubbles: true }));
    expect(onTheme).toHaveBeenCalledWith('light');
  });

  it('reflects the latest theme each time it opens', () => {
    const { dialog, onTheme, radio } = setup('system');
    dialog.open();
    radio('dark').checked = true;
    radio('dark').dispatchEvent(new Event('change', { bubbles: true }));
    expect(onTheme).toHaveBeenCalledWith('dark');
    dialog.close();
    dialog.open(); // getTheme() now returns 'dark'
    expect(radio('dark').checked).toBe(true);
  });

  it('closes on Escape', () => {
    const { dialog } = setup();
    dialog.open();
    dialog.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dialog.isOpen()).toBe(false);
  });
});
