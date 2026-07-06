import { describe, expect, it, vi } from 'vitest';
import { dispatchMenuAction, type MenuCommandHandlers } from '../../src/menu/commands';

function handlers(): MenuCommandHandlers {
  return {
    new: vi.fn(),
    newTab: vi.fn(),
    open: vi.fn(),
    openRecent: vi.fn(),
    save: vi.fn(),
    saveAs: vi.fn(),
    export: vi.fn(),
    closeTab: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    find: vi.fn(),
    format: vi.fn(),
    setEngine: vi.fn(),
    setTheme: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomReset: vi.fn(),
    help: vi.fn(),
  };
}

describe('dispatchMenuAction', () => {
  it('routes simple actions', () => {
    const h = handlers();
    dispatchMenuAction(h, 'new-tab');
    expect(h.newTab).toHaveBeenCalledTimes(1);
    dispatchMenuAction(h, 'save');
    expect(h.save).toHaveBeenCalledTimes(1);
    dispatchMenuAction(h, 'zoom-reset');
    expect(h.zoomReset).toHaveBeenCalledTimes(1);
  });
  it('routes payload actions', () => {
    const h = handlers();
    dispatchMenuAction(h, 'export', 'svg');
    expect(h.export).toHaveBeenCalledWith('svg');
    dispatchMenuAction(h, 'set-engine', 'neato');
    expect(h.setEngine).toHaveBeenCalledWith('neato');
    dispatchMenuAction(h, 'set-theme', 'dark');
    expect(h.setTheme).toHaveBeenCalledWith('dark');
    dispatchMenuAction(h, 'open-recent', 'C:/x.dot');
    expect(h.openRecent).toHaveBeenCalledWith('C:/x.dot');
  });
  it('ignores unknown actions and missing payloads without throwing', () => {
    const h = handlers();
    expect(() => dispatchMenuAction(h, 'bogus')).not.toThrow();
    expect(() => dispatchMenuAction(h, 'export')).not.toThrow();
    expect(h.export).not.toHaveBeenCalled();
  });
});
