# GraphvizJS Cycle 3 — Documents & Persistence — Design

**Date:** 2026-07-03
**Ships as:** v1.3.0
**Status:** Approved for planning

## Goal

Make GraphvizJS remember and manage documents like a real editor: a recent-files
list, explicit Save As, silent restore of the open-tab session across launches,
a per-document layout engine, and live reload when an open file changes on disk.

## Context — what exists today

Established by architecture recon (2026-07-03):

- **Single persistence mechanism.** One `electron-store` instance in
  `electron/main.ts`; all renderer access flows through three IPC channels
  `store:get` / `store:set` / `store:delete`, wrapped by `src/platform/index.ts`.
  Keys in use today: `windowState`, `editorZoom`, legacy `draftContent`/
  `draftTimestamp`/`draftFilePath`, and current `tabDrafts`.
- **Module convention.** Each feature is a `setup*({ DOM refs, callbacks })`
  function under `src/<area>/`, wired together in `src/main.ts::bootstrap()`.
  There is no event bus — wiring is explicit callbacks.
- **IPC is request/response only.** Every channel is `ipcMain.handle` /
  `ipcRenderer.invoke`. There is **no** main→renderer push channel today.
- **Tabs** (`src/tabs/manager.ts`): `TabManager` is a pure state container over
  `Map<string, TabState>`. `TabState = { id, filePath, isDirty,
  lastCommittedDoc, lastSavedAt, editorView, editorZoomLevel }`. `MAX_TABS = 10`.
  No `layoutEngine` field. No tab persistence across launches except the
  one-shot crash-recovery prompt.
- **Autosave** (`src/autosave/`): 30s interval writes `tabDrafts`
  (`{ tabs: {content, filePath}[], timestamp }`) to the store, skipping
  unchanged writes. On launch, `recovery.ts` shows a native confirm
  ("recover N tabs?"), and clears the draft after one use regardless of choice.
- **File I/O:** `openTextFile(filters)` (shows dialog → `{path, content}`),
  `pickSavePath({defaultPath, filters})`, `writeTextFile(path, content)`,
  `writeBinaryFile`. Save (`save-diagram.ts`) reuses the current `filePath` and
  only prompts when it is null. There is **no** Save As, **no** recent-files
  list, **no** arbitrary-path read (open always goes through a dialog).
- **Layout engine** (`src/toolbar/layout-engine.ts`): a global
  `<select id="layout-engine">`; `getCurrentEngine()` reads the DOM value
  (default `dot`). Shared across all tabs; resets to `dot` each launch; not
  persisted. Preview render path: `createPreview(..., { getEngine })` →
  `renderDotToSvg(dot, engine)`.
- **No file watching** of any kind; files are read once on open and written on
  save, never observed afterward.

## Design decisions (locked)

1. **Scope:** all five features, built sequentially.
2. **Session restore:** silent auto-restore (no launch prompt); unsaved-work
   protection folds into the session, so the separate crash-recovery dialog is
   retired.
3. **External change:** clean tab auto-reloads; dirty tab shows a conflict
   prompt (reload-and-lose vs keep-mine). Never clobbers unsaved edits.
4. **Recent files:** in-app toolbar dropdown only. Windows jump-list
   integration (`app.addRecentDocument` + single-instance lock) is explicitly
   out of scope for this cycle.

## New IPC surface

Two additions to `src/platform/contract.ts` (+ preload + main handlers):

```ts
// Request/response — read a known path without a dialog.
readTextFile(path: string): Promise<string | null>;   // null on any read error

// Request/response — tell main which open files to watch.
setWatchedPaths(paths: string[]): Promise<void>;

// Push — main → renderer. Returns an unsubscribe function.
onFileChanged(cb: (path: string) => void): () => void;
```

- `readTextFile` → main channel `fs:readText`: `readFile(path, 'utf-8')`,
  returns `null` on error (missing/permission). Used by recent-files-open and
  external-change reload.
