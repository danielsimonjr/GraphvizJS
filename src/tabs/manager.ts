import type { EditorView } from 'codemirror';

/** Maximum number of tabs allowed */
export const MAX_TABS = 10;

/** Per-tab state */
export interface TabState {
  /** Unique tab identifier (e.g. 'tab-1', 'tab-2') */
  readonly id: string;
  /** Path to the file backing this tab, or null for untitled */
  filePath: string | null;
  /** Whether the tab has unsaved changes */
  isDirty: boolean;
  /** The last content that was committed (saved or opened) */
  lastCommittedDoc: string;
  /** Timestamp of the last save, or null if never saved */
  lastSavedAt: Date | null;
  /** CodeMirror editor instance for this tab */
  editorView: EditorView | null;
  /** Editor zoom level for this tab */
  editorZoomLevel: number;
}

/** Options for creating a new tab */
export interface CreateTabOptions {
  /** Initial document content */
  content?: string;
  /** File path associated with this tab */
  filePath?: string | null;
  /** Pre-created EditorView to attach */
  editorView?: EditorView | null;
}

/**
 * Manages multiple document tabs.
 *
 * Pure state container — holds a Map of TabState objects and the active tab ID.
 * Does not emit events; callers act on returned state.
 */
export class TabManager {
  private tabs = new Map<string, TabState>();
  private activeTabId: string | null = null;
  private nextId = 1;

  /**
   * Create a new tab and make it active.
   * @returns The new TabState, or null if at the tab limit.
   */
  createTab(options: CreateTabOptions = {}): TabState | null {
    if (this.tabs.size >= MAX_TABS) {
      return null;
    }

    const id = `tab-${this.nextId++}`;
    const content = options.content ?? '';

    const tab: TabState = {
      id,
      filePath: options.filePath ?? null,
      isDirty: false,
      lastCommittedDoc: content,
      lastSavedAt: null,
      editorView: options.editorView ?? null,
      editorZoomLevel: 0,
    };

    this.tabs.set(id, tab);
    this.activeTabId = id;
    return tab;
  }

  /**
   * Close a tab by ID.
   * @returns The new active TabState after closing, or null if no tabs remain.
   */
  closeTab(tabId: string): TabState | null {
    const tab = this.tabs.get(tabId);
    if (!tab) return this.getActiveTab();

    // Determine replacement active tab before removal
    const tabIds = [...this.tabs.keys()];
    const index = tabIds.indexOf(tabId);

    this.tabs.delete(tabId);

    if (this.tabs.size === 0) {
      this.activeTabId = null;
      return null;
    }

    // If the closed tab was active, switch to an adjacent tab
    if (this.activeTabId === tabId) {
      // Prefer the tab to the right, fall back to the left
      const newIndex = index < tabIds.length - 1 ? index + 1 : index - 1;
      this.activeTabId = tabIds[newIndex] ?? [...this.tabs.keys()][0];
    }

    return this.getActiveTab();
  }

  /** Get the currently active tab, or null if none. */
  getActiveTab(): TabState | null {
    if (!this.activeTabId) return null;
    return this.tabs.get(this.activeTabId) ?? null;
  }

  /** Get the active tab ID. */
  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  /**
   * Switch the active tab.
   * @returns The newly active TabState, or null if the ID is invalid.
   */
  setActiveTab(tabId: string): TabState | null {
    if (!this.tabs.has(tabId)) return null;
    this.activeTabId = tabId;
    return this.tabs.get(tabId) ?? null;
  }

  /** Get a specific tab by ID. */
  getTab(tabId: string): TabState | null {
    return this.tabs.get(tabId) ?? null;
  }

  /** Get all tabs in insertion order. */
  getAllTabs(): TabState[] {
    return [...this.tabs.values()];
  }

  /** Get the number of open tabs. */
  getTabCount(): number {
    return this.tabs.size;
  }

  /**
   * Get the next tab (cyclic).
   * @returns The next TabState, or null if fewer than 2 tabs.
   */
  getNextTab(): TabState | null {
    if (this.tabs.size < 2 || !this.activeTabId) return null;
    const ids = [...this.tabs.keys()];
    const idx = ids.indexOf(this.activeTabId);
    const nextIdx = (idx + 1) % ids.length;
    return this.tabs.get(ids[nextIdx]) ?? null;
  }

  /**
   * Get the previous tab (cyclic).
   * @returns The previous TabState, or null if fewer than 2 tabs.
   */
  getPreviousTab(): TabState | null {
    if (this.tabs.size < 2 || !this.activeTabId) return null;
    const ids = [...this.tabs.keys()];
    const idx = ids.indexOf(this.activeTabId);
    const prevIdx = (idx - 1 + ids.length) % ids.length;
    return this.tabs.get(ids[prevIdx]) ?? null;
  }
}
