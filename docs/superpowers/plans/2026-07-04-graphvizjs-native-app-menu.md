# Native Application Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default Electron menu with a native File/Edit/View/Help application menu that mirrors existing actions, with label-only accelerators (existing keyboard handling stays authoritative).

**Architecture:** A pure `buildMenuTemplate` (in `src/menu/`, type-only Electron import) produces the menu template; `electron/app-menu.ts` installs it and fans menu clicks to the renderer over a new `menu:action` push channel (mirroring `file:changed`). A pure renderer dispatcher routes those actions to the functions already wired in `main.ts`. A `menu:setRecent` request channel keeps the Open Recent submenu fresh.

**Tech Stack:** TypeScript, Electron (`Menu`/`dialog`/`shell` built-ins), CodeMirror (`undo`/`redo` from `@codemirror/commands`, already a dependency), Vitest (unit), Playwright `_electron` (e2e), Biome.

## Global Constraints

- Ships as **v1.4.0** — bump `package.json`; add `CHANGELOG.md` `## [1.4.0]`.
- Default branch **`master`**; tag `v1.4.0`; release title `GraphvizJS v1.4.0 — Native application menu`.
- Windows-only build (electron-builder win nsis; CI on windows-latest).
- **No behavior change to existing keyboard shortcuts** (binding): every menu accelerator that duplicates an existing binding uses `registerAccelerator: false`; `shortcuts.ts` and CodeMirror keymaps are untouched. No double-fire.
- **No new runtime dependency.** `@codemirror/commands` already present; `Menu`/`dialog`/`shell`/`BrowserWindow` are Electron built-ins.
- Pure modules keep only `import type` from `electron` (erased at runtime) so Vitest can import them.
- New IPC: push `menu:action`; request/response `menu:setRecent`. The dependency-graph IPC check must stay green — the wired-channel set grows from 12 → **13** (adds `menu:setRecent`; `menu:action` is a push, invisible to the invoke/handle check).
- Repo URL for View Source: `https://github.com/danielsimonjr/GraphvizJS`.
- Biome style: 2-space, single quotes, semicolons, trailing commas, 100-col, no `any`.
- Quality gate before merge: `pnpm typecheck` 0, `pnpm lint` clean, full unit + e2e green, `pnpm graph` exit 0.

---

## Task 1: Pure menu template

**Files:**
- Create: `src/menu/menu-template.ts`
- Test: `test/menu/menu-template.test.ts`

**Interfaces:**
- Produces:
  - `export type MenuActionId = 'new' | 'new-tab' | 'open' | 'open-recent' | 'save' | 'save-as' | 'export' | 'close-tab' | 'undo' | 'redo' | 'find' | 'format' | 'set-engine' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'help';`
  - `export interface MenuBuildOptions { isMac: boolean; isDev: boolean; recentFiles: string[]; onAction: (action: MenuActionId, payload?: string) => void; onOpenSource: () => void; onAbout: () => void; }`
  - `export const LAYOUT_ENGINES: readonly string[]` — the 8 engines.
  - `export function buildMenuTemplate(opts: MenuBuildOptions): import('electron').MenuItemConstructorOptions[];`

**Design notes for the implementer:**
- Import ONLY the type: `import type { MenuItemConstructorOptions } from 'electron';`. No runtime `electron` import in this file.
- Every *dispatching* item (one that calls `onAction`) gets a stable `id` equal to its action id (e.g. `id: 'new-tab'`), and `click: () => opts.onAction('new-tab')`. For payload items use a composite id: Export items `id: 'export:pdf'` → `onAction('export','pdf')`; engine items `id: 'engine:neato'` → `onAction('set-engine','neato')`; recent items `id: 'recent:<index>'` → `onAction('open-recent', path)`.
- Accelerators for actions already bound elsewhere use `registerAccelerator: false` (label-only): New `CmdOrCtrl+N`, New Tab `CmdOrCtrl+T`, Open `CmdOrCtrl+O`, Save `CmdOrCtrl+S`, Save As `CmdOrCtrl+Shift+S`, Close Tab `CmdOrCtrl+W`, Undo `CmdOrCtrl+Z`, Redo `CmdOrCtrl+Y`, Find `CmdOrCtrl+F`, Format `Shift+Alt+F`, Zoom In `CmdOrCtrl+=`, Zoom Out `CmdOrCtrl+-`, Reset Zoom `CmdOrCtrl+0`, Help `F1`.
- Native-role items (no `onAction`): Cut/Copy/Paste/SelectAll (`role: 'cut'|'copy'|'paste'|'selectAll'`), Toggle Full Screen (`role: 'togglefullscreen'`), and — only when `isDev` — Reload (`role: 'reload'`) + Toggle DevTools (`role: 'toggleDevTools'`). Quit: on non-mac a File-menu item `role: 'quit'`; on mac in the app menu.
- macOS app menu (first submenu) appears only when `isMac`: `{ role: 'appMenu' }` is the simplest, but to route About through `onAbout`, build it explicitly: label = app name, submenu = [About (click→onAbout), separator, {role:'services'}, separator, {role:'hide'},{role:'hideOthers'},{role:'unhide'}, separator, {role:'quit'}].
- Open Recent submenu: if `recentFiles` is empty, a single `{ label: 'No Recent Files', enabled: false }`; else one item per path with `label: basename(path)`, `id: 'recent:<i>'`, `click: () => onAction('open-recent', path)`.
- View → Layout Engine submenu: one item per `LAYOUT_ENGINES` entry, `label: engine`, `id: 'engine:<name>'`, `click: () => onAction('set-engine', name)`.
- Help → View Source: `click: () => onOpenSource()`. About (non-mac, in Help): `click: () => onAbout()`.
- Provide a local `basename(p)` helper (`p.replace(/\\/g,'/')` then slice after last `/`).

