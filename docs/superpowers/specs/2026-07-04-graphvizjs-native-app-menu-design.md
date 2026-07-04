# GraphvizJS Cycle 4 — Native Application Menu — Design

**Date:** 2026-07-04
**Ships as:** v1.4.0
**Status:** Approved for planning

## Goal

Give GraphvizJS a real native application menu (File / Edit / View / Help, plus
the macOS app menu) that mirrors the existing toolbar actions and shortcuts,
replacing the default Electron menu. The menu adds discoverability and
click/keyboard access to every action without changing any existing keyboard
behavior.

## Context — what exists today

Established by architecture recon (2026-07-04):

- **No application menu.** `electron/main.ts` never imports `Menu`; the default
  Electron menu is shown. `createWindow()` uses a native frame (no custom
  titlebar). `app.whenReady()` runs `registerIpc()`, `setupFileWatcher()`,
  `createWindow()`.
- **One main→renderer push channel already exists** — `file:changed`:
  main `win.webContents.send('file:changed', path)` → preload
  `onFileChanged(cb)` (registers `ipcRenderer.on`, returns an unsubscribe) →
  `src/platform/index.ts` re-export → consumed in `src/watch/file-watch.ts`.
  This is the pattern the menu will reuse.
- **Every renderer action is already a callback** wired in `src/main.ts`'s
  `bootstrap()`. Action inventory (module → trigger):
  - new-diagram (`onNew` → `createNewTab(DEFAULT_SNIPPET)`), new-tab
    (`createNewTab`), open-diagram (`onOpen`), save-diagram
    (`commitDocument({saved:true})`), save-as-diagram (`performSaveAs`), find
    (`openSearchPanel`), format (`formatView`/`onFormat`), export
    (`createExportHandler`, formats png/pngx2/svg/pdf), examples, recent
    (`onPickRecent`), layout-engine (`setupLayoutEngine`), preview zoom
    (`setupZoomControls`), editor zoom (CodeMirror keymap + zoom controller),
    close-tab / next-tab / prev-tab, help (`setupHelpDialog`).
- **Existing keyboard handling (stays authoritative):**
  - `src/toolbar/shortcuts.ts` (window keydown, capture): `Mod+S`, `Mod+Shift+S`,
    `Mod+O`, `Mod+N`, `Mod+T`, `Mod+W`, `Mod+Tab`/`Mod+Shift+Tab`.
  - CodeMirror keymaps: editor zoom `Mod-=`/`Mod--`/`Mod-0`, format
    `Shift-Alt-f`, find `Mod-f` (`@codemirror/search`).
  - Help: `F1` / `Mod+?`.
- **electron-store keys:** `windowState`, `editorZoom`, `session`,
  `recentFiles`, legacy `tabDrafts`. The main process has its own
  `electron-store` instance (separate in-memory cache from the renderer's
  bridged store — do NOT rely on main reading the renderer's fresh
  `recentFiles` writes).
- **IPC surface** (all `ipcMain.handle`, bridged 1:1 in preload, typed in
  `contract.ts`): `dialog:openText`, `dialog:save`, `fs:readText`,
  `fs:writeText`, `fs:writeBinary`, `store:get/set/delete`, `dialog:confirm`,
  `shell:openExternal`, `app:info`, `watch:setPaths`.
- **help/dialog.ts** is the model for any renderer-side dialog (lazy
  `<dialog>` + `showModal`).

## Design decisions (locked)

1. **Scope:** the native application menu only. (Theme toggle, command palette,
   preferences dialog, app icon, installer signing are out of scope this cycle.)
2. **Accelerators (user choice):** menu items that duplicate an existing
   shortcut display the accelerator as a **label only** (`registerAccelerator:
   false`); the existing `shortcuts.ts` / CodeMirror keymaps remain the single
   source of truth — zero double-fire, no behavior change. Only genuinely-new
   items (export formats, About, View Source) may register real accelerators or
   be click-only. Clipboard / quit / full-screen / minimize / devtools / reload
   use native Electron **roles**.

## Architecture

Three new pieces, all following existing patterns:

### 1. `electron/app-menu.ts` (new, main process)

```ts
export type MenuActionId =
  | 'new' | 'new-tab' | 'open' | 'open-recent'
  | 'save' | 'save-as' | 'export' | 'close-tab'
  | 'undo' | 'redo' | 'find' | 'format'
  | 'set-engine' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'help';

export interface MenuBuildOptions {
  isMac: boolean;
  isDev: boolean;
  recentFiles: string[];
  /** Called with the action id + optional payload when a dispatching item is clicked. */
  onAction: (action: MenuActionId, payload?: string) => void;
  /** Called for main-handled items (View Source, About). */
  onOpenSource: () => void;
  onAbout: () => void;
}

/** Pure: build the Electron menu template. Unit-testable without Electron
 *  by passing spies for onAction/onOpenSource/onAbout. */
export function buildMenuTemplate(opts: MenuBuildOptions): Electron.MenuItemConstructorOptions[];

/** Build + install the application menu, and keep it in sync with recent files. */
export function setupAppMenu(): void;
```

