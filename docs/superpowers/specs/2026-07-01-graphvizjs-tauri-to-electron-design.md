# GraphvizJS — Tauri → Electron migration (design spec)

**Date:** 2026-07-01
**Status:** Approved design, pending implementation plan
**Scope:** Sub-project 1 of a larger program (see "Program context")

## Program context

The user's goal is "convert GraphvizJS to TypeScript and remove the Tauri dependency,"
which on investigation decomposed into:

1. **The frontend is already 100% TypeScript** (65 `.ts` files, zero `.js`; built with
   `tsc && vite build`). There is nothing to convert. The only non-TS code is the Rust
   `src-tauri/` backend, which this migration deletes.
2. The real work is **removing Tauri**, and the chosen target is to **keep GraphvizJS a
   packaged desktop app by swapping the Tauri shell for Electron** (not a pure web app).

The broader intent is to eventually "rethink everything" (editor, rendering/export,
documents/persistence, app shell/UX). That is explicitly **out of scope here** and will be
handled as separate brainstorm → spec → plan → implement cycles **after** this migration
lands. Sequencing decision: **parity swap first, redesign after** — the Electron shell,
platform abstraction, file I/O, and packaging are reused by every later cycle, and
redesigning features while swapping the runtime underneath is the tangle we explicitly avoid.

## Goal

Replace the Tauri runtime with Electron while preserving **exact feature parity**. When
done, GraphvizJS behaves identically to today but runs on Electron, with **no Tauri or Rust
code remaining**, and the `glib`/`rand` Dependabot alerts (which originate in the Tauri/Rust
stack) are gone.

### Non-goals

- No feature changes, additions, or UX redesign (deferred to later cycles).
- No pure-web-app / browser target (Electron was chosen deliberately).
- No editor/rendering/export logic changes — the CodeMirror + `@hpcc-js/wasm` core is
  already browser-native and is not touched except for import paths.

## Success criteria

- App launches via Electron in dev (`vite` dev server) and prod (built `dist/`).
- All current features work: open/save/export `.dot`/`.gv` (SVG + PNG @1x/@2x), autosave +
  crash recovery (single- and multi-tab), editor/preview zoom, tabs, help/about dialog with
  external "View Source" link, window-bounds persistence, all keyboard shortcuts.
- `src-tauri/` and every `@tauri-apps/*` dependency are removed; `grep -r "@tauri-apps" src`
  returns nothing.
- Unit tests (vitest) green; e2e tests (Playwright, Electron runner) green.
- `pnpm build` produces a runnable packaged app (Windows primary).

## Current-state analysis (the Tauri surface)

Exactly **8 files** import `@tauri-apps/*`. The capabilities used:

| Capability | Tauri API | Files |
| --- | --- | --- |
| Open file (dialog + read) | `plugin-dialog.open`, `plugin-fs.readTextFile` | `toolbar/open-diagram.ts` |
| Save/export (dialog + write) | `plugin-dialog.save`, `plugin-fs.writeTextFile`, `writeFile` | `toolbar/save-diagram.ts`, `toolbar/export-diagram.ts` |
| Key-value store | `plugin-store` (`load/get/set/delete/save`) | `window/state.ts`, `autosave/manager.ts`, `autosave/recovery.ts` |
| Window bounds | `api/window.getCurrentWindow` (`outerSize/outerPosition/isMaximized/onResized/onMoved/onCloseRequested`) | `window/state.ts`, `main.ts` |
| Confirm dialog | `plugin-dialog.confirm` | `autosave/recovery.ts`, `main.ts` |
| App metadata | `api/app.getName/getVersion` | `help/dialog.ts` |
| Open external URL | `plugin-shell.open` | `help/dialog.ts` |

The core app (editor, preview/render via WASM, tabs, autosave *logic*, examples) is pure
browser code and is unaffected. Tests already abstract Tauri via `test/mocks/tauri.ts`
(mocks dialog/fs/store/window) — so a single-module abstraction is a natural fit.

## Architecture

Secure Electron standard: `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`. The renderer never touches Node — it only sees a minimal, typed
`window.graphviz` API injected by the preload script.

```
main process (electron/main.ts)
  app lifecycle; BrowserWindow (create, restore+persist bounds via electron-store);
  ipcMain.handle(...) for: dialog:open, dialog:save, fs:readText, fs:writeText,
  fs:writeBinary, dialog:confirm, shell:openExternal, app:info, store:get/set/delete
        │  contextBridge (electron/preload.ts) → window.graphviz = { ... }
renderer (existing TS app, unchanged core)
  src/platform/index.ts calls window.graphviz.*; the 8 files import from src/platform
```

**Window-bounds persistence moves to main** (it owns the `BrowserWindow` and its
resize/move/close events). The renderer's `src/window/state.ts` Tauri logic is removed; its
only remaining renderer concern — editor zoom get/set — moves onto `platform.store`.

## Platform interface (`src/platform/index.ts`)

```ts
export interface DiagramFilter { name: string; extensions: string[] }
export interface OpenedFile { path: string; content: string }

// file I/O — native dialogs + node fs in main, via IPC
export function openTextFile(filters: DiagramFilter[]): Promise<OpenedFile | null>
export function pickSavePath(opts: { defaultPath: string; filters: DiagramFilter[] }): Promise<string | null>
export function writeTextFile(path: string, content: string): Promise<void>
export function writeBinaryFile(path: string, bytes: Uint8Array): Promise<void>

// persistent key-value store — electron-store in main, via IPC
export const store: {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
}

// dialogs / shell / app metadata
export function confirm(message: string, opts?: { title?: string; kind?: 'info' | 'warning' | 'error' }): Promise<boolean>
export function openExternal(url: string): Promise<void>
export function appInfo(): Promise<{ name: string; version: string }>
```