- [ ] **Step 1: Write the failing test**

```ts
// test/menu/menu-template.test.ts
import { describe, expect, it, vi } from 'vitest';
import { buildMenuTemplate, LAYOUT_ENGINES, type MenuBuildOptions } from '../../src/menu/menu-template';

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

/** Depth-first find an item by id anywhere in the template tree. */
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
    expect(labels).not.toContain('GraphvizJS'); // no mac app menu
  });

  it('prepends the app menu on mac', () => {
    const t = buildMenuTemplate(opts({ isMac: true }));
    expect(String(t[0].label ?? t[0].role)).toBe('GraphvizJS');
  });

  it('includes Reload/DevTools only in dev builds', () => {
    expect(findById(buildMenuTemplate(opts({ isDev: false })), 'devtools')).toBeUndefined();
    // dev items are role-based; assert via presence of a reload role item
    const devView = buildMenuTemplate(opts({ isDev: true }));
    const hasReload = JSON.stringify(devView).includes('"role":"reload"');
    const noReload = JSON.stringify(buildMenuTemplate(opts({ isDev: false }))).includes('"role":"reload"');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/menu/menu-template.test.ts`
Expected: FAIL — `src/menu/menu-template` missing.

- [ ] **Step 3: Implement `menu-template.ts`**

Write `buildMenuTemplate` per the design notes above. Assign `id: 'view-source'` to the Help→View Source item and `id: 'about'` to the About item. Return `MenuItemConstructorOptions[]`. Keep it pure (type-only electron import). Run `pnpm lint` and fix style.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/menu/menu-template.test.ts` → PASS.
Run: `pnpm typecheck` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/menu/menu-template.ts test/menu/menu-template.test.ts
git commit -m "feat: pure native-menu template builder"
```

---

## Task 2: Pure renderer command dispatcher

**Files:**
- Create: `src/menu/commands.ts`
- Test: `test/menu/commands.test.ts`

**Interfaces:**
- Consumes: `MenuActionId` type from `src/menu/menu-template` (Task 1); `onMenuAction` from `src/platform` (Task 3 — for `setupMenuCommands`; but write `setupMenuCommands` to import it — Task 3 adds the export; if you implement Task 2 before Task 3, temporarily the import won't resolve — so this task's TEST only covers the pure `dispatchMenuAction`, and `setupMenuCommands` is a thin wrapper verified later).
- Produces:
  - `export interface MenuCommandHandlers { new: () => void; newTab: () => void; open: () => void; openRecent: (path: string) => void; save: () => void; saveAs: () => void; export: (format: string) => void; closeTab: () => void; undo: () => void; redo: () => void; find: () => void; format: () => void; setEngine: (engine: string) => void; zoomIn: () => void; zoomOut: () => void; zoomReset: () => void; help: () => void; }`
  - `export function dispatchMenuAction(handlers: MenuCommandHandlers, action: string, payload?: string): void;`
  - `export function setupMenuCommands(handlers: MenuCommandHandlers): () => void;`

- [ ] **Step 1: Write the failing test**