- `buildMenuTemplate` is pure (no `Menu`/`app` calls) and returns the template;
  it wires each dispatching item's `click` to `onAction(id, payload)`. Items
  that duplicate a shortcut set `accelerator: '<Label>'` + `registerAccelerator:
  false`. Native-role items use `role`. Dev-only items (Reload, Toggle DevTools)
  are included only when `isDev`.
- `setupAppMenu()` builds the template with `onAction` = "send `menu:action` to
  all windows", reads the current `recentFiles` for the Open Recent submenu,
  calls `Menu.setApplicationMenu(Menu.buildFromTemplate(template))`, and
  rebuilds when the recent list changes (see channel 3). `onOpenSource` uses
  `shell.openExternal(<repo url>)`; `onAbout` shows a native
  `dialog.showMessageBox` with `app.getName()`/`app.getVersion()`.

### 2. Push channel `menu:action` (main → renderer)

- Main: `win.webContents.send('menu:action', { action, payload })` for all
  non-destroyed windows (same fan-out as `file:changed`).
- `contract.ts`: `onMenuAction(cb: (action: string, payload?: string) => void): () => void`.
- `preload.ts`: registers `ipcRenderer.on('menu:action', (_e, msg) => cb(msg.action, msg.payload))`, returns a disposer removing that listener.
- `src/platform/index.ts`: `onMenuAction` wrapper.

### 3. Request channel `menu:setRecent` (renderer → main)

- `contract.ts`: `setMenuRecent(paths: string[]): Promise<void>`.
- `preload.ts` + `main.ts` handler `menu:setRecent`: main stores the latest
  recent list and rebuilds the application menu (so Open Recent is fresh).
- Renderer calls `setMenuRecent(recentFiles)` at the same points it updates the
  recent list (`recordRecent`, prune-on-missing) and once at startup, so the
  menu's Open Recent submenu always matches the toolbar Recent menu. This
  avoids relying on cross-instance `electron-store` cache coherence.

### 4. Renderer command dispatcher (`src/menu/commands.ts`)

```ts
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

/** Map an incoming (action, payload) to the matching handler. Unknown actions
 *  are ignored. Pure routing — unit-testable with spy handlers. */
export function dispatchMenuAction(
  handlers: MenuCommandHandlers,
  action: string,
  payload?: string
): void;

/** Subscribe the dispatcher to menu:action; returns the unsubscribe. */
export function setupMenuCommands(handlers: MenuCommandHandlers): () => void;
```

