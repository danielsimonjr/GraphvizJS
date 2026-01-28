import { indentWithTab } from '@codemirror/commands';
import { Compartment, EditorState, StateEffect } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { basicSetup, EditorView } from 'codemirror';
import 'remixicon/fonts/remixicon.css';

import { clearDraft, setupMultiTabAutosave } from './autosave/manager';
import { checkForMultiTabRecovery, promptMultiTabRecovery } from './autosave/recovery';
import { createDotLanguage } from './editor/language';
import { createEditorTheme } from './editor/theme';
import {
  createEditorZoomController,
  createEditorZoomExtension,
  createEditorZoomKeymap,
} from './editor/zoom';
import { setupHelpDialog } from './help/dialog';
import { initGraphviz } from './preview/graphviz';
import { createPreview } from './preview/render';
import {
  createZoomController,
  setupWheelZoom,
  setupZoomControls,
  updateLevelDisplay,
} from './preview/zoom';
import type { TabState } from './tabs/manager';
import { MAX_TABS, TabManager } from './tabs/manager';
import { renderTabBar, setupTabBar } from './tabs/tab-bar';
import { setupToolbarActions } from './toolbar/actions';
import { getCurrentEngine, setupLayoutEngine } from './toolbar/layout-engine';
import { setupToolbarShortcuts } from './toolbar/shortcuts';
import {
  loadEditorZoom,
  loadSettingsStore,
  saveEditorZoom,
  setupWindowPersistence,
} from './window/state';
import { initHorizontalResize } from './workspace/resize';

const DEFAULT_SNIPPET = `digraph G {
    Start -> Decision [label="check"];
    Decision -> Great [label="Yes"];
    Decision -> Iterate [label="Not yet"];

    Start [shape=ellipse];
    Decision [shape=diamond, label="Is it working?"];
    Great [shape=box, label="Great!"];
    Iterate [shape=box, label="Keep iterating"];
}`;

const RENDER_DELAY = 300;
const WINDOW_PERSIST_DELAY = 400;

const DOT_LANGUAGE = createDotLanguage();
const EDITOR_THEME = createEditorTheme();

window.addEventListener('DOMContentLoaded', bootstrap);