- `setWatchedPaths` → main channel `watch:setPaths`: main reconciles its set of
  directory watchers against the given paths (see Feature 5).
- `onFileChanged` → preload subscribes `ipcRenderer.on('file:changed', …)` and
  returns a disposer that removes the listener. Main emits via
  `webContents.send('file:changed', path)`.

This is the cycle's only architectural addition (the push direction). All other
features reuse the existing `store:*` and `dialog:*` channels.

## Feature 1 — Recent files

- **Store key** `recentFiles: string[]`, most-recent-first, deduped
  (case-sensitive path match), capped at **10**.
- **Pure core** `src/recent/recent-files.ts`:
  - `addRecent(list: string[], path: string, cap = 10): string[]` — moves/adds
    `path` to front, dedupes, truncates to `cap`. Pure, no I/O.
  - `removeRecent(list: string[], path: string): string[]` — for pruning a
    file that no longer opens.
  - `loadRecent(store): Promise<string[]>` / `saveRecent(store, list)` — store
    I/O wrappers.
- **Update points:** `main.ts` `onOpen(content, path)` and `onSave(doc, path)`
  callbacks call `addRecent` + `saveRecent`.
- **UI** `src/toolbar/recent-menu.ts::setupRecentMenu({ button, getRecent,
  onPick })`: a dropdown mirroring `examples-menu.ts`. Each entry shows the
  basename with the full path as `title` tooltip. Empty list → a single
  disabled "No recent files" item. Click → `onPick(path)`.
- **Open-from-recent** (in `main.ts`): if `path` matches an already-open tab,
  focus it; else `readTextFile(path)` → if `null`, show a notice
  ("File no longer available") and `removeRecent` it; else open in a new tab
  (respecting `MAX_TABS`) and record it via the normal open path.
- **Toolbar:** new button (icon `ri-history-line`) + `<ul>` dropdown in
  `index.html`, themed like the existing examples menu.

## Feature 2 — Save As

- **`src/toolbar/save-as.ts::setupSaveAsAction({ getEditor, button, getPath,
  onPathChange, onSave })`:** unconditionally calls `pickSavePath({ defaultPath,
  filters })` (default path derived from the current path's basename or
  `diagram.dot`), writes via `writeTextFile`, then `onPathChange(path)` and
  `onSave(doc, path)` (which routes to `commitDocument({ saved: true })`).
  Cancelling the dialog is a no-op.
- **Toolbar:** new button (icon `ri-save-3-line` variant) + keymap
  `Ctrl+Shift+S` added to the editor extensions in `createTabEditor`.
- Reuses the existing `dialog:save` IPC unchanged. The current Save button and
  its "prompt only when path is null" behavior are untouched.

## Feature 3 — Silent session restore

- **Store key** `session`:
  ```ts
  interface SessionTab { filePath: string | null; content: string;
                         savedContent: string; engine: LayoutEngine; }
  interface SessionData { tabs: SessionTab[]; activeIndex: number; }
  ```
  Full `content` is persisted per tab, so unsaved edits survive a restart — this
  is what allows the crash-recovery dialog to be removed. `savedContent` is the
  tab's `lastCommittedDoc` baseline; dirtiness is **derived** on restore as
  `content !== savedContent` (no separate flag to keep in sync), and it gives a
  restored dirty tab an exact baseline for revert/reload comparisons. For an
  untitled tab, `savedContent` is the initial content baseline.
- **Pure core** `src/session/session.ts`:
  - `captureSession(tabs: TabState[], activeTabId: string | null): SessionData`
    — maps tabs → `SessionTab[]` (reading each tab's current editor content,
    `lastCommittedDoc` as `savedContent`, and `layoutEngine`) and computes
    `activeIndex`.
  - `serializeSession(data)` / `deserializeSession(raw): SessionData | null` —
    validate shape on read; return `null` if malformed.
  - `migrateLegacyDrafts(raw: unknown): SessionData | null` — convert a stored
    `tabDrafts` value into a `SessionData` (engine defaults to `dot`,
    `savedContent` equal to `content` so migrated tabs restore clean,
    `activeIndex` 0). Pure.
  - `loadSession(store): Promise<SessionData | null>` — read `session`; if
    absent, fall back to migrating `tabDrafts`; `null` if neither.
  - `persistSession(store, data): Promise<void>`.
