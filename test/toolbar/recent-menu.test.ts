import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupRecentMenu } from '../../src/toolbar/recent-menu';

function build() {
  document.body.innerHTML = `
    <div class="toolbar-dropdown">
      <button data-action="recent-menu" aria-expanded="false"></button>
      <div class="toolbar-menu" data-menu="recent" hidden></div>
    </div>`;
  return {
    button: document.querySelector<HTMLButtonElement>('[data-action="recent-menu"]'),
    menu: document.querySelector<HTMLDivElement>('[data-menu="recent"]'),
  };
}

describe('setupRecentMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the current list each time it opens (basename label, full-path title)', () => {
    const { button, menu } = build();
    let list = ['C:/a/first.dot'];
    setupRecentMenu({ button, menu, getRecent: () => list, onPick: vi.fn() });
    button!.click();
    let items = menu!.querySelectorAll('.toolbar-menu-item');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe('first.dot');
    expect(items[0].getAttribute('title')).toBe('C:/a/first.dot');

    // Close, mutate list, reopen -> re-rendered.
    button!.click();
    list = ['C:/a/first.dot', 'D:/b/second.gv'];
    button!.click();
    items = menu!.querySelectorAll('.toolbar-menu-item');
    expect(items).toHaveLength(2);
  });

  it('shows a disabled empty state when the list is empty', () => {
    const { button, menu } = build();
    setupRecentMenu({ button, menu, getRecent: () => [], onPick: vi.fn() });
    button!.click();
    const empty = menu!.querySelector('.toolbar-menu-empty');
    expect(empty).not.toBeNull();
    expect(menu!.querySelectorAll('.toolbar-menu-item')).toHaveLength(0);
  });

  it('invokes onPick with the full path when an item is clicked', () => {
    const { button, menu } = build();
    const onPick = vi.fn();
    setupRecentMenu({ button, menu, getRecent: () => ['C:/a/first.dot'], onPick });
    button!.click();
    menu!.querySelector<HTMLButtonElement>('.toolbar-menu-item')!.click();
    expect(onPick).toHaveBeenCalledWith('C:/a/first.dot');
  });
});