async function bootstrap(): Promise<void> {
  const host = document.querySelector<HTMLDivElement>('#editor-host');
  const previewElement = document.querySelector<HTMLDivElement>('#preview-host');
  const newDiagramButton = document.querySelector<HTMLButtonElement>('[data-action="new-diagram"]');
  const saveButton = document.querySelector<HTMLButtonElement>('[data-action="save-diagram"]');
  const openButton = document.querySelector<HTMLButtonElement>('[data-action="open-diagram"]');
  const examplesButton = document.querySelector<HTMLButtonElement>('[data-action="examples-menu"]');
  const examplesMenu = document.querySelector<HTMLDivElement>(
    '[data-dropdown="examples"] .toolbar-menu'
  );
  const exportButton = document.querySelector<HTMLButtonElement>('[data-action="export-menu"]');
  const exportMenu = document.querySelector<HTMLDivElement>(
    '[data-dropdown="export"] .toolbar-menu'
  );
  const statusMessage = document.querySelector<HTMLSpanElement>('[data-status="message"]');
  const statusFile = document.querySelector<HTMLSpanElement>('[data-status="file"]');
  const workspace = document.querySelector<HTMLDivElement>('.workspace');
  const editorPane = document.querySelector<HTMLElement>('[data-pane="editor"]');
  const previewPane = document.querySelector<HTMLElement>('[data-pane="preview"]');
  const divider = document.querySelector<HTMLDivElement>('.divider');
  const zoomInBtn = document.querySelector<HTMLButtonElement>('[data-action="zoom-in"]');
  const zoomOutBtn = document.querySelector<HTMLButtonElement>('[data-action="zoom-out"]');
  const zoomResetBtn = document.querySelector<HTMLButtonElement>('[data-action="zoom-reset"]');
  const zoomLevelDisplay = document.querySelector<HTMLSpanElement>('[data-zoom-level]');
  const helpButton = document.querySelector<HTMLButtonElement>('[data-action="help"]');
  const tabBarContainer = document.querySelector<HTMLElement>('.tab-bar');

  if (!host || !previewElement) {
    return;
  }

  await initGraphviz();

  const appWindow = getCurrentWindow();
  const store = await loadSettingsStore();

  const zoomController = createZoomController(previewElement, (level) => {
    if (zoomLevelDisplay) {
      updateLevelDisplay(zoomLevelDisplay, level);
    }
  });

  setupZoomControls(zoomController, zoomInBtn, zoomOutBtn, zoomResetBtn, zoomLevelDisplay);
  if (previewPane) {
    setupWheelZoom(previewPane, zoomController);
  }

  if (store) {
    await setupWindowPersistence(store, appWindow, WINDOW_PERSIST_DELAY);
  }

  const status = createStatusController(statusMessage);
  const fileStatus = createFileStatusController(statusFile);

  const schedulePreviewRender = createPreview(previewElement, RENDER_DELAY, {
    callbacks: {
      onRenderStart() {
        status.rendering();
      },
      onRenderSuccess() {
        status.success('Preview updated successfully');
        zoomController.applyZoom();
      },
      onRenderEmpty() {
        status.info('Waiting for DOT markup...');
      },
      onRenderError(details) {
        status.error(details);
      },
    },
    getEngine: getCurrentEngine,
  });

  // ── Tab Manager ──────────────────────────────────────────────────
  const tabManager = new TabManager();

  const { extension: zoomExtension, compartment: zoomCompartment } = createEditorZoomExtension();
  const savedEditorZoom = store ? await loadEditorZoom(store) : null;

  /** Create a CodeMirror editor for a tab and attach it to the editor host. */
  function createTabEditor(initialDoc: string, visible: boolean): EditorView {
    const extensions = [
      basicSetup,
      DOT_LANGUAGE,
      EditorView.lineWrapping,
      EDITOR_THEME,
      keymap.of([indentWithTab]),
      zoomExtension,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const activeTab = tabManager.getActiveTab();
          if (activeTab && activeTab.editorView === update.view) {
            const nextDoc = update.state.doc.toString();
            schedulePreviewRender(nextDoc);
            handleDocChange(activeTab, nextDoc);
          }
        }
      }),
    ];

    const state = EditorState.create({ doc: initialDoc, extensions });
    const editorView = new EditorView({ parent: host!, state });

    // Hide inactive tab editors
    if (!visible) {
      editorView.dom.style.display = 'none';
    }

    return editorView;
  }

  /** Update dirty state for a tab. */
  function handleDocChange(tab: TabState, doc: string): void {
    tab.isDirty = doc !== tab.lastCommittedDoc;
    updateFileStatus();
    refreshTabBar();
  }

  /** Mark a tab's document as committed (clean). */
  function commitDocument(doc: string, options?: { saved?: boolean }): void {
    const tab = tabManager.getActiveTab();
    if (!tab) return;

    tab.lastCommittedDoc = doc;
    tab.isDirty = false;
    if (options?.saved) {
      tab.lastSavedAt = new Date();
      if (store) {
        clearDraft(store);
      }
    } else if (!tab.filePath) {
      tab.lastSavedAt = null;
    }
    updateFileStatus();
    refreshTabBar();
  }

  /** Update the file status bar from the active tab. */
  function updateFileStatus(): void {
    const tab = tabManager.getActiveTab();
    if (!tab) return;
    fileStatus.update({
      path: tab.filePath,
      dirty: tab.isDirty,
      lastSavedAt: tab.lastSavedAt,
    });
  }

  /** Re-render the tab bar UI. */
  function refreshTabBar(): void {
    if (!tabBarContainer) return;
    renderTabBar(tabManager.getAllTabs(), tabManager.getActiveTabId(), tabBarContainer);
  }

  /** Create a new tab with content and optional file path. Returns the tab or null if at limit. */
  function createNewTab(content: string, filePath: string | null = null): TabState | null {
    if (tabManager.getTabCount() >= MAX_TABS) {
      status.info(`Maximum ${MAX_TABS} tabs reached`);
      return null;
    }

    // Hide current active tab's editor
    const currentTab = tabManager.getActiveTab();
    if (currentTab?.editorView) {
      currentTab.editorView.dom.style.display = 'none';
    }

    const editorView = createTabEditor(content, true);
    const tab = tabManager.createTab({ content, filePath, editorView });
    if (!tab) return null;

    // Set up editor zoom for the new editor
    const editorZoom = createEditorZoomController(
      editorView,
      zoomCompartment,
      (level) => {
        if (store) saveEditorZoom(store, level);
      },
      savedEditorZoom ?? undefined
    );
    editorView.dispatch({
      effects: StateEffect.appendConfig.of(createEditorZoomKeymap(editorZoom)),
    });

    tab.lastCommittedDoc = content;

    refreshTabBar();
    updateFileStatus();
    schedulePreviewRender(content);
    editorView.focus();

    return tab;
  }

  /** Switch to a tab by ID. */
  function switchToTab(tabId: string): void {
    const currentTab = tabManager.getActiveTab();
    if (currentTab?.id === tabId) return;

    // Hide current editor
    if (currentTab?.editorView) {
      currentTab.editorView.dom.style.display = 'none';
    }

    const newTab = tabManager.setActiveTab(tabId);
    if (!newTab?.editorView) return;

    // Show new editor
    newTab.editorView.dom.style.display = '';
    newTab.editorView.focus();

    refreshTabBar();
    updateFileStatus();
    schedulePreviewRender(newTab.editorView.state.doc.toString());
  }

  /** Close a tab by ID. */
  function closeTab(tabId: string): void {
    // Cannot close the last tab
    if (tabManager.getTabCount() <= 1) return;

    const tab = tabManager.getTab(tabId);
    if (!tab) return;

    // Destroy the editor DOM
    if (tab.editorView) {
      tab.editorView.destroy();
    }

    const newActiveTab = tabManager.closeTab(tabId);
    if (newActiveTab?.editorView) {
      newActiveTab.editorView.dom.style.display = '';
      newActiveTab.editorView.focus();
      schedulePreviewRender(newActiveTab.editorView.state.doc.toString());
    }

    refreshTabBar();
    updateFileStatus();
  }

  // ── Tab bar setup ────────────────────────────────────────────────
  if (tabBarContainer) {
    setupTabBar({
      container: tabBarContainer,
      callbacks: {
        onTabSwitch: switchToTab,
        onTabClose: closeTab,
        onNewTab: () => createNewTab(DEFAULT_SNIPPET),
      },
    });
  }

  // ── Create initial tab ──────────────────────────────────────────
  const initialTab = createNewTab(DEFAULT_SNIPPET);
  if (!initialTab) return;

  commitDocument(initialTab.editorView!.state.doc.toString());

  // Check for unsaved draft recovery before focusing editor
  if (store) {
    const recoveryData = await checkForMultiTabRecovery(store);
    if (recoveryData) {
      const shouldRecover = await promptMultiTabRecovery(recoveryData);
      if (shouldRecover) {
        // Restore first tab into the initial tab
        const firstDraft = recoveryData.tabs[0];
        if (firstDraft) {
          const editor = initialTab.editorView!;
          editor.dispatch({
            changes: { from: 0, to: editor.state.doc.length, insert: firstDraft.content },
          });
          if (firstDraft.filePath) {
            initialTab.filePath = firstDraft.filePath;
          }
          handleDocChange(initialTab, firstDraft.content);
        }

        // Restore additional tabs
        for (let i = 1; i < recoveryData.tabs.length; i++) {
          const draft = recoveryData.tabs[i];
          createNewTab(draft.content, draft.filePath);
        }

        // Switch back to first tab
        if (recoveryData.tabs.length > 1) {
          switchToTab(initialTab.id);
        }
      }
      // Clear draft regardless of user choice: accepting restores the content,
      // declining means the user intentionally discarded it. Either way, we don't
      // want the same recovery prompt on next startup.
      await clearDraft(store);
    }
  }

  initialTab.editorView!.focus();
  host.dataset.editor = 'mounted';
  previewElement.dataset.preview = 'ready';
  initHorizontalResize(workspace, editorPane, previewPane, divider);

  setupToolbarActions({
    getEditor() {
      return tabManager.getActiveTab()!.editorView!;
    },
    schedulePreviewRender,
    newDiagramButton,
    openButton,
    saveButton,
    exportButton,
    exportMenu,
    examplesButton,
    examplesMenu,
    commitDocument,
    onNew() {
      createNewTab(DEFAULT_SNIPPET);
    },
    onOpen(content, path) {
      createNewTab(content, path);
    },
    onPathChange(path) {
      const tab = tabManager.getActiveTab();
      if (!tab) return;
      const previousPath = tab.filePath;
      tab.filePath = path;
      if (path === null || path !== previousPath) {
        tab.lastSavedAt = null;
      }
      updateFileStatus();
      refreshTabBar();
    },
    getPath() {
      return tabManager.getActiveTab()?.filePath ?? null;
    },
  });

  setupToolbarShortcuts({
    newButton: newDiagramButton,
    openButton,
    saveButton,
    onNewTab: () => createNewTab(DEFAULT_SNIPPET),
    onCloseTab: () => {
      const tab = tabManager.getActiveTab();
      if (tab) closeTab(tab.id);
    },
    onNextTab: () => {
      const next = tabManager.getNextTab();
      if (next) switchToTab(next.id);
    },
    onPreviousTab: () => {
      const prev = tabManager.getPreviousTab();
      if (prev) switchToTab(prev.id);
    },
  });

  setupLayoutEngine(() => {
    const tab = tabManager.getActiveTab();
    if (tab?.editorView) {
      schedulePreviewRender(tab.editorView.state.doc.toString());
    }
  });

  // Start autosave (all tabs saved every 30s when content changes)
  if (store) {
    setupMultiTabAutosave(
      {
        store,
        getTabDrafts: () =>
          tabManager.getAllTabs().map((tab) => ({
            content: tab.editorView?.state.doc.toString() ?? '',
            filePath: tab.filePath,
          })),
      },
      () => {
        status.success('Draft saved');
      }
    );
  }

  setupHelpDialog(helpButton);
}