```ts
// test/menu/commands.test.ts
import { describe, expect, it, vi } from 'vitest';
import { dispatchMenuAction, type MenuCommandHandlers } from '../../src/menu/commands';

function handlers(): MenuCommandHandlers {
  return {
    new: vi.fn(), newTab: vi.fn(), open: vi.fn(), openRecent: vi.fn(),
    save: vi.fn(), saveAs: vi.fn(), export: vi.fn(), closeTab: vi.fn(),
    undo: vi.fn(), redo: vi.fn(), find: vi.fn(), format: vi.fn(),
    setEngine: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), zoomReset: vi.fn(), help: vi.fn(),
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
    dispatchMenuAction(h, 'open-recent', 'C:/x.dot');
    expect(h.openRecent).toHaveBeenCalledWith('C:/x.dot');
  });
  it('ignores unknown actions and missing payloads without throwing', () => {
    const h = handlers();
    expect(() => dispatchMenuAction(h, 'bogus')).not.toThrow();
    expect(() => dispatchMenuAction(h, 'export')).not.toThrow(); // no payload
    // export with no payload should not call the handler
    expect(h.export).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/menu/commands.test.ts`
Expected: FAIL — `src/menu/commands` missing.

- [ ] **Step 3: Implement `commands.ts`**

```ts
// src/menu/commands.ts
import { onMenuAction } from '../platform';
import type { MenuActionId } from './menu-template';

export interface MenuCommandHandlers {
  new: () => void;
  newTab: () => void;
  open: () => void;
  openRecent: (path: string) => void;
  save: () => void;
  saveAs: () => void;
  export: (format: string) => void;
  closeTab: () => void;
  undo: () => void;
  redo: () => void;
  find: () => void;
  format: () => void;
  setEngine: (engine: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  help: () => void;
}

/** Route a menu action id (+ optional payload) to its handler. Unknown ids and
 *  payload actions missing their payload are ignored. */
export function dispatchMenuAction(
  handlers: MenuCommandHandlers,
  action: string,
  payload?: string
): void {
  switch (action as MenuActionId) {
    case 'new': return handlers.new();
    case 'new-tab': return handlers.newTab();
    case 'open': return handlers.open();
    case 'open-recent': if (payload) handlers.openRecent(payload); return;
    case 'save': return handlers.save();
    case 'save-as': return handlers.saveAs();
    case 'export': if (payload) handlers.export(payload); return;
    case 'close-tab': return handlers.closeTab();
    case 'undo': return handlers.undo();
    case 'redo': return handlers.redo();
    case 'find': return handlers.find();
    case 'format': return handlers.format();
    case 'set-engine': if (payload) handlers.setEngine(payload); return;
    case 'zoom-in': return handlers.zoomIn();
    case 'zoom-out': return handlers.zoomOut();
    case 'zoom-reset': return handlers.zoomReset();
    case 'help': return handlers.help();
    default: return; // unknown action: ignore
  }
}

/** Subscribe the dispatcher to the menu:action push channel. */
export function setupMenuCommands(handlers: MenuCommandHandlers): () => void {
  return onMenuAction((action, payload) => dispatchMenuAction(handlers, action, payload));
}
```

Note: `setupMenuCommands` imports `onMenuAction` from `../platform`, which Task 3 adds. If you are running tasks strictly in order, Task 3 has not landed yet — that is fine because the UNIT TEST only imports `dispatchMenuAction` (pure) and does not execute `setupMenuCommands`. `pnpm typecheck` in THIS task will fail on the missing `onMenuAction` export, so add the platform export as part of THIS task's typecheck fix IF you run typecheck now — OR (preferred) accept that full typecheck passes only after Task 3. The task reviewer will treat a missing `onMenuAction` export as expected-until-Task-3. To keep this task self-contained and green, ALSO do Task 3 Step "platform + contract + preload" additions here if needed for typecheck. (Controller note: dispatch order — see execution note below.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/menu/commands.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/menu/commands.ts test/menu/commands.test.ts
git commit -m "feat: renderer menu-command dispatcher"
```

**Execution note (controller):** Task 2's `setupMenuCommands` references `onMenuAction` which Task 3 introduces. To avoid a broken typecheck between tasks, dispatch Task 3's IPC-channel additions (contract/preload/platform) BEFORE or TOGETHER-WITH Task 2, or allow Task 2 to add the `onMenuAction`/`setMenuRecent` platform+contract+preload declarations as part of its own typecheck-green requirement. The reviewer for whichever task adds them checks them.

---

## Task 3: Menu IPC channels + `setupAppMenu` (Electron side)

**Files:**
- Modify: `src/platform/contract.ts` (`onMenuAction`, `setMenuRecent`)
- Modify: `electron/preload.ts` (bridge both)
- Modify: `src/platform/index.ts` (wrappers)
- Create: `electron/app-menu.ts` (`setupAppMenu`)
- Modify: `electron/main.ts` (call `setupAppMenu`; `menu:setRecent` handler)
- Test: `test/e2e/app-menu.spec.ts` (menu installed)

**Interfaces:**
- Consumes: `buildMenuTemplate` (Task 1).
- Produces:
  - `GraphvizApi.onMenuAction(cb: (action: string, payload?: string) => void): () => void`
  - `GraphvizApi.setMenuRecent(paths: string[]): Promise<void>`
  - `onMenuAction`, `setMenuRecent` from `src/platform`
  - `setupAppMenu(): void` from `electron/app-menu.ts`

- [ ] **Step 1: Add the two channels to the contract/preload/platform**

`src/platform/contract.ts` — add to `GraphvizApi`:
```ts
  onMenuAction(cb: (action: string, payload?: string) => void): () => void;
  setMenuRecent(paths: string[]): Promise<void>;
