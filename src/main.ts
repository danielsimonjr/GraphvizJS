import { indentWithTab, redo, undo } from '@codemirror/commands';
import { Compartment, EditorState, StateEffect } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { basicSetup, EditorView } from 'codemirror';
import 'remixicon/fonts/remixicon.css';

import { AUTOSAVE_INTERVAL, TAB_DRAFTS_KEY } from './autosave/constants';
import { createDotAutocomplete } from './editor/autocomplete';
import { createDotLanguage } from './editor/language';
import { createDotLinter, lintGutter } from './editor/linting';
import { createSearch } from './editor/search';
import { createEditorTheme } from './editor/theme';
import {
  createEditorZoomController,
  createEditorZoomExtension,
  createEditorZoomKeymap,
  type EditorZoomController,
} from './editor/zoom';
import { setupHelpDialog } from './help/dialog';
import { type MenuCommandHandlers, setupMenuCommands } from './menu/commands';
import {
  confirm,
  store as platformStore,
  readTextFile,
  renderSvg,
  setMenuRecent,
  validateDot,
} from './platform';
import type { LayoutEngine } from './preview/graphviz';
import { initGraphviz } from './preview/graphviz';
import { createPreview } from './preview/render';
import {
  createZoomController,
  setupWheelZoom,
  setupZoomControls,
  updateLevelDisplay,
} from './preview/zoom';
import { addRecent, loadRecent, removeRecent, saveRecent } from './recent/recent-files';
import { captureSession, loadSession, persistSession, type SessionData } from './session/session';
import type { TabState } from './tabs/manager';
import { MAX_TABS, TabManager } from './tabs/manager';
import { renderTabBar, setupTabBar } from './tabs/tab-bar';
import { setupToolbarActions } from './toolbar/actions';
import { makeFormatKeymap } from './toolbar/format';
import { setupLayoutEngine } from './toolbar/layout-engine';
import { setupToolbarShortcuts } from './toolbar/shortcuts';
import { setupFileWatch } from './watch/file-watch';
import { loadEditorZoom, saveEditorZoom } from './window/state';
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

const DOT_LANGUAGE = createDotLanguage();
const EDITOR_THEME = createEditorTheme();

window.addEventListener('DOMContentLoaded', bootstrap);