type StatusLevel = 'idle' | 'loading' | 'success' | 'error' | 'info';

function createStatusController(element: HTMLSpanElement | null): {
  idle(message?: string): void;
  rendering(message?: string): void;
  success(message?: string): void;
  info(message: string): void;
  error(details: string): void;
} {
  const noop = () => {
    /* intentionally empty */
  };
  if (!element) {
    return {
      idle: noop,
      rendering: noop,
      success: noop,
      info: noop,
      error: noop,
    };
  }

  const target = element;

  const defaultMessage = (target.textContent || 'Ready.').trim() || 'Ready.';
  let revertTimer: number | null = null;

  function setStatus(message: string, level: StatusLevel, autoRevert = false): void {
    if (revertTimer !== null) {
      window.clearTimeout(revertTimer);
      revertTimer = null;
    }
    target.textContent = message;
    target.dataset.statusLevel = level;
    if (autoRevert) {
      revertTimer = window.setTimeout(() => {
        target.textContent = defaultMessage;
        target.dataset.statusLevel = 'idle';
        revertTimer = null;
      }, 4000);
    }
  }

  setStatus(defaultMessage, 'idle');

  return {
    idle(message) {
      setStatus(message ?? defaultMessage, 'idle');
    },
    rendering(message = 'Rendering preview...') {
      setStatus(message, 'loading');
    },
    success(message = 'Preview updated.') {
      setStatus(message, 'success', true);
    },
    info(message) {
      setStatus(message, 'info');
    },
    error(details) {
      const summary = details.split(/\r?\n/, 1)[0]?.trim() ?? 'Unknown error';
      setStatus(`Render failed: ${summary}`, 'error');
    },
  };
}