```

`electron/preload.ts` — add to `api`:
```ts
  onMenuAction: (cb) => {
    const listener = (_e: IpcRendererEvent, msg: { action: string; payload?: string }) =>
      cb(msg.action, msg.payload);
    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  },
  setMenuRecent: (paths) => ipcRenderer.invoke('menu:setRecent', paths),
```

`src/platform/index.ts` — add wrappers:
```ts
export function onMenuAction(cb: (action: string, payload?: string) => void): () => void {
  return window.graphviz.onMenuAction(cb);
}

export function setMenuRecent(paths: string[]): Promise<void> {
  return window.graphviz.setMenuRecent(paths);
}
```

- [ ] **Step 2: Implement `electron/app-menu.ts`**

```ts
// electron/app-menu.ts
import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { buildMenuTemplate, type MenuActionId } from '../src/menu/menu-template';

const REPO_URL = 'https://github.com/danielsimonjr/GraphvizJS';

let recentFiles: string[] = [];

function sendAction(action: MenuActionId, payload?: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('menu:action', { action, payload });
  }
}

function showAbout(): void {
  const win = BrowserWindow.getFocusedWindow() ?? undefined;
  const detail = `Version ${app.getVersion()}`;
  const opts = { type: 'info' as const, title: 'About GraphvizJS', message: app.getName(), detail };
  if (win) dialog.showMessageBox(win, opts);
  else dialog.showMessageBox(opts);
}

/** Build and install the application menu from the current state. */
export function rebuildAppMenu(): void {
  const template = buildMenuTemplate({
    isMac: process.platform === 'darwin',
    isDev: !!process.env.VITE_DEV_SERVER_URL,
    recentFiles,
    onAction: sendAction,
    onOpenSource: () => void shell.openExternal(REPO_URL),
    onAbout: showAbout,
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Install the menu and keep the Open Recent submenu in sync with the renderer. */
export function setupAppMenu(): void {
  rebuildAppMenu();
}

/** Update the recent-files list used by the Open Recent submenu, and rebuild. */
export function setMenuRecentFiles(paths: string[]): void {
  recentFiles = Array.isArray(paths) ? paths : [];
  rebuildAppMenu();
}
```

- [ ] **Step 3: Wire into `electron/main.ts`**

- Import: `import { setMenuRecentFiles, setupAppMenu } from './app-menu';`
- In `registerIpc()`, add the handler:
```ts
  ipcMain.handle('menu:setRecent', (_e, paths: string[]) => {
    setMenuRecentFiles(paths);
  });
```
- In `app.whenReady().then(...)`, after `createWindow()` (menu is global; order is not critical, but keep it with the other setup):
```ts
    registerIpc();
    setupFileWatcher();
    createWindow();
    setupAppMenu();
```

- [ ] **Step 4: Write the e2e (menu installed)**

```ts
// test/e2e/app-menu.spec.ts
import { _electron as electron, expect, test } from '@playwright/test';

test('installs a native application menu with a File menu', async () => {
  const app = await electron.launch({ args: ['.'] });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();

  const labels = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    return menu ? menu.items.map((i) => i.label) : null;
  });
  expect(labels).not.toBeNull();
  expect(labels).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'Help']));
  await app.close();
});
```

- [ ] **Step 5: Run + typecheck + lint**

Run: `npx playwright test test/e2e/app-menu.spec.ts` → PASS.
Run: `pnpm typecheck` → 0. Run: `pnpm lint` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/platform/contract.ts electron/preload.ts src/platform/index.ts \
  electron/app-menu.ts electron/main.ts test/e2e/app-menu.spec.ts
git commit -m "feat: install native application menu + menu IPC channels"
```

