import { describe, expect, it, vi } from 'vitest';
import { setupThemeButton } from '../../src/toolbar/theme-button';

function makeButton(): HTMLButtonElement {
  const button = document.createElement('button');
  const icon = document.createElement('i');
  icon.className = 'ri-computer-line';
  button.appendChild(icon);
  return button;
}

describe('setupThemeButton', () => {
  it('cycles on click and reflects the scheme in icon + label', () => {
    const button = makeButton();
    const onCycle = vi.fn();
    const update = setupThemeButton({ button, onCycle });

    button.click();
    expect(onCycle).toHaveBeenCalledTimes(1);

    update('dark');
    expect(button.querySelector('i')?.className).toBe('ri-moon-line');
    expect(button.title).toBe('Theme: Dark');
    expect(button.getAttribute('aria-label')).toBe('Theme: Dark');

    update('light');
    expect(button.querySelector('i')?.className).toBe('ri-sun-line');
    expect(button.title).toBe('Theme: Light');
  });
});