async function bootstrap(): Promise<void> {
  const host = document.querySelector<HTMLDivElement>('#editor-host');
  const previewElement = document.querySelector<HTMLDivElement>('#preview-host');
  const newDiagramButton = document.querySelector<HTMLButtonElement>('[data-action="new-diagram"]');
  const saveButton = document.querySelector<HTMLButtonElement>('[data-action="save-diagram"]');
  const saveAsButton = document.querySelector<HTMLButtonElement>('[data-action="save-as-diagram"]');
  const openButton = document.querySelector<HTMLButtonElement>('[data-action="open-diagram"]');
  const examplesButton = document.querySelector<HTMLButtonElement>('[data-action="examples-menu"]');
  const examplesMenu = document.querySelector<HTMLDivElement>(
    '[data-dropdown="examples"] .toolbar-menu'
  );
  const recentButton = document.querySelector<HTMLButtonElement>('[data-action="recent-menu"]');
  const recentMenu = document.querySelector<HTMLDivElement>(
    '[data-dropdown="recent"] .toolbar-menu'
  );
  const exportButton = document.querySelector<HTMLButtonElement>('[data-action="export-menu"]');
  const exportMenu = document.querySelector<HTMLDivElement>(
    '[data-dropdown="export"] .toolbar-menu'
  );
  const findButton = document.querySelector<HTMLButtonElement>('[data-action="find"]');
  const formatButton = document.querySelector<HTMLButtonElement>('[data-action="format"]');
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

  const zoomController = createZoomController(previewElement, (level) => {
    if (zoomLevelDisplay) {
      updateLevelDisplay(zoomLevelDisplay, level);
    }
  });

  setupZoomControls(zoomController, zoomInBtn, zoomOutBtn, zoomResetBtn, zoomLevelDisplay);
  if (previewPane) {
    setupWheelZoom(previewPane, zoomController);
  }

  const status = createStatusController(statusMessage);
  const fileStatus = createFileStatusController(statusFile);

  // ── Tab Manager ──────────────────────────────────────────────────
  // Declared before createPreview() so the getEngine closure below can
  // reference it (invoked lazily at render time, after this is assigned).
  const tabManager = new TabManager();
  const editorZoomByTab = new Map<string, EditorZoomController>();

  // Declared here (before session restore, which calls createNewTab) and assigned
  // after restore completes. createNewTab/closeTab call `fileWatch?.sync()`; using
  // optional chaining avoids a TDZ crash if they run during restore, before the
  // real setupFileWatch() call below is reached.
  let fileWatch: { sync: () => void; dispose: () => void } | null = null;

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
    getEngine: () => tabManager.getActiveTab()?.layoutEngine ?? 'dot',
    render: renderSvg,
  });

  // ── Recent files ─────────────────────────────────────────────────
  let recentFiles: string[] = await loadRecent(platformStore);
  void setMenuRecent(recentFiles);
  async function recordRecent(path: string): Promise<void> {
    recentFiles = addRecent(recentFiles, path);
    await saveRecent(platformStore, recentFiles);
    void setMenuRecent(recentFiles);
  }

  const { extension: zoomExtension, compartment: zoomCompartment } = createEditorZoomExtension();
  const savedEditorZoom = await loadEditorZoom();

  /** Create a CodeMirror editor for a tab and attach it to the editor host. */
  function createTabEditor(initialDoc: string, visible: boolean): EditorView {
    const extensions = [
      basicSetup,
      DOT_LANGUAGE,
      createDotAutocomplete(),
      createSearch(),
      keymap.of([makeFormatKeymap((doc) => schedulePreviewRender(doc))]),
      createDotLinter({
        getEngine: () => tabManager.getActiveTab()?.layoutEngine ?? 'dot',
        validate: validateDot,
      }),
      lintGutter(),
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
    scheduleSessionSave();
  }

  /** Mark a tab's document as committed (clean). */
  function commitDocument(doc: string, options?: { saved?: boolean }): void {
    const tab = tabManager.getActiveTab();
    if (!tab) return;

    tab.lastCommittedDoc = doc;
    tab.isDirty = false;
    if (options?.saved) {
      tab.lastSavedAt = new Date();
    } else if (!tab.filePath) {
      tab.lastSavedAt = null;
    }
    updateFileStatus();
    refreshTabBar();
    scheduleSessionSave();
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

  /** Sync the layout engine <select> to reflect the given engine. */
  function syncEngineSelect(engine: LayoutEngine): void {
    const select = document.querySelector<HTMLSelectElement>('#layout-engine');
    if (select) select.value = engine;
  }

  /** Create a new tab with content and optional file path. Returns the tab or null if at limit. */
  function createNewTab(
    content: string,
    filePath: string | null = null,
    engine: LayoutEngine = 'dot',
    savedContent: string = content
  ): TabState | null {
    const editorView = createTabEditor(content, true);
    const tab = tabManager.createTab({ content, filePath, editorView, layoutEngine: engine });
    if (!tab) {
      // At tab limit -- destroy the orphan editor and notify user
      editorView.destroy();
      status.info(`Maximum ${MAX_TABS} tabs reached`);
      return null;
    }

    // Hide current tab's editor (the new tab is now active)
    const allTabs = tabManager.getAllTabs();
    for (const t of allTabs) {
      if (t.id !== tab.id && t.editorView) {
        t.editorView.dom.style.display = 'none';
      }
    }

    // Set up editor zoom for the new editor
    const editorZoom = createEditorZoomController(
      editorView,
      zoomCompartment,
      (level) => {
        saveEditorZoom(level);
      },
      savedEditorZoom ?? undefined
    );
    editorView.dispatch({
      effects: StateEffect.appendConfig.of(createEditorZoomKeymap(editorZoom)),
    });
    editorZoomByTab.set(tab.id, editorZoom);

    tab.lastCommittedDoc = savedContent;
    tab.isDirty = content !== savedContent;

    refreshTabBar();
    updateFileStatus();
    schedulePreviewRender(content);
    editorView.focus();
    syncEngineSelect(tab.layoutEngine);
    scheduleSessionSave();
    fileWatch?.sync();

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
    syncEngineSelect(newTab.layoutEngine);
    schedulePreviewRender(newTab.editorView.state.doc.toString());
    scheduleSessionSave();
  }

  /** Close a tab by ID. Prompts if dirty. */
  async function closeTab(tabId: string): Promise<void> {
    // Cannot close the last tab
    if (tabManager.getTabCount() <= 1) return;

    const tab = tabManager.getTab(tabId);
    if (!tab) return;

    // Confirm before closing a dirty tab
    if (tab.isDirty) {
      const proceed = await confirm('This tab has unsaved changes. Close anyway?', {
        title: 'Unsaved Changes',
        kind: 'warning',
      });
      if (!proceed) return;
    }

    // Destroy the editor DOM
    if (tab.editorView) {
      tab.editorView.destroy();
    }

    const newActiveTab = tabManager.closeTab(tabId);
    editorZoomByTab.delete(tabId);
    if (newActiveTab?.editorView) {
      newActiveTab.editorView.dom.style.display = '';
      newActiveTab.editorView.focus();
      syncEngineSelect(newActiveTab.layoutEngine);
      schedulePreviewRender(newActiveTab.editorView.state.doc.toString());
    }

    refreshTabBar();
    updateFileStatus();
    scheduleSessionSave();
    fileWatch?.sync();
  }

  // ── Session persistence ──────────────────────────────────────────
  const captureCurrentSession = (): SessionData => {
    const tabs = tabManager.getAllTabs();
    return captureSession(
      tabs.map((t) => ({
        filePath: t.filePath,
        content: t.editorView?.state.doc.toString() ?? t.lastCommittedDoc,
        savedContent: t.lastCommittedDoc,
        engine: t.layoutEngine,
      })),
      tabs.findIndex((t) => t.id === tabManager.getActiveTabId())
    );
  };

  let sessionSaveTimer: number | null = null;
  const scheduleSessionSave = (): void => {
    if (sessionSaveTimer !== null) window.clearTimeout(sessionSaveTimer);
    sessionSaveTimer = window.setTimeout(() => {
      sessionSaveTimer = null;
      void persistSession(platformStore, captureCurrentSession());
    }, 500);
  };

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

  // Silent session restore: rehydrate the previous open-tab session, if any.
  {
    const session = await loadSession(platformStore);
    if (session && session.tabs.length > 0) {
      const [first, ...rest] = session.tabs;
      const editor = initialTab.editorView!;
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: first.content } });
      initialTab.filePath = first.filePath;
      initialTab.layoutEngine = first.engine;
      initialTab.lastCommittedDoc = first.savedContent;
      initialTab.isDirty = first.content !== first.savedContent;
      for (const t of rest) {
        createNewTab(t.content, t.filePath, t.engine, t.savedContent);
      }
      const restored = tabManager.getAllTabs();
      const target = restored[Math.min(session.activeIndex, restored.length - 1)];
      if (target) switchToTab(target.id);
      syncEngineSelect(tabManager.getActiveTab()?.layoutEngine ?? 'dot');
      updateFileStatus();
      refreshTabBar();
      // One-time cleanup of the legacy draft key now that it's migrated.
      await platformStore.delete(TAB_DRAFTS_KEY);
    }
  }

  // ── External-change reload policy ─────────────────────────────────
  function openPaths(): string[] {
    return tabManager
      .getAllTabs()
      .map((t) => t.filePath)
      .filter((p): p is string => p !== null);
  }

  function fileBasename(p: string): string {
    const n = p.replace(/\\/g, '/');
    const i = n.lastIndexOf('/');
    return i >= 0 ? n.slice(i + 1) : n;
  }

  /** Reload a tab's editor from disk content, clearing dirty state. */
  function applyReload(tab: TabState, disk: string): void {
    if (tab.editorView) {
      tab.editorView.dispatch({
        changes: { from: 0, to: tab.editorView.state.doc.length, insert: disk },
      });
    }
    tab.lastCommittedDoc = disk;
    tab.isDirty = false;
    if (tab.id === tabManager.getActiveTabId()) {
      schedulePreviewRender(disk);
      updateFileStatus();
    }
    refreshTabBar();
    // Persist immediately so a background-tab reload isn't lost if the app quits
    // before the 30s backstop (the doc-change listener only fires for the active tab).
    scheduleSessionSave();
  }

  /** Handle an external (on-disk) change to a watched file: silent reload when
   * clean, conflict prompt when dirty. Never clobbers unsaved edits. */
  async function onExternalChange(changedPath: string): Promise<void> {
    const tabs = tabManager.getAllTabs().filter((t) => t.filePath === changedPath);
    if (tabs.length === 0) return;
    const disk = await readTextFile(changedPath);
    if (disk === null) {
      status.info('File no longer available on disk');
      return;
    }
    for (const tab of tabs) {
      const current = tab.editorView?.state.doc.toString() ?? tab.lastCommittedDoc;
      if (current === disk) continue;
      if (!tab.isDirty) {
        applyReload(tab, disk);
      } else {
        const proceed = await confirm(
          `"${fileBasename(changedPath)}" changed on disk. Reload and discard your edits?`,
          { title: 'File Changed', kind: 'warning' }
        );
        if (proceed) applyReload(tab, disk);
      }
    }
  }

  fileWatch = setupFileWatch({ getOpenPaths: openPaths, onExternalChange });

  initialTab.editorView!.focus();
  host.dataset.editor = 'mounted';
  previewElement.dataset.preview = 'ready';
  initHorizontalResize(workspace, editorPane, previewPane, divider);

  /** Resolve a recent-file path: switch to it if already open, else load it into a new tab. */
  async function pickRecent(path: string): Promise<void> {
    const existing = tabManager.getAllTabs().find((t) => t.filePath === path);
    if (existing) {
      switchToTab(existing.id);
      return;
    }
    const content = await readTextFile(path);
    if (content === null) {
      status.info('File no longer available');
      recentFiles = removeRecent(recentFiles, path);
      await saveRecent(platformStore, recentFiles);
      void setMenuRecent(recentFiles);
      return;
    }
    createNewTab(content, path);
    await recordRecent(path);
    fileWatch?.sync();
  }

  setupToolbarActions({
    getEditor() {
      return tabManager.getActiveTab()!.editorView!;
    },
    newDiagramButton,
    openButton,
    saveButton,
    saveAsButton,
    exportButton,
    exportMenu,
    examplesButton,
    examplesMenu,
    recentButton,
    recentMenu,
    findButton,
    formatButton,
    commitDocument,
    onNew() {
      createNewTab(DEFAULT_SNIPPET);
    },
    onOpen(content, path) {
      createNewTab(content, path);
      void recordRecent(path);
      fileWatch?.sync();
    },
    onLoadExample(content) {
      createNewTab(content);
    },
    onFormat(doc) {
      const tab = tabManager.getActiveTab();
      if (tab) handleDocChange(tab, doc);
      schedulePreviewRender(doc);
    },
    onPathChange(path) {
      const tab = tabManager.getActiveTab();
      if (!tab) return;
      const previousPath = tab.filePath;
      tab.filePath = path;
      if (path === null || path !== previousPath) {
        tab.lastSavedAt = null;
      }
      if (path) void recordRecent(path);
      updateFileStatus();
      refreshTabBar();
      scheduleSessionSave();
      fileWatch?.sync();
    },
    getPath() {
      return tabManager.getActiveTab()?.filePath ?? null;
    },
    getRecent: () => recentFiles,
    onPickRecent: pickRecent,
  });

  setupToolbarShortcuts({
    newButton: newDiagramButton,
    openButton,
    saveButton,
    saveAsButton,
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

  /** Apply a layout engine change to the active tab, re-render, and persist. */
  function applyEngine(engine: LayoutEngine): void {
    const tab = tabManager.getActiveTab();
    if (!tab) return;
    tab.layoutEngine = engine;
    syncEngineSelect(engine);
    if (tab.editorView) schedulePreviewRender(tab.editorView.state.doc.toString());
    scheduleSessionSave();
  }

  setupLayoutEngine(applyEngine);

  // Backstop: persist the session on a 30s interval, in addition to the
  // debounced saves triggered by tab/content lifecycle events.
  window.setInterval(() => {
    void persistSession(platformStore, captureCurrentSession());
  }, AUTOSAVE_INTERVAL);

  setupHelpDialog(helpButton);

  // ── Native menu wiring ───────────────────────────────────────────
  const menuHandlers: MenuCommandHandlers = {
    new: () => createNewTab(DEFAULT_SNIPPET),
    newTab: () => createNewTab(DEFAULT_SNIPPET),
    open: () => openButton?.click(),
    openRecent: (path) => void pickRecent(path),
    save: () => saveButton?.click(),
    saveAs: () => saveAsButton?.click(),
    export: (format) =>
      document.querySelector<HTMLButtonElement>(`[data-export="${format}"]`)?.click(),
    closeTab: () => {
      const t = tabManager.getActiveTab();
      if (t) void closeTab(t.id);
    },
    undo: () => {
      const v = tabManager.getActiveTab()?.editorView;
      if (v) {
        undo(v);
        v.focus();
      }
    },
    redo: () => {
      const v = tabManager.getActiveTab()?.editorView;
      if (v) {
        redo(v);
        v.focus();
      }
    },
    find: () => findButton?.click(),
    format: () => formatButton?.click(),
    setEngine: (engine) => applyEngine(engine as LayoutEngine),
    zoomIn: () => editorZoomByTab.get(tabManager.getActiveTabId() ?? '')?.zoomIn(),
    zoomOut: () => editorZoomByTab.get(tabManager.getActiveTabId() ?? '')?.zoomOut(),
    zoomReset: () => editorZoomByTab.get(tabManager.getActiveTabId() ?? '')?.reset(),
    help: () => helpButton?.click(),
  };
  setupMenuCommands(menuHandlers);
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
