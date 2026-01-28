import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabState } from '../../src/tabs/manager';
import { renderTabBar, setupTabBar } from '../../src/tabs/tab-bar';

function makeTab(overrides: Partial<TabState> & { id: string }): TabState {
  return {
    filePath: null,
    isDirty: false,
    lastCommittedDoc: '',
    lastSavedAt: null,
    editorView: null,
    editorZoomLevel: 0,
    ...overrides,
  };
}

function createContainer(): HTMLElement {
  const container = document.createElement('nav');
  const tabList = document.createElement('div');
  tabList.setAttribute('role', 'tablist');
  container.appendChild(tabList);

  const newBtn = document.createElement('button');
  newBtn.setAttribute('data-action', 'new-tab');
  container.appendChild(newBtn);

  return container;
}

describe('tabs/tab-bar', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
    document.body.innerHTML = '';
    document.body.appendChild(container);
  });

  describe('renderTabBar()', () => {
    it('renders tab buttons into the tablist', () => {
      const tabs = [makeTab({ id: 'tab-1' }), makeTab({ id: 'tab-2' })];
      renderTabBar(tabs, 'tab-1', container);

      const buttons = container.querySelectorAll('[data-tab-id]');
      expect(buttons).toHaveLength(2);
    });

    it('marks the active tab', () => {
      const tabs = [makeTab({ id: 'tab-1' }), makeTab({ id: 'tab-2' })];
      renderTabBar(tabs, 'tab-2', container);

      const tab1 = container.querySelector('[data-tab-id="tab-1"]');
      const tab2 = container.querySelector('[data-tab-id="tab-2"]');

      expect(tab1?.classList.contains('active')).toBe(false);
      expect(tab2?.classList.contains('active')).toBe(true);
      expect(tab2?.getAttribute('aria-selected')).toBe('true');
    });

    it('shows dirty indicator for dirty tabs', () => {
      const tabs = [makeTab({ id: 'tab-1', isDirty: true })];
      renderTabBar(tabs, 'tab-1', container);

      const dot = container.querySelector('.tab-dirty');
      expect(dot).not.toBeNull();
    });

    it('does not show dirty indicator for clean tabs', () => {
      const tabs = [makeTab({ id: 'tab-1', isDirty: false })];
      renderTabBar(tabs, 'tab-1', container);

      const dot = container.querySelector('.tab-dirty');
      expect(dot).toBeNull();
    });

    it('shows filename as label when filePath is set', () => {
      const tabs = [makeTab({ id: 'tab-1', filePath: '/path/to/diagram.dot' })];
      renderTabBar(tabs, 'tab-1', container);

      const label = container.querySelector('.tab-label');
      expect(label?.textContent).toBe('diagram.dot');
    });

    it('shows Untitled as label when filePath is null', () => {
      const tabs = [makeTab({ id: 'tab-1', filePath: null })];
      renderTabBar(tabs, 'tab-1', container);

      const label = container.querySelector('.tab-label');
      expect(label?.textContent).toBe('Untitled');
    });

    it('handles Windows-style paths', () => {
      const tabs = [makeTab({ id: 'tab-1', filePath: 'C:\\Users\\test\\file.gv' })];
      renderTabBar(tabs, 'tab-1', container);

      const label = container.querySelector('.tab-label');
      expect(label?.textContent).toBe('file.gv');
    });

    it('hides close button when only one tab', () => {
      const tabs = [makeTab({ id: 'tab-1' })];
      renderTabBar(tabs, 'tab-1', container);

      const close = container.querySelector('[data-tab-close]') as HTMLElement;
      expect(close?.style.display).toBe('none');
    });

    it('shows close button when multiple tabs', () => {
      const tabs = [makeTab({ id: 'tab-1' }), makeTab({ id: 'tab-2' })];
      renderTabBar(tabs, 'tab-1', container);

      const closeButtons = container.querySelectorAll<HTMLElement>('[data-tab-close]');
      for (const btn of closeButtons) {
        expect(btn.style.display).not.toBe('none');
      }
    });

    it('clears previous content on re-render', () => {
      const tabs1 = [makeTab({ id: 'tab-1' }), makeTab({ id: 'tab-2' })];
      renderTabBar(tabs1, 'tab-1', container);
      expect(container.querySelectorAll('[data-tab-id]')).toHaveLength(2);

      const tabs2 = [makeTab({ id: 'tab-1' })];
      renderTabBar(tabs2, 'tab-1', container);
      expect(container.querySelectorAll('[data-tab-id]')).toHaveLength(1);
    });

    it('does nothing when no tablist element exists', () => {
      const bare = document.createElement('div');
      const tabs = [makeTab({ id: 'tab-1' })];

      expect(() => renderTabBar(tabs, 'tab-1', bare)).not.toThrow();
    });
  });

  describe('setupTabBar()', () => {
    it('calls onTabSwitch when a tab button is clicked', () => {
      const onTabSwitch = vi.fn();
      const callbacks = { onTabSwitch, onTabClose: vi.fn(), onNewTab: vi.fn() };
      setupTabBar({ container, callbacks });

      const tabs = [makeTab({ id: 'tab-1' }), makeTab({ id: 'tab-2' })];
      renderTabBar(tabs, 'tab-1', container);

      const tab2Btn = container.querySelector('[data-tab-id="tab-2"]') as HTMLElement;
      tab2Btn.click();

      expect(onTabSwitch).toHaveBeenCalledWith('tab-2');
    });

    it('calls onTabClose when close button is clicked', () => {
      const onTabClose = vi.fn();
      const callbacks = { onTabSwitch: vi.fn(), onTabClose, onNewTab: vi.fn() };
      setupTabBar({ container, callbacks });

      const tabs = [makeTab({ id: 'tab-1' }), makeTab({ id: 'tab-2' })];
      renderTabBar(tabs, 'tab-1', container);

      const closeBtn = container.querySelector('[data-tab-close="tab-1"]') as HTMLElement;
      closeBtn.click();

      expect(onTabClose).toHaveBeenCalledWith('tab-1');
    });

    it('calls onNewTab when new tab button is clicked', () => {
      const onNewTab = vi.fn();
      const callbacks = { onTabSwitch: vi.fn(), onTabClose: vi.fn(), onNewTab };
      setupTabBar({ container, callbacks });

      const newBtn = container.querySelector('[data-action="new-tab"]') as HTMLElement;
      newBtn.click();

      expect(onNewTab).toHaveBeenCalledTimes(1);
    });

    it('does not call onTabSwitch when close button is clicked', () => {
      const onTabSwitch = vi.fn();
      const onTabClose = vi.fn();
      const callbacks = { onTabSwitch, onTabClose, onNewTab: vi.fn() };
      setupTabBar({ container, callbacks });

      const tabs = [makeTab({ id: 'tab-1' }), makeTab({ id: 'tab-2' })];
      renderTabBar(tabs, 'tab-1', container);

      const closeBtn = container.querySelector('[data-tab-close="tab-1"]') as HTMLElement;
      closeBtn.click();

      expect(onTabClose).toHaveBeenCalled();
      expect(onTabSwitch).not.toHaveBeenCalled();
    });
  });
});
