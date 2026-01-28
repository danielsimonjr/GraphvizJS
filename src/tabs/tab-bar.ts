import type { TabState } from './manager';

/** Callbacks for tab bar user interactions */
export interface TabBarCallbacks {
  onTabSwitch: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
}

/** Options for setting up the tab bar */
export interface TabBarOptions {
  container: HTMLElement;
  callbacks: TabBarCallbacks;
}

/**
 * Extract a display name from a file path, or return 'Untitled'.
 */
function getTabLabel(filePath: string | null): string {
  if (!filePath) return 'Untitled';
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || 'Untitled';
}

/**
 * Render the tab bar DOM from the current tab state.
 *
 * Replaces the inner content of the tab list container.
 * The container itself (with the '+' button) is left intact.
 */
export function renderTabBar(
  tabs: TabState[],
  activeTabId: string | null,
  container: HTMLElement
): void {
  const list = container.querySelector<HTMLElement>('[role="tablist"]');
  if (!list) return;

  // Clear existing tab buttons (keep structure)
  list.innerHTML = '';

  for (const tab of tabs) {
    const isActive = tab.id === activeTabId;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tab-button${isActive ? ' active' : ''}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(isActive));
    btn.setAttribute('data-tab-id', tab.id);

    // Dirty indicator
    if (tab.isDirty) {
      const dot = document.createElement('span');
      dot.className = 'tab-dirty';
      dot.setAttribute('aria-label', 'Unsaved changes');
      btn.appendChild(dot);
    }

    // Label
    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = getTabLabel(tab.filePath);
    btn.appendChild(label);

    // Close button (hidden when only 1 tab)
    const close = document.createElement('span');
    close.className = 'tab-close';
    close.setAttribute('role', 'button');
    close.setAttribute('aria-label', `Close ${getTabLabel(tab.filePath)}`);
    close.setAttribute('data-tab-close', tab.id);
    close.textContent = '\u00d7'; // multiplication sign ×
    if (tabs.length <= 1) {
      close.style.display = 'none';
    }
    btn.appendChild(close);

    list.appendChild(btn);
  }
}

/**
 * Set up the tab bar with click handlers.
 *
 * Uses event delegation on the container for efficient handling.
 */
export function setupTabBar(options: TabBarOptions): void {
  const { container, callbacks } = options;

  // Delegate clicks on the tab list
  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Close button clicked
    const closeEl = target.closest<HTMLElement>('[data-tab-close]');
    if (closeEl) {
      e.stopPropagation();
      const tabId = closeEl.getAttribute('data-tab-close');
      if (tabId) callbacks.onTabClose(tabId);
      return;
    }

    // Tab button clicked
    const tabBtn = target.closest<HTMLElement>('[data-tab-id]');
    if (tabBtn) {
      const tabId = tabBtn.getAttribute('data-tab-id');
      if (tabId) callbacks.onTabSwitch(tabId);
      return;
    }

    // New tab button clicked
    if (target.closest('[data-action="new-tab"]')) {
      callbacks.onNewTab();
    }
  });
}