Notes:
- Tauri's explicit `store.save()` is dropped — electron-store persists on each write. The 4
  `.save()` call sites are removed.
- `openExternal` in main uses `shell.openExternal`; validate the URL is `http(s):` before
  opening (avoid arbitrary-scheme execution).
- `appInfo` returns `app.getName()`/`app.getVersion()` from main (version sourced from
  `package.json`).

## Persistence: electron-store (chosen)

One typed JSON store in the OS `userData` dir (parity with Tauri's `settings.store`).
Window bounds (main-owned) and renderer data (autosave drafts, editor zoom) share it via
IPC. Keys preserved from the current code: `windowState`, `editorZoom`, plus the autosave
keys in `src/autosave/constants.ts` (`draft:*`, `tabDrafts`). Migration of existing user
data from the old Tauri store is **not** required (fresh install semantics acceptable; note
in CHANGELOG).

## Change plan (file by file)

**New files**
- `electron/main.ts` — app lifecycle; create `BrowserWindow` (restore bounds from store, or
  center at default size); persist bounds on resize/move/close (debounced); register all
  `ipcMain.handle` handlers; load `dist/index.html` (prod) or `VITE_DEV_SERVER_URL` (dev).
- `electron/preload.ts` — `contextBridge.exposeInMainWorld('graphviz', { ... })` mapping each
  method to `ipcRenderer.invoke(channel, ...)`.
- `src/platform/index.ts` — the interface above, delegating to `window.graphviz`.
- `src/platform/graphviz-api.d.ts` — ambient type for `window.graphviz` (renderer-side).
- `electron-builder.yml` (or `build` key) — packaging config.

**Edited (import/call swaps; feature logic unchanged)**
- `toolbar/open-diagram.ts` → `platform.openTextFile`.
- `toolbar/save-diagram.ts` → `platform.pickSavePath` + `platform.writeTextFile`.
- `toolbar/export-diagram.ts` → `platform.pickSavePath` + `writeTextFile`/`writeBinaryFile`.
- `autosave/manager.ts` → replace `Store` type with the `platform.store` interface; drop `.save()`.
- `autosave/recovery.ts` → `platform.store` + `platform.confirm`.
- `help/dialog.ts` → `platform.appInfo` + `platform.openExternal`.
- `main.ts` → remove `getCurrentWindow`; window persistence handled in main; `confirm` →
  `platform.confirm`; store loaded via `platform.store`.
- `window/state.ts` → remove Tauri window/store logic; keep only `loadEditorZoom`/
  `saveEditorZoom` backed by `platform.store` (or fold into `src/platform`/editor zoom module).

**Deleted**
- `src-tauri/` (entire dir: Rust src, `build.rs`, `Cargo.*`, `capabilities/`, `gen/`, `target/`).
- Dependencies: `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`,
  `@tauri-apps/plugin-shell`, `@tauri-apps/plugin-store`, `@tauri-apps/cli`.
- The `tauri` npm script.

**Build/scripts (package.json)**
- Add deps: `electron`, `electron-builder`; dev: `concurrently`, `wait-on`.
- `dev`: run vite dev server + launch electron pointing at it (via `concurrently`/`wait-on`).
- `build`: `tsc && vite build && electron-builder` (or split `build` vs `package`).
- Keep `lint`, `typecheck`, `test`, `test:e2e`. Vite `base` set to `./` so `dist/index.html`
  loads from `file://` in packaged app.

## Testing strategy

- **Unit (vitest):** rename `test/mocks/tauri.ts` → `test/mocks/platform.ts`, mocking the
  single `src/platform` module (`vi.mock('../../src/platform', …)`). Update imports in
  `test/autosave/*.test.ts` and `test/help/dialog.test.ts`. All pure-logic tests remain green
  — the abstraction is what makes this cheap.
- **E2E (Playwright):** switch to Playwright's Electron runner
  (`const app = await electron.launch({ args: ['.'] })`, then `app.firstWindow()`); update
  `test/e2e/helpers.ts` and the 6 specs. File-dialog specs must stub the native dialog (mock
  the main-process `dialog` handler in test mode, e.g. via an env-flag path that returns a
  fixed file), since native dialogs can't be driven by Playwright. **This is the highest-risk
  part of the migration** and gets implemented incrementally with each spec verified.
- **CI:** update the workflow to drop the Rust toolchain and build/test the Electron app.

## Packaging

`electron-builder`, targets:
- **Windows (nsis)** — primary (user's platform).
- macOS (dmg) + Linux (AppImage) — configured but gated behind a CI matrix.

**Open question for spec review:** confirm which OSes to actually ship. Default assumption:
Windows now, mac/linux wired but optional.

## Risks & mitigations

- **E2E native-dialog automation** — biggest risk. Mitigation: a test-mode IPC path that
  returns deterministic file paths instead of opening a native dialog; verify each e2e spec
  individually.
- **Packaged `file://` asset loading** — WASM (`@hpcc-js/wasm`) and fonts must load under
  `file://`. Mitigation: set vite `base: './'`; verify a packaged build opens and renders a
  diagram before declaring done.
- **Window-state edge cases** (multi-monitor, off-screen restore) — clamp restored bounds to
  a visible display in main.
- **Content Security Policy** — set a strict CSP for the renderer; ensure WASM (`'wasm-unsafe-eval'`)
  is permitted.

## Out of scope (future cycles)

Editor & authoring redesign, rendering & export redesign, documents & persistence redesign,
app shell & UX redesign — each its own brainstorm → spec → plan → implement cycle, built on
the Electron base delivered here.
