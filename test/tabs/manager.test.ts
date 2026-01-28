import { describe, expect, it } from 'vitest';
import { MAX_TABS, TabManager } from '../../src/tabs/manager';

describe('tabs/manager', () => {
  describe('MAX_TABS', () => {
    it('is 10', () => {
      expect(MAX_TABS).toBe(10);
    });
  });

  describe('TabManager', () => {
    describe('createTab()', () => {
      it('creates a tab with default values', () => {
        const manager = new TabManager();
        const tab = manager.createTab();

        expect(tab).not.toBeNull();
        expect(tab!.id).toBe('tab-1');
        expect(tab!.filePath).toBeNull();
        expect(tab!.isDirty).toBe(false);
        expect(tab!.lastCommittedDoc).toBe('');
        expect(tab!.lastSavedAt).toBeNull();
        expect(tab!.editorView).toBeNull();
        expect(tab!.editorZoomLevel).toBe(0);
      });

      it('creates a tab with content', () => {
        const manager = new TabManager();
        const tab = manager.createTab({ content: 'digraph { a -> b }' });

        expect(tab!.lastCommittedDoc).toBe('digraph { a -> b }');
      });

      it('creates a tab with filePath', () => {
        const manager = new TabManager();
        const tab = manager.createTab({ filePath: '/path/to/file.dot' });

        expect(tab!.filePath).toBe('/path/to/file.dot');
      });

      it('auto-increments tab IDs', () => {
        const manager = new TabManager();
        const tab1 = manager.createTab();
        const tab2 = manager.createTab();
        const tab3 = manager.createTab();

        expect(tab1!.id).toBe('tab-1');
        expect(tab2!.id).toBe('tab-2');
        expect(tab3!.id).toBe('tab-3');
      });

      it('makes new tab the active tab', () => {
        const manager = new TabManager();
        manager.createTab();
        const tab2 = manager.createTab();

        expect(manager.getActiveTabId()).toBe(tab2!.id);
      });

      it('returns null when at max tabs', () => {
        const manager = new TabManager();
        for (let i = 0; i < MAX_TABS; i++) {
          manager.createTab();
        }

        const overflow = manager.createTab();
        expect(overflow).toBeNull();
        expect(manager.getTabCount()).toBe(MAX_TABS);
      });
    });

    describe('closeTab()', () => {
      it('removes the tab', () => {
        const manager = new TabManager();
        const tab = manager.createTab();
        manager.closeTab(tab!.id);

        expect(manager.getTabCount()).toBe(0);
        expect(manager.getTab(tab!.id)).toBeNull();
      });

      it('returns null when closing last tab', () => {
        const manager = new TabManager();
        const tab = manager.createTab();
        const result = manager.closeTab(tab!.id);

        expect(result).toBeNull();
        expect(manager.getActiveTabId()).toBeNull();
      });

      it('activates the next tab when closing active tab', () => {
        const manager = new TabManager();
        manager.createTab();
        const tab2 = manager.createTab();
        manager.createTab();

        // tab-3 is active, switch to tab-2
        manager.setActiveTab(tab2!.id);
        const result = manager.closeTab(tab2!.id);

        // Should activate tab-3 (next)
        expect(result).not.toBeNull();
        expect(result!.id).not.toBe(tab2!.id);
      });

      it('activates the previous tab when closing last in list', () => {
        const manager = new TabManager();
        const tab1 = manager.createTab();
        const tab2 = manager.createTab();

        // tab-2 is active (last created), close it
        const result = manager.closeTab(tab2!.id);

        expect(result!.id).toBe(tab1!.id);
      });

      it('returns current active tab when closing non-existent tab', () => {
        const manager = new TabManager();
        const tab = manager.createTab();
        const result = manager.closeTab('nonexistent');

        expect(result!.id).toBe(tab!.id);
      });

      it('does not change active when closing inactive tab', () => {
        const manager = new TabManager();
        const tab1 = manager.createTab();
        const tab2 = manager.createTab();

        // tab2 is active, close tab1
        manager.closeTab(tab1!.id);

        expect(manager.getActiveTabId()).toBe(tab2!.id);
        expect(manager.getTabCount()).toBe(1);
      });
    });

    describe('getActiveTab()', () => {
      it('returns null when no tabs', () => {
        const manager = new TabManager();
        expect(manager.getActiveTab()).toBeNull();
      });

      it('returns the active tab', () => {
        const manager = new TabManager();
        const tab = manager.createTab({ content: 'hello' });
        expect(manager.getActiveTab()).toBe(tab);
      });
    });

    describe('getActiveTabId()', () => {
      it('returns null when no tabs', () => {
        const manager = new TabManager();
        expect(manager.getActiveTabId()).toBeNull();
      });

      it('returns the active tab ID', () => {
        const manager = new TabManager();
        const tab = manager.createTab();
        expect(manager.getActiveTabId()).toBe(tab!.id);
      });
    });

    describe('setActiveTab()', () => {
      it('switches the active tab', () => {
        const manager = new TabManager();
        const tab1 = manager.createTab();
        manager.createTab();

        const result = manager.setActiveTab(tab1!.id);
        expect(result).toBe(tab1);
        expect(manager.getActiveTabId()).toBe(tab1!.id);
      });

      it('returns null for invalid ID', () => {
        const manager = new TabManager();
        manager.createTab();
        const result = manager.setActiveTab('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('getTab()', () => {
      it('returns tab by ID', () => {
        const manager = new TabManager();
        const tab = manager.createTab({ content: 'test' });
        expect(manager.getTab(tab!.id)).toBe(tab);
      });

      it('returns null for invalid ID', () => {
        const manager = new TabManager();
        expect(manager.getTab('nonexistent')).toBeNull();
      });
    });

    describe('getAllTabs()', () => {
      it('returns empty array when no tabs', () => {
        const manager = new TabManager();
        expect(manager.getAllTabs()).toEqual([]);
      });

      it('returns all tabs in insertion order', () => {
        const manager = new TabManager();
        const tab1 = manager.createTab({ content: 'one' });
        const tab2 = manager.createTab({ content: 'two' });
        const tab3 = manager.createTab({ content: 'three' });

        const all = manager.getAllTabs();
        expect(all).toHaveLength(3);
        expect(all[0].id).toBe(tab1!.id);
        expect(all[1].id).toBe(tab2!.id);
        expect(all[2].id).toBe(tab3!.id);
      });
    });

    describe('getTabCount()', () => {
      it('returns 0 when no tabs', () => {
        const manager = new TabManager();
        expect(manager.getTabCount()).toBe(0);
      });

      it('returns correct count', () => {
        const manager = new TabManager();
        manager.createTab();
        manager.createTab();
        expect(manager.getTabCount()).toBe(2);
      });
    });

    describe('getNextTab()', () => {
      it('returns null with single tab', () => {
        const manager = new TabManager();
        manager.createTab();
        expect(manager.getNextTab()).toBeNull();
      });

      it('returns null with no tabs', () => {
        const manager = new TabManager();
        expect(manager.getNextTab()).toBeNull();
      });

      it('returns the next tab', () => {
        const manager = new TabManager();
        const tab1 = manager.createTab();
        const tab2 = manager.createTab();

        manager.setActiveTab(tab1!.id);
        expect(manager.getNextTab()!.id).toBe(tab2!.id);
      });

      it('wraps around to first tab', () => {
        const manager = new TabManager();
        const tab1 = manager.createTab();
        manager.createTab();

        // tab-2 is active (last created), next should wrap to tab-1
        expect(manager.getNextTab()!.id).toBe(tab1!.id);
      });
    });

    describe('getPreviousTab()', () => {
      it('returns null with single tab', () => {
        const manager = new TabManager();
        manager.createTab();
        expect(manager.getPreviousTab()).toBeNull();
      });

      it('returns null with no tabs', () => {
        const manager = new TabManager();
        expect(manager.getPreviousTab()).toBeNull();
      });

      it('returns the previous tab', () => {
        const manager = new TabManager();
        const tab1 = manager.createTab();
        manager.createTab();

        // tab-2 is active, previous is tab-1
        expect(manager.getPreviousTab()!.id).toBe(tab1!.id);
      });

      it('wraps around to last tab', () => {
        const manager = new TabManager();
        const tab1 = manager.createTab();
        const tab2 = manager.createTab();

        manager.setActiveTab(tab1!.id);
        // Previous from first should wrap to last
        expect(manager.getPreviousTab()!.id).toBe(tab2!.id);
      });
    });
  });
});