---

## Task 4: Renderer integration (wire menu actions to app functions)

**Files:**
- Modify: `src/main.ts` (build `MenuCommandHandlers`, `setupMenuCommands`, `setMenuRecent` calls, editor-zoom map, extract `pickRecent`/`applyEngine`, import `undo`/`redo`)
- Test: `test/e2e/app-menu.spec.ts` (extend: File→New Tab round-trip)

**Interfaces:**
- Consumes: `setupMenuCommands`/`MenuCommandHandlers` (Task 2); `setMenuRecent` (Task 3); `undo`/`redo` from `@codemirror/commands`; the existing bootstrap functions.

- [ ] **Step 1: Extend the e2e with the round-trip (write first, expect fail)**

Add to `test/e2e/app-menu.spec.ts`:
```ts
test('File→New Tab menu item creates a new tab (menu:action round-trip)', async () => {
  const app = await electron.launch({ args: ['.'] });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();
  await expect(page.locator('[role="tab"]')).toHaveCount(1);

  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()?.getMenuItemById('new-tab')?.click();
  });
  await expect(page.locator('[role="tab"]')).toHaveCount(2);
  await app.close();
});
```
Run: `npx playwright test test/e2e/app-menu.spec.ts -g "New Tab"` → FAILS (no dispatcher wired; tab count stays 1).

- [ ] **Step 2: Add imports and an editor-zoom registry to `src/main.ts`**

- Add import: `import { redo, undo } from '@codemirror/commands';` (merge with the existing `import { indentWithTab } from '@codemirror/commands';` into one line).
- Add: `import { setupMenuCommands, type MenuCommandHandlers } from './menu/commands';`
- Add: `import { setMenuRecent } from './platform';` (merge into the existing `./platform` import).
- Add: `import type { EditorZoomController } from './editor/zoom';`
- Near the other bootstrap state (after `const tabManager = new TabManager();`), add:
```ts
  const editorZoomByTab = new Map<string, EditorZoomController>();
```

- [ ] **Step 3: Register/cleanup zoom controllers per tab**

- In `createNewTab`, after the `const editorZoom = createEditorZoomController(...)` block, register it: `editorZoomByTab.set(tab.id, editorZoom);`
- In `closeTab`, after `const newActiveTab = tabManager.closeTab(tabId);` (or right after destroying the editor), add `editorZoomByTab.delete(tabId);`.

- [ ] **Step 4: Extract `pickRecent` and `applyEngine` as named functions**

- Extract the inline `onPickRecent` body into a named function in bootstrap so both the toolbar wiring and the menu handler use it:
```ts
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
```
  and set `onPickRecent: pickRecent` in the `setupToolbarActions({...})` options.
- Extract the `setupLayoutEngine` callback body into `applyEngine(engine)`:
```ts
  function applyEngine(engine: LayoutEngine): void {
    const tab = tabManager.getActiveTab();
    if (!tab) return;
    tab.layoutEngine = engine;
    syncEngineSelect(engine);
    if (tab.editorView) schedulePreviewRender(tab.editorView.state.doc.toString());
    scheduleSessionSave();
  }
```
  and call `setupLayoutEngine(applyEngine);`.

- [ ] **Step 5: Keep the native menu's recent list in sync**

- In `recordRecent`, after `await saveRecent(...)`, add `void setMenuRecent(recentFiles);`.
- After `recentFiles` is loaded at startup (`let recentFiles = await loadRecent(...)`), push the initial list once: `void setMenuRecent(recentFiles);` (place it after the load; it is safe even before the menu exists — the handler just stores + rebuilds).

- [ ] **Step 6: Build the command handlers and subscribe**

Near the end of `bootstrap()` (after `setupLayoutEngine(applyEngine)` and before/after the 30s interval), add:
```ts
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
      if (v) { undo(v); v.focus(); }
    },
    redo: () => {
      const v = tabManager.getActiveTab()?.editorView;
      if (v) { redo(v); v.focus(); }
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
```
(The `export` handler relies on clicking the hidden `[data-export]` item — the export menu's delegated click handler fires regardless of the menu's `hidden` state. The `open/save/save-as/find/format/help` handlers reuse the existing toolbar buttons so the real dialogs/flows run unchanged.)