interface FileStatusState {
  path: string | null;
  dirty: boolean;
  lastSavedAt: Date | null;
}

function createFileStatusController(element: HTMLSpanElement | null): {
  update(state: FileStatusState): void;
} {
  const noop = () => {
    /* intentionally empty */
  };
  if (!element) {
    return {
      update: noop,
    };
  }

  const formatName = (path: string | null): string => {
    if (!path) {
      return 'Untitled';
    }
    const normalized = path.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return {
    update(state) {
      const { path, dirty, lastSavedAt } = state;
      const name = formatName(path);

      let details: string;
      if (dirty) {
        details = 'Unsaved changes';
      } else if (lastSavedAt) {
        details = `Saved ${formatTime(lastSavedAt)}`;
      } else if (path) {
        details = 'Opened from disk';
      } else {
        details = 'Not saved yet';
      }

      element.textContent = `${name} - ${details}`;
      element.dataset.dirty = dirty ? 'true' : 'false';

      const savedInfo = lastSavedAt ? `Last saved: ${lastSavedAt.toLocaleString()}` : null;
      if (path && savedInfo) {
        element.title = `${path}\n${savedInfo}`;
      } else if (path) {
        element.title = path;
      } else if (savedInfo) {
        element.title = savedInfo;
      } else {
        element.title = 'Unsaved diagram';
      }
    },
  };
}
