import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ExportFormat, setupExportMenu } from '../../src/toolbar/export-menu';

describe('toolbar/export-menu', () => {
  let button: HTMLButtonElement;
  let menu: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    button = document.createElement('button');
    menu = document.createElement('div');
    menu.hidden = true;

    // Create menu items
    const pngOption = document.createElement('button');
    pngOption.className = 'toolbar-menu-item';
    pngOption.dataset.export = 'png';
    pngOption.textContent = 'PNG';
    menu.appendChild(pngOption);

    const png2xOption = document.createElement('button');
    png2xOption.className = 'toolbar-menu-item';
    png2xOption.dataset.export = 'pngx2';
    png2xOption.textContent = 'PNG @2x';
    menu.appendChild(png2xOption);

    const svgOption = document.createElement('button');
    svgOption.className = 'toolbar-menu-item';
    svgOption.dataset.export = 'svg';
    svgOption.textContent = 'SVG';
    menu.appendChild(svgOption);

    document.body.appendChild(button);
    document.body.appendChild(menu);
  });

  describe('setupExportMenu()', () => {
    it('handles null button gracefully', () => {
      expect(() => {
        setupExportMenu({ button: null, menu, onSelect: vi.fn() });
      }).not.toThrow();
    });

    it('handles null menu gracefully', () => {
      expect(() => {
        setupExportMenu({ button, menu: null, onSelect: vi.fn() });
      }).not.toThrow();
    });

    it('handles both null gracefully', () => {
      expect(() => {
        setupExportMenu({ button: null, menu: null, onSelect: vi.fn() });
      }).not.toThrow();
    });
  });

  describe('Menu toggle behavior', () => {
    it('click opens menu', () => {
      setupExportMenu({ button, menu, onSelect: vi.fn() });
      expect(menu.hidden).toBe(true);

      button.click();

      expect(menu.hidden).toBe(false);
      expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('second click closes menu', () => {
      setupExportMenu({ button, menu, onSelect: vi.fn() });
      button.click(); // open
      button.click(); // close

      expect(menu.hidden).toBe(true);
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('ArrowDown key opens menu', () => {
      setupExportMenu({ button, menu, onSelect: vi.fn() });
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
      button.dispatchEvent(event);

      expect(menu.hidden).toBe(false);
    });

    it('Escape key closes menu', async () => {
      setupExportMenu({ button, menu, onSelect: vi.fn() });
      button.click(); // open menu
      expect(menu.hidden).toBe(false);

      // Dispatch escape on the document
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(event);

      expect(menu.hidden).toBe(true);
    });

    it('clicking outside closes menu', () => {
      setupExportMenu({ button, menu, onSelect: vi.fn() });
      button.click(); // open menu
      expect(menu.hidden).toBe(false);

      // Create and dispatch a pointerdown event on body
      const event = new Event('pointerdown', { bubbles: true });
      document.body.dispatchEvent(event);

      expect(menu.hidden).toBe(true);
    });

    it('clicking inside menu does not close it (until item selected)', () => {
      setupExportMenu({ button, menu, onSelect: vi.fn() });
      button.click(); // open menu

      // Click on the menu itself (not an item)
      const event = new Event('pointerdown', { bubbles: true });
      menu.dispatchEvent(event);

      expect(menu.hidden).toBe(false);
    });
  });

  describe('Menu item selection', () => {
    it('calls onSelect with png format', () => {
      const onSelect = vi.fn();
      setupExportMenu({ button, menu, onSelect });
      button.click();

      const pngItem = menu.querySelector('[data-export="png"]') as HTMLElement;
      pngItem.click();

      expect(onSelect).toHaveBeenCalledWith('png');
      expect(menu.hidden).toBe(true);
    });

    it('calls onSelect with pngx2 format', () => {
      const onSelect = vi.fn();
      setupExportMenu({ button, menu, onSelect });
      button.click();

      const pngx2Item = menu.querySelector('[data-export="pngx2"]') as HTMLElement;
      pngx2Item.click();

      expect(onSelect).toHaveBeenCalledWith('pngx2');
    });

    it('calls onSelect with svg format', () => {
      const onSelect = vi.fn();
      setupExportMenu({ button, menu, onSelect });
      button.click();

      const svgItem = menu.querySelector('[data-export="svg"]') as HTMLElement;
      svgItem.click();

      expect(onSelect).toHaveBeenCalledWith('svg');
    });

    it('ignores click on non-menu-item elements', () => {
      const onSelect = vi.fn();
      setupExportMenu({ button, menu, onSelect });
      button.click();

      // Add a non-menu-item element
      const div = document.createElement('div');
      menu.appendChild(div);
      div.click();

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('ignores click on item without data-export', () => {
      const onSelect = vi.fn();
      setupExportMenu({ button, menu, onSelect });
      button.click();

      // Add an item without data-export
      const badItem = document.createElement('button');
      badItem.className = 'toolbar-menu-item';
      menu.appendChild(badItem);
      badItem.click();

      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard navigation', () => {
    it('Escape on menu closes it', () => {
      setupExportMenu({ button, menu, onSelect: vi.fn() });
      button.click();

      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      menu.dispatchEvent(event);

      expect(menu.hidden).toBe(true);
    });

    it('focuses first item when menu opens', () => {
      setupExportMenu({ button, menu, onSelect: vi.fn() });
      const firstItem = menu.querySelector('.toolbar-menu-item') as HTMLButtonElement;
      const focusSpy = vi.spyOn(firstItem, 'focus');

      button.click();

      expect(focusSpy).toHaveBeenCalled();
    });
  });
});
