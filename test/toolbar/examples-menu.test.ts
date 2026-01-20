import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ExampleItem, setupExamplesMenu } from '../../src/toolbar/examples-menu';

describe('toolbar/examples-menu', () => {
  let button: HTMLButtonElement;
  let menu: HTMLDivElement;
  let items: ExampleItem[];

  beforeEach(() => {
    document.body.innerHTML = '';
    button = document.createElement('button');
    menu = document.createElement('div');
    menu.hidden = true;

    items = [
      { id: 'simple', label: 'Simple Graph', content: 'digraph { a -> b }', order: 1 },
      { id: 'complex', label: 'Complex Graph', content: 'digraph { a -> b -> c }', order: 2 },
      {
        id: 'cluster',
        label: 'Cluster',
        content: 'digraph { subgraph cluster_0 { a } }',
        order: 3,
      },
    ];

    document.body.appendChild(button);
    document.body.appendChild(menu);
  });

  describe('setupExamplesMenu()', () => {
    it('handles null button gracefully', () => {
      expect(() => {
        setupExamplesMenu({ button: null, menu, items, onSelect: vi.fn() });
      }).not.toThrow();
    });

    it('handles null menu gracefully', () => {
      expect(() => {
        setupExamplesMenu({ button, menu: null, items, onSelect: vi.fn() });
      }).not.toThrow();
    });

    it('handles empty items array gracefully', () => {
      expect(() => {
        setupExamplesMenu({ button, menu, items: [], onSelect: vi.fn() });
      }).not.toThrow();
    });

    it('renders menu items from items array', () => {
      setupExamplesMenu({ button, menu, items, onSelect: vi.fn() });

      const menuItems = menu.querySelectorAll('.toolbar-menu-item');
      expect(menuItems.length).toBe(3);
      expect(menuItems[0].textContent).toBe('Simple Graph');
      expect(menuItems[1].textContent).toBe('Complex Graph');
      expect(menuItems[2].textContent).toBe('Cluster');
    });

    it('sets correct data-example attributes', () => {
      setupExamplesMenu({ button, menu, items, onSelect: vi.fn() });

      const menuItems = menu.querySelectorAll('.toolbar-menu-item');
      expect((menuItems[0] as HTMLElement).dataset.example).toBe('simple');
      expect((menuItems[1] as HTMLElement).dataset.example).toBe('complex');
      expect((menuItems[2] as HTMLElement).dataset.example).toBe('cluster');
    });
  });

  describe('Menu toggle behavior', () => {
    it('click opens menu', () => {
      setupExamplesMenu({ button, menu, items, onSelect: vi.fn() });
      expect(menu.hidden).toBe(true);

      button.click();

      expect(menu.hidden).toBe(false);
      expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('second click closes menu', () => {
      setupExamplesMenu({ button, menu, items, onSelect: vi.fn() });
      button.click(); // open
      button.click(); // close

      expect(menu.hidden).toBe(true);
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('ArrowDown key opens menu', () => {
      setupExamplesMenu({ button, menu, items, onSelect: vi.fn() });
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
      button.dispatchEvent(event);

      expect(menu.hidden).toBe(false);
    });

    it('Escape key closes menu', () => {
      setupExamplesMenu({ button, menu, items, onSelect: vi.fn() });
      button.click();
      expect(menu.hidden).toBe(false);

      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(event);

      expect(menu.hidden).toBe(true);
    });

    it('clicking outside closes menu', () => {
      setupExamplesMenu({ button, menu, items, onSelect: vi.fn() });
      button.click();
      expect(menu.hidden).toBe(false);

      const event = new Event('pointerdown', { bubbles: true });
      document.body.dispatchEvent(event);

      expect(menu.hidden).toBe(true);
    });

    it('clicking inside menu does not close it (until item selected)', () => {
      setupExamplesMenu({ button, menu, items, onSelect: vi.fn() });
      button.click();

      const event = new Event('pointerdown', { bubbles: true });
      menu.dispatchEvent(event);

      expect(menu.hidden).toBe(false);
    });
  });

  describe('Menu item selection', () => {
    it('calls onSelect with content and item', () => {
      const onSelect = vi.fn();
      setupExamplesMenu({ button, menu, items, onSelect });
      button.click();

      const simpleItem = menu.querySelector('[data-example="simple"]') as HTMLElement;
      simpleItem.click();

      expect(onSelect).toHaveBeenCalledWith('digraph { a -> b }', items[0]);
      expect(menu.hidden).toBe(true);
    });

    it('calls onSelect with second item', () => {
      const onSelect = vi.fn();
      setupExamplesMenu({ button, menu, items, onSelect });
      button.click();

      const complexItem = menu.querySelector('[data-example="complex"]') as HTMLElement;
      complexItem.click();

      expect(onSelect).toHaveBeenCalledWith('digraph { a -> b -> c }', items[1]);
    });

    it('ignores click on non-menu-item elements', () => {
      const onSelect = vi.fn();
      setupExamplesMenu({ button, menu, items, onSelect });
      button.click();

      const div = document.createElement('div');
      menu.appendChild(div);
      div.click();

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('ignores click on item without data-example', () => {
      const onSelect = vi.fn();
      setupExamplesMenu({ button, menu, items, onSelect });
      button.click();

      const badItem = document.createElement('button');
      badItem.className = 'toolbar-menu-item';
      menu.appendChild(badItem);
      badItem.click();

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('ignores click on item with unknown id', () => {
      const onSelect = vi.fn();
      setupExamplesMenu({ button, menu, items, onSelect });
      button.click();

      const badItem = document.createElement('button');
      badItem.className = 'toolbar-menu-item';
      badItem.dataset.example = 'unknown';
      menu.appendChild(badItem);
      badItem.click();

      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard navigation', () => {
    it('Escape on menu closes it and focuses button', () => {
      setupExamplesMenu({ button, menu, items, onSelect: vi.fn() });
      button.click();
      const focusSpy = vi.spyOn(button, 'focus');

      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      menu.dispatchEvent(event);

      expect(menu.hidden).toBe(true);
      expect(focusSpy).toHaveBeenCalled();
    });

    it('focuses first item when menu opens', () => {
      setupExamplesMenu({ button, menu, items, onSelect: vi.fn() });
      const firstItem = menu.querySelector('.toolbar-menu-item') as HTMLButtonElement;
      const focusSpy = vi.spyOn(firstItem, 'focus');

      button.click();

      expect(focusSpy).toHaveBeenCalled();
    });
  });

  describe('onSelect callback', () => {
    it('works without onSelect callback', () => {
      setupExamplesMenu({ button, menu, items });
      button.click();

      const simpleItem = menu.querySelector('[data-example="simple"]') as HTMLElement;
      expect(() => simpleItem.click()).not.toThrow();
    });
  });
});