- **Persistence cadence:** on the existing 30s autosave interval **and**
  debounced on tab lifecycle events (create / close / switch / path-change) and
  content commit. This keeps `session` fresh at quit without main-side
  `before-quit` coordination.
- **Restore at boot** (`main.ts`, before the default-snippet path): if
  `loadSession` returns tabs, hydrate them (first tab into the initial tab,
  rest via `createNewTab`), set the active tab from `activeIndex`, sync each
  tab's `layoutEngine`, and set each tab's `lastCommittedDoc = savedContent`
  so dirtiness (`content !== savedContent`) restores exactly.
- **CONSTRAINT — first-launch parity:** with no `session` and no `tabDrafts`
  (fresh profile, including every Playwright run), boot behavior must be
  byte-identical to today: one tab, `DEFAULT_SNIPPET`, engine `dot`. This keeps
  the existing e2e suite green.
- **Retire crash recovery:** remove `src/autosave/recovery.ts` usage and the
  main.ts recovery prompt (324-359). `tabDrafts` remains only as a one-time
  migration source, then is superseded by `session`. Clearing on save now
  clears `session` state via the debounced capture, not the old draft keys.

## Feature 4 — Per-document layout engine

- Add `layoutEngine: LayoutEngine` to `TabState` (default `dot`); accept it in
  `CreateTabOptions` and `createTabEditor`/`createNewTab`.
- **Engine-select change** (`main.ts`): write the value to the *active tab's*
  `layoutEngine`, then re-render the active tab.
- **Tab switch** (`switchToTab`): set `<select id="layout-engine">.value` from
  the newly-active tab's `layoutEngine`.
- **Preview:** the `getEngine` passed to `createPreview` returns
  `getActiveTab()?.layoutEngine ?? 'dot'` instead of reading the DOM.
- Persisted as part of each `SessionTab` (Feature 3).

## Feature 5 — External-change reload

- **Main** `electron/file-watcher.ts`:
  - Maintains a map of watched **parent directories** → the set of open
    basenames in each (watching the directory, not the file directly, survives
    editors that atomic-save via rename — which kills a direct `fs.watch(file)`).
  - `setWatchedPaths(paths)` reconciles: open new directory watchers, close
    directories with no remaining open files, update basename sets.
  - On a `fs.watch` event whose filename is in the watched set: debounce
    ~200ms, then `webContents.send('file:changed', fullPath)`.
  - **Pure, unit-tested core** `diffWatchSets(current, next)`: given the current
    and desired path sets, returns `{ dirsToWatch, dirsToUnwatch, byDir }`.
- **Renderer** `src/watch/file-watch.ts::setupFileWatch({ getOpenPaths,
  onExternalChange })`:
  - Subscribes via `onFileChanged`; keeps main in sync by calling
    `setWatchedPaths(getOpenPaths())` whenever the set of open file paths
    changes (tab create/close/open/save/path-change).
  - On a change notice for `path`, invokes `onExternalChange(path)`.