- [ ] **Step 7: Run the e2e + full gate**

Run: `npx playwright test test/e2e/app-menu.spec.ts` → both tests PASS.
Run: `pnpm typecheck` → 0. Run: `pnpm lint` → clean.
Run: `pnpm test` → full unit suite green (no regressions).

- [ ] **Step 8: Commit**

```bash
git add src/main.ts test/e2e/app-menu.spec.ts
git commit -m "feat: wire native menu actions to app commands"
```

---

## Task 5: Dependency-graph refresh + release v1.4.0

**Files:**
- Modify: `test/tools/ipc.test.ts`, `test/tools/index.test.ts` (13 wired channels)
- Modify: `docs/architecture/*` (regenerated)
- Modify: `package.json`, `CHANGELOG.md`

- [ ] **Step 1: Update the IPC boundary tool tests**

The wired-channel set grows by one (`menu:setRecent`). `menu:action` is a push (not counted). In `test/tools/ipc.test.ts`, change the `analyzeIpcFromRoot` test title `all 12` → `all 13` and add `'menu:setRecent'` to the expected sorted array. In `test/tools/index.test.ts`, change the title `all 12` → `all 13` and `toHaveLength(12)` → `toHaveLength(13)`.

- [ ] **Step 2: Regenerate the graph and verify**

Run: `pnpm graph` → exit 0, IPC ✅ 13, 0 cycles.
Run: `pnpm test` → all green (incl. the updated tool tests).
Run: `pnpm typecheck` → 0. Run: `pnpm lint` → clean.

- [ ] **Step 3: Bump version + changelog**

Set `package.json` `"version": "1.4.0"`. Add to `CHANGELOG.md` under a new `## [1.4.0] - 2026-07-04`:
```markdown
### Added

- Native application menu (File / Edit / View / Help, plus the macOS app menu)
  replacing the default Electron menu. Menu items mirror the toolbar actions —
  new/open/save/save as, export, find, format, undo/redo, layout engine, editor
  zoom, Open Recent, help, and About/View Source. Existing keyboard shortcuts are
  unchanged: duplicated accelerators are shown as labels only, so nothing
  double-fires.
```

- [ ] **Step 4: Commit**

```bash
git add test/tools/ipc.test.ts test/tools/index.test.ts docs/architecture package.json CHANGELOG.md
git commit -m "chore: refresh dependency graph and release v1.4.0"
```

- [ ] **Step 5: Finish the branch**

Use superpowers:finishing-a-development-branch. Then push, open a PR against `master`, wait for CI green, squash-merge, sync local master (`git fetch` + `git reset --hard origin/master`), tag `v1.4.0`, build the installer (`pnpm build && pnpm package`), and publish a GitHub release titled `GraphvizJS v1.4.0 — Native application menu` with `release/GraphvizJS Setup 1.4.0.exe` attached (mirror the v1.3.0 release flow).

---

## Self-Review

**Spec coverage:**
- Pure `buildMenuTemplate` (mac/dev conditionals, recent submenu, label-only accelerators, action ids) → Task 1. ✓
- `menu:action` push + `menu:setRecent` request channels → Task 3. ✓
- Renderer dispatcher → Task 2. ✓
- `setupAppMenu` + native menu install → Task 3. ✓
- main.ts integration (handlers incl. undo/redo/zoom/engine/recent, sync) → Task 4. ✓
- Menu structure (File/Edit/View/Help + mac app menu) → Task 1. ✓
- Dep-graph 13-channel update + release → Task 5. ✓
- No-double-fire (registerAccelerator:false) → Task 1 test asserts it; Task 4 preserves shortcuts.ts. ✓

**Type consistency:** `MenuActionId` (Task 1) is consumed by dispatcher (Task 2) and app-menu (Task 3); `MenuCommandHandlers` (Task 2) is built in Task 4; `EditorZoomController` (`{zoomIn,zoomOut,reset,getLevel}`) matches `src/editor/zoom.ts`; `setMenuRecent` (Task 3) called in Task 4.

**Ordering caveat (flagged for the controller):** Task 2's `setupMenuCommands` imports `onMenuAction` (added in Task 3). The Execution note in Task 2 tells the controller to land Task 3's contract/preload/platform additions together with (or before) Task 2 so typecheck stays green between tasks. The unit tests for Task 2 do not exercise `setupMenuCommands`, so the pure `dispatchMenuAction` is independently testable regardless.

**Placeholder scan:** none — every code step carries complete code or an exact edit description.