- In `bootstrap()`, build a `MenuCommandHandlers` object from the functions
  that already exist there (`createNewTab`, the open/save/save-as/format/find
  paths, `performSaveAs` via the existing save-as wiring, the export handler,
  `onPickRecent`, `setupLayoutEngine`'s engine setter, the help opener), plus:
  - `undo`/`redo` → run CodeMirror `undo(view)` / `redo(view)` (from
    `@codemirror/commands`) on the active tab's `editorView`.
  - `setEngine(engine)` → set the active tab's `layoutEngine`, sync the
    `#layout-engine` select, re-render (reuse the existing engine-change path).
  - `zoomIn/zoomOut/zoomReset` → the active tab's **editor** zoom controller
    (matches the `Ctrl+=`/`Ctrl+-`/`Ctrl+0` labels). Expose the active editor
    zoom controller via a small accessor updated on tab create/switch. (If the
    zoom controller API makes this awkward, the plan resolves the exact call by
    reading `src/editor/zoom.ts`.)
  - `open` → trigger the existing open flow (click the open button or call the
    same handler `setupOpenDiagramAction` uses).
- Wire `setupMenuCommands(handlers)` in `bootstrap()`, and call
  `setMenuRecent(recentFiles)` at startup + on recent changes.

## Menu structure

- **App menu (macOS only):** About GraphvizJS · separator · Services (role) ·
  Hide/Hide Others/Unhide (roles) · separator · Quit (role).
- **File:** New `Ctrl+N` · New Tab `Ctrl+T` · Open… `Ctrl+O` · Open Recent ▸
  (dynamic; empty → a disabled "No Recent Files") · ─ · Save `Ctrl+S` ·
  Save As… `Ctrl+Shift+S` · ─ · Export ▸ (PNG / PNG ×2 / SVG / PDF…) · ─ ·
  Close Tab `Ctrl+W` · Quit (role, non-mac).
- **Edit:** Undo `Ctrl+Z` · Redo `Ctrl+Y` (both dispatch to CodeMirror) · ─ ·
  Cut / Copy / Paste / Select All (roles) · ─ · Find `Ctrl+F` · Format Document
  `Shift+Alt+F`.
- **View:** Layout Engine ▸ (dot/neato/fdp/sfdp/circo/twopi/osage/patchwork;
  each dispatches `set-engine`) · ─ · Zoom In `Ctrl+=` / Zoom Out `Ctrl+-` /
  Reset Zoom `Ctrl+0` (editor zoom) · ─ · Toggle Full Screen (role) · Reload +
  Toggle DevTools (**dev builds only**, roles).
- **Help:** Keyboard Shortcuts `F1` (dispatch `help` → existing help dialog) ·
  ─ · View Source on GitHub (main → `shell.openExternal`) · About GraphvizJS
  (main → native message box, non-mac; on mac About lives in the app menu).

Accelerator handling per item: every accelerator shown for an action already
bound by `shortcuts.ts`/CodeMirror is `registerAccelerator: false`. Export
formats and About/View Source are click-only (or may take a real, currently-
unbound accelerator). Roles keep their native accelerators.

## Module / file structure

New files:
- `electron/app-menu.ts` (pure `buildMenuTemplate` + `setupAppMenu`)
- `src/menu/commands.ts` (renderer dispatcher)

Modified:
- `electron/main.ts` — call `setupAppMenu()` in `whenReady`; add `menu:setRecent`
  handler; `menu:action` fan-out lives in `app-menu.ts`'s `onAction`.
- `electron/preload.ts` — `onMenuAction`, `setMenuRecent`.
- `src/platform/contract.ts` — `onMenuAction`, `setMenuRecent`.
- `src/platform/index.ts` — wrappers.
- `src/main.ts` — build `MenuCommandHandlers`, `setupMenuCommands`, call
  `setMenuRecent` at startup + on recent changes; expose active editor zoom
  accessor.

## Testing strategy

- **Unit** (Vitest, no Electron):
  - `buildMenuTemplate`: top-level menus present; macOS app menu present only
    when `isMac`; Reload/DevTools present only when `isDev`; Open Recent lists
    the given paths (basenames) and shows the disabled empty item when none;
    clicking a dispatching item calls `onAction` with the right id + payload
    (e.g. Export→PDF gives `('export','pdf')`, a recent item gives
    `('open-recent', <path>)`, an engine item gives `('set-engine','neato')`);
    label-only items carry `registerAccelerator: false`; role items carry the
    expected `role`.
  - `dispatchMenuAction`: routes each action id to the matching handler with
    payload; ignores unknown actions; does not throw on missing payload.
- **e2e** (Playwright `_electron`):
  - `Menu.getApplicationMenu()` is non-null (via `app.evaluate`) and contains a
    `File` menu (default Electron menu replaced).
  - Drive the `menu:action` round-trip: trigger File→New Tab through the menu
    (via `app.evaluate` clicking the menu item) and assert the renderer reacts
    (tab count increments) — exercises push channel + dispatcher end-to-end.

## Global constraints

- Ships as **v1.4.0** (bump `package.json`, add `CHANGELOG.md` `[1.4.0]`).
- Default branch **`master`**; tag `v1.4.0`; release title
  `GraphvizJS v1.4.0 — Native application menu`.
- Windows-only build (electron-builder win nsis; CI on windows-latest). The menu
  template is cross-platform (mac branch behind `isMac`) but only the Windows/
  Linux menu is exercised by CI.
- **No behavior change to existing keyboard shortcuts** (binding): every
  duplicate accelerator is `registerAccelerator: false`; `shortcuts.ts` and the
  CodeMirror keymaps are untouched. Verify no double-fire.
- No new runtime dependency (`@codemirror/commands` is already a dependency for
  `undo`/`redo`; `Menu`/`dialog`/`shell` are Electron built-ins).
- Quality gate before merge: `pnpm typecheck` 0, `pnpm lint` clean, full unit +
  e2e green, `pnpm graph` clean (the new `menu:action` push + `menu:setRecent`
  handle channel must not regress the IPC boundary check — update the tool
  tests' expected wired-channel set to include `menu:setRecent`).

## Out of scope (deferred)

- Theme toggle, command palette, preferences dialog (a future App-shell cycle).
- App icon (`win.icon` + a 256×256 `.ico`).
- Installer code-signing (needs a trusted OV/EV certificate you provide;
  standing follow-up).