- **Reload policy** (in `main.ts`'s `onExternalChange`): find the tab(s) with
  that `filePath`; `readTextFile(path)`:
  - read `null` (file deleted) → notice, leave the tab as-is (still editable).
  - tab **clean** (`!isDirty`) and content differs → replace editor content,
    reset `lastCommittedDoc`, re-render. No prompt.
  - tab **dirty** and content differs → confirm prompt "‹file› changed on disk.
    Reload and discard your edits?" — OK reloads (as clean case); Cancel keeps
    the user's edits and leaves the tab dirty.

## Module / file structure

New files:
- `src/recent/recent-files.ts` (pure + store I/O)
- `src/toolbar/recent-menu.ts` (dropdown UI)
- `src/toolbar/save-as.ts` (Save As action)
- `src/session/session.ts` (pure session model + store I/O)
- `src/watch/file-watch.ts` (renderer watch wiring + policy hook)
- `electron/file-watcher.ts` (main-process directory watcher)

Modified:
- `src/platform/contract.ts`, `electron/preload.ts`, `electron/main.ts`
  (new IPC: `fs:readText`, `watch:setPaths`, `file:changed` push)
- `src/platform/index.ts` (`readTextFile`, `setWatchedPaths`, `onFileChanged`)
- `src/tabs/manager.ts` (`layoutEngine` on `TabState`/`CreateTabOptions`)
- `src/main.ts` (boot restore, per-doc engine, recent/save-as/watch wiring;
  remove recovery prompt)
- `src/index.html`, `src/toolbar/actions.ts`, `src/styles.css` (buttons/menus)
- Remove reliance on `src/autosave/recovery.ts` (migration path only)

## Build sequence (≈8 TDD tasks)

1. Recent-files pure core (`addRecent`/`removeRecent`) + store I/O.
2. Recent-files UI + wiring + `readTextFile` IPC. (e2e)
3. Save As action + button + `Ctrl+Shift+S`. (e2e)
4. Per-doc layout engine (`TabState` field, switch sync, `getEngine`). (e2e)
5. Session pure core (capture / (de)serialize / migrate / load). (unit)
6. Silent restore + session persistence; retire `tabDrafts` recovery. (e2e relaunch)
7. External-change IPC plumbing: `watch:setPaths` + `file:changed` push +
   `diffWatchSets` core. (unit)
8. External-change reload policy + renderer wiring. (e2e, temp file on disk)

## Testing strategy

- **Unit** (Vitest, no Electron): recent-files list ops, session
  capture/serialize/migrate, `diffWatchSets`.
- **e2e** (Playwright `_electron`): reuses the `GVJS_E2E_OPEN` / `GVJS_E2E_SAVE`
  stub pattern. **New stub `GVJS_E2E_CONFIRM`** makes `dialog:confirm` resolve
  from an env value instead of the blocking native `showMessageBox` — required
  for the dirty-conflict prompt and any confirm in headless runs.
  - Recent files: open a temp file, assert it appears in the menu, reopen it.
  - Save As: assert it prompts even when the tab already has a path.
  - Per-doc engine: two tabs, different engines, assert the selector follows the
    active tab.
  - Session restore: launch with a seeded `session` store value (temp userData),
    assert tabs/active/engine restored; launch with none, assert single default
    snippet tab (parity).
  - External change: open a temp file, mutate it on disk, assert a clean tab
    reloads; with edits + `GVJS_E2E_CONFIRM=cancel`, assert edits are kept.

## Global constraints

- Ships as **v1.3.0** (bump `package.json`, add `CHANGELOG.md` `[1.3.0]`).
- Default branch is **`master`**; tag `v1.3.0`; release title
  `GraphvizJS v1.3.0 — Documents & persistence`.
- Windows-only build (electron-builder win nsis; CI on windows-latest).
- No new runtime dependency that pulls `core-js` (would trip pnpm 11's
  build-script gate). The watcher uses Node's built-in `fs.watch` — no chokidar.
- First-launch parity constraint (Feature 3) is binding: fresh profile → one
  `DEFAULT_SNIPPET` tab, engine `dot`.
- Quality gate before merge: `pnpm typecheck` 0 errors, `pnpm lint` clean,
  full unit + e2e suites green.

## Out of scope (deferred)

- Windows jump-list / `app.addRecentDocument` + single-instance-lock routing.
- Persisting the editor/preview pane ratio (`workspace/resize.ts`).
- Installer code-signing (standing follow-up, tracked separately).
