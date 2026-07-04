import { describe, expect, it, vi } from 'vitest';
import {
  buildMenuTemplate,
  LAYOUT_ENGINES,
  type MenuBuildOptions,
} from '../../src/menu/menu-template';

type Item = import('electron').MenuItemConstructorOptions;

function opts(over: Partial<MenuBuildOptions> = {}): MenuBuildOptions {
  return {
    isMac: false,
    isDev: false,
    recentFiles: [],
    onAction: vi.fn(),
    onOpenSource: vi.fn(),
    onAbout: vi.fn(),
    ...over,
  };
}

function findById(items: Item[], id: string): Item | undefined {
  for (const it of items) {
    if (it.id === id) return it;
    const sub = it.submenu;
    if (Array.isArray(sub)) {
      const hit = findById(sub as Item[], id);
      if (hit) return hit;
    }
  }
  return undefined;
}

function topLabels(items: Item[]): string[] {
  return items.map((i) => String(i.label ?? i.role ?? ''));
}

describe('buildMenuTemplate', () => {
  it('has File/Edit/View/Help top-level menus and no app menu on non-mac', () => {
    const t = buildMenuTemplate(opts());
    const labels = topLabels(t);
    expect(labels).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'Help']));
    expect(labels).not.toContain('GraphvizJS');
  });

  it('prepends the app menu on mac', () => {
    const t = buildMenuTemplate(opts({ isMac: true }));
    expect(String(t[0].label ?? t[0].role)).toBe('GraphvizJS');
  });

  it('includes Reload/DevTools only in dev builds', () => {
    const hasReload = JSON.stringify(buildMenuTemplate(opts({ isDev: true }))).includes(
      '"role":"reload"'
    );
    const noReload = JSON.stringify(buildMenuTemplate(opts({ isDev: false }))).includes(
      '"role":"reload"'
    );
    expect(hasReload).toBe(true);
    expect(noReload).toBe(false);
  });

  it('dispatches the right action + payload on click', () => {
    const onAction = vi.fn();
    const t = buildMenuTemplate(opts({ onAction, recentFiles: ['C:/a/first.dot'] }));
    (findById(t, 'new-tab')!.click as () => void)();
    expect(onAction).toHaveBeenCalledWith('new-tab');
    (findById(t, 'export:pdf')!.click as () => void)();
    expect(onAction).toHaveBeenCalledWith('export', 'pdf');
    (findById(t, `engine:${LAYOUT_ENGINES[1]}`)!.click as () => void)();
    expect(onAction).toHaveBeenCalledWith('set-engine', LAYOUT_ENGINES[1]);
    (findById(t, 'recent:0')!.click as () => void)();
    expect(onAction).toHaveBeenCalledWith('open-recent', 'C:/a/first.dot');
  });

  it('shows a disabled empty item when there are no recent files', () => {
    const t = buildMenuTemplate(opts({ recentFiles: [] }));
    expect(findById(t, 'recent:0')).toBeUndefined();
    expect(JSON.stringify(t)).toContain('No Recent Files');
  });

  it('marks duplicated accelerators as label-only (registerAccelerator:false)', () => {
    const t = buildMenuTemplate(opts());
    const save = findById(t, 'save')!;
    expect(save.accelerator).toBe('CmdOrCtrl+S');
    expect(save.registerAccelerator).toBe(false);
  });

  it('routes Help→View Source through onOpenSource', () => {
    const onOpenSource = vi.fn();
    const t = buildMenuTemplate(opts({ onOpenSource }));
    (findById(t, 'view-source')!.click as () => void)();
    expect(onOpenSource).toHaveBeenCalledTimes(1);
  });
});
