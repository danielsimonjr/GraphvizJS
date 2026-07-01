# GraphvizJS Tauri → Electron Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Tauri desktop shell with Electron while preserving exact feature parity, removing all Tauri/Rust code.

**Architecture:** A thin `src/platform` module in the renderer delegates to a `window.graphviz` API injected by an Electron `preload` (contextBridge) that forwards to `ipcMain` handlers in the main process. Main owns the `BrowserWindow`, native dialogs, node `fs`, `shell.openExternal`, and an `electron-store` key-value store (window bounds + renderer data). `vite-plugin-electron` builds/bundles main + preload and drives dev.

**Tech Stack:** TypeScript, Vite 7, Electron, vite-plugin-electron, electron-store, electron-builder, Vitest (happy-dom), Playwright (Electron runner), CodeMirror 6, `@hpcc-js/wasm`.

## Global Constraints

- Feature parity only — no feature changes, additions, or UX redesign (deferred to later cycles).
- Secure Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer must never import `electron` or node built-ins directly — only `window.graphviz`.
- `grep -r "@tauri-apps" src electron` must return nothing at completion.
- Package manager is **pnpm**. Node ≥ 20.19 (Vite 7 / Electron requirement).
- The shared IPC contract type lives at `src/platform/contract.ts` and is the single source of truth for both preload and renderer.
- Preserve existing store keys: `windowState`, `editorZoom`, and the autosave keys in `src/autosave/constants.ts`.
- Packaging: Windows (nsis) primary; mac (dmg) / Linux (AppImage) configured but optional.
- Commit after every task. Do not push to `master` (work on `feat/electron-migration`).

---

## File Structure

**New:**
- `src/platform/contract.ts` — shared IPC types (`GraphvizApi`, `DiagramFilter`, `OpenedFile`, `ConfirmOptions`). Pure types, no runtime.
- `src/platform/index.ts` — renderer-facing functions delegating to `window.graphviz`.
- `src/platform/global.d.ts` — ambient `Window.graphviz` declaration.
- `electron/main.ts` — app lifecycle, `BrowserWindow`, window-bounds persistence, all `ipcMain.handle` handlers, `electron-store` instance.
- `electron/preload.ts` — `contextBridge.exposeInMainWorld('graphviz', …)` → `ipcRenderer.invoke`.
- `electron-builder.yml` — packaging config.
- `test/mocks/platform.ts` — vitest mock of `src/platform` (replaces `test/mocks/tauri.ts`).

**Modified:** `vite.config.ts`, `package.json`, `tsconfig.json`/`tsconfig.node.json`, the 8 Tauri-using renderer files, unit tests that import the Tauri mocks, all `test/e2e/*`.

**Deleted:** `src-tauri/`, `test/mocks/tauri.ts`, all `@tauri-apps/*` deps + `@tauri-apps/cli`, the `tauri` script.

---

### Task 1: Electron scaffold + IPC contract types

**Files:**
- Create: `src/platform/contract.ts`, `src/platform/global.d.ts`, `electron/main.ts` (minimal), `electron/preload.ts` (minimal)
- Modify: `package.json` (deps + scripts), `vite.config.ts`, `tsconfig.json`
- Test: `pnpm typecheck` + manual `pnpm dev` launch

**Interfaces:**
- Produces: `GraphvizApi` (and `DiagramFilter`, `OpenedFile`, `ConfirmOptions`) consumed by every later task; `window.graphviz: GraphvizApi`.

- [ ] **Step 1: Add deps and scripts**

```bash
pnpm add electron electron-store
pnpm add -D vite-plugin-electron electron-builder
```
In `package.json`, set `"main": "dist-electron/main.js"` and replace the `dev`/`build`/`tauri` scripts:
```jsonc
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "package": "electron-builder",
  "typecheck": "tsc --noEmit",
  "lint": "biome check .",
  "lint:fix": "biome check --write .",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test"
}
```
(`vite-plugin-electron` launches Electron during `vite`/`vite build`; no separate tauri script.)

- [ ] **Step 2: Write the contract types**

`src/platform/contract.ts`:
```ts
export interface DiagramFilter {
  name: string;
  extensions: string[];
}

export interface OpenedFile {
  path: string;
  content: string;
}

export interface ConfirmOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
}

export interface GraphvizApi {
  openTextFile(filters: DiagramFilter[]): Promise<OpenedFile | null>;
  pickSavePath(opts: { defaultPath: string; filters: DiagramFilter[] }): Promise<string | null>;
  writeTextFile(path: string, content: string): Promise<void>;
  writeBinaryFile(path: string, bytes: Uint8Array): Promise<void>;
  storeGet<T>(key: string): Promise<T | undefined>;
  storeSet(key: string, value: unknown): Promise<void>;
  storeDelete(key: string): Promise<void>;
  confirm(message: string, opts?: ConfirmOptions): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  appInfo(): Promise<{ name: string; version: string }>;
}
```

`src/platform/global.d.ts`:
```ts
import type { GraphvizApi } from './contract';

declare global {
  interface Window {
    graphviz: GraphvizApi;
  }
}
```

- [ ] **Step 3: Minimal preload + main (so Electron boots)**

`electron/preload.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { GraphvizApi, DiagramFilter, ConfirmOptions } from '../src/platform/contract';

const api: GraphvizApi = {
  openTextFile: (filters: DiagramFilter[]) => ipcRenderer.invoke('dialog:openText', filters),
  pickSavePath: (opts) => ipcRenderer.invoke('dialog:save', opts),
  writeTextFile: (path, content) => ipcRenderer.invoke('fs:writeText', path, content),
  writeBinaryFile: (path, bytes) => ipcRenderer.invoke('fs:writeBinary', path, bytes),
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store:delete', key),
  confirm: (message, opts?: ConfirmOptions) => ipcRenderer.invoke('dialog:confirm', message, opts),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  appInfo: () => ipcRenderer.invoke('app:info'),
};

contextBridge.exposeInMainWorld('graphviz', api);
```

`electron/main.ts` (minimal boot; handlers added in Task 4):
```ts
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 4: Wire vite-plugin-electron + `base`**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  base: './',
  plugins: [
    electron({
      main: { entry: 'electron/main.ts' },
      preload: { input: 'electron/preload.ts' },
    }),
  ],
});
```
Add `electron` + `dist-electron` to `tsconfig.json` `include`, and ensure `moduleResolution` supports node built-ins (the electron files compile in the Node context via the plugin; keep them out of the vitest `coverage.include`).

- [ ] **Step 5: Verify boot + typecheck, then commit**

Run: `pnpm typecheck` → Expected: PASS (0 errors).
Run: `pnpm dev` → Expected: an Electron window opens showing the current UI. Console will log Tauri errors (expected — not yet swapped); the window rendering confirms the shell works. Close it.
```bash
git add package.json pnpm-lock.yaml vite.config.ts tsconfig.json src/platform electron
git commit -m "feat(electron): scaffold Electron shell + IPC contract types"
```

---

### Task 2: `src/platform/index.ts` renderer module

**Files:**
- Create: `src/platform/index.ts`
- Test: `test/platform/index.test.ts`

**Interfaces:**
- Consumes: `window.graphviz` (Task 1).
- Produces: `openTextFile`, `pickSavePath`, `writeTextFile`, `writeBinaryFile`, `store.{get,set,delete}`, `confirm`, `openExternal`, `appInfo` — consumed by Tasks 5–11.

- [ ] **Step 1: Write the failing test**

`test/platform/index.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as platform from '../../src/platform';

const api = {
  openTextFile: vi.fn(),
  pickSavePath: vi.fn(),
  writeTextFile: vi.fn(),
  writeBinaryFile: vi.fn(),
  storeGet: vi.fn(),
  storeSet: vi.fn(),
  storeDelete: vi.fn(),
  confirm: vi.fn(),
  openExternal: vi.fn(),
  appInfo: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { graphviz: typeof api }).graphviz = api;
});

describe('platform', () => {
  it('openTextFile delegates to window.graphviz', async () => {
    api.openTextFile.mockResolvedValue({ path: '/a.dot', content: 'digraph{}' });
    const result = await platform.openTextFile([{ name: 'DOT', extensions: ['dot'] }]);
    expect(api.openTextFile).toHaveBeenCalledWith([{ name: 'DOT', extensions: ['dot'] }]);
    expect(result).toEqual({ path: '/a.dot', content: 'digraph{}' });
  });

  it('store.get/set/delete delegate to the store channels', async () => {
    api.storeGet.mockResolvedValue(42);
    expect(await platform.store.get<number>('editorZoom')).toBe(42);
    await platform.store.set('editorZoom', 3);
    expect(api.storeSet).toHaveBeenCalledWith('editorZoom', 3);
    await platform.store.delete('editorZoom');
    expect(api.storeDelete).toHaveBeenCalledWith('editorZoom');
  });

  it('confirm delegates with options', async () => {
    api.confirm.mockResolvedValue(true);
    expect(await platform.confirm('sure?', { title: 'T', kind: 'warning' })).toBe(true);
    expect(api.confirm).toHaveBeenCalledWith('sure?', { title: 'T', kind: 'warning' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/platform/index.test.ts`
Expected: FAIL (cannot find module `../../src/platform`).

- [ ] **Step 3: Implement `src/platform/index.ts`**

```ts
import type { ConfirmOptions, DiagramFilter, OpenedFile } from './contract';

export type { ConfirmOptions, DiagramFilter, OpenedFile } from './contract';

export function openTextFile(filters: DiagramFilter[]): Promise<OpenedFile | null> {
  return window.graphviz.openTextFile(filters);
}

export function pickSavePath(opts: {
  defaultPath: string;
  filters: DiagramFilter[];
}): Promise<string | null> {
  return window.graphviz.pickSavePath(opts);
}

export function writeTextFile(path: string, content: string): Promise<void> {
  return window.graphviz.writeTextFile(path, content);
}

export function writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
  return window.graphviz.writeBinaryFile(path, bytes);
}

export const store = {
  get: <T>(key: string): Promise<T | undefined> => window.graphviz.storeGet<T>(key),
  set: (key: string, value: unknown): Promise<void> => window.graphviz.storeSet(key, value),
  delete: (key: string): Promise<void> => window.graphviz.storeDelete(key),
};

export function confirm(message: string, opts?: ConfirmOptions): Promise<boolean> {
  return window.graphviz.confirm(message, opts);
}

export function openExternal(url: string): Promise<void> {
  return window.graphviz.openExternal(url);
}

export function appInfo(): Promise<{ name: string; version: string }> {
  return window.graphviz.appInfo();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/platform/index.test.ts` → Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/platform/index.ts test/platform/index.test.ts
git commit -m "feat(platform): add renderer platform module over window.graphviz"
```

---

### Task 3: Main-process IPC handlers + electron-store + window-state

**Files:**
- Modify: `electron/main.ts`
- Test: manual smoke (Electron integration; unit-covered indirectly via e2e in Task 14)

**Interfaces:**
- Consumes: the IPC channel names from Task 1's preload.
- Produces: working `window.graphviz.*` at runtime; persisted window bounds under store key `windowState`.

- [ ] **Step 1: Implement handlers, store, and window persistence**

Replace `electron/main.ts` with:
```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron';
import Store from 'electron-store';
import type { DiagramFilter, ConfirmOptions } from '../src/platform/contract';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new Store<Record<string, unknown>>();

interface WindowState {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

function restoreBounds(): Partial<Electron.BrowserWindowConstructorOptions> {
  const s = store.get('windowState') as WindowState | undefined;
  if (!s) return { width: 1200, height: 800 };
  const area = screen.getPrimaryDisplay().workArea;
  const width = s.width ?? 1200;
  const height = s.height ?? 800;
  // Clamp to a visible display so off-screen bounds don't hide the window.
  const x = s.x != null ? Math.min(Math.max(s.x, area.x), area.x + area.width - width) : undefined;
  const y = s.y != null ? Math.min(Math.max(s.y, area.y), area.y + area.height - height) : undefined;
  return { width, height, x, y };
}

let saveTimer: NodeJS.Timeout | undefined;
function persistBounds(win: BrowserWindow): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (win.isDestroyed()) return;
    const b = win.getBounds();
    store.set('windowState', {
      width: b.width,
      height: b.height,
      x: b.x,
      y: b.y,
      maximized: win.isMaximized(),
    } satisfies WindowState);
  }, 400);
}

function createWindow(): void {
  const win = new BrowserWindow({
    ...restoreBounds(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if ((store.get('windowState') as WindowState | undefined)?.maximized) win.maximize();

  win.on('resize', () => persistBounds(win));
  win.on('move', () => persistBounds(win));

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
}

const kindToType: Record<NonNullable<ConfirmOptions['kind']>, 'info' | 'warning' | 'error'> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
};

function registerIpc(): void {
  ipcMain.handle('dialog:openText', async (_e, filters: DiagramFilter[]) => {
    const win = BrowserWindow.getFocusedWindow();
    const res = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters });
    if (res.canceled || !res.filePaths[0]) return null;
    const p = res.filePaths[0];
    return { path: p, content: await readFile(p, 'utf-8') };
  });

  ipcMain.handle('dialog:save', async (_e, opts: { defaultPath: string; filters: DiagramFilter[] }) => {
    const win = BrowserWindow.getFocusedWindow();
    const res = await dialog.showSaveDialog(win!, { defaultPath: opts.defaultPath, filters: opts.filters });
    return res.canceled ? null : (res.filePath ?? null);
  });

  ipcMain.handle('fs:writeText', (_e, p: string, content: string) => writeFile(p, content, 'utf-8'));
  ipcMain.handle('fs:writeBinary', (_e, p: string, bytes: Uint8Array) => writeFile(p, Buffer.from(bytes)));

  ipcMain.handle('store:get', (_e, key: string) => store.get(key));
  ipcMain.handle('store:set', (_e, key: string, value: unknown) => { store.set(key, value); });
  ipcMain.handle('store:delete', (_e, key: string) => { store.delete(key); });

  ipcMain.handle('dialog:confirm', async (_e, message: string, opts?: ConfirmOptions) => {
    const win = BrowserWindow.getFocusedWindow();
    const res = await dialog.showMessageBox(win!, {
      type: opts?.kind ? kindToType[opts.kind] : 'question',
      title: opts?.title ?? 'Confirm',
      message,
      buttons: ['Cancel', 'OK'],
      defaultId: 1,
      cancelId: 0,
    });
    return res.response === 1;
  });

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url);
    return Promise.resolve();
  });

  ipcMain.handle('app:info', () => ({ name: app.getName(), version: app.getVersion() }));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 2: Smoke test the bridge**

Run: `pnpm dev`. In the opened window's devtools console:
```js
await window.graphviz.appInfo()          // → { name: 'graphvizjs-desktop-client', version: '...' }
await window.graphviz.storeSet('t', 1); await window.graphviz.storeGet('t')  // → 1
```
Resize/move the window, close, reopen `pnpm dev` → window returns to the same bounds. Expected: all succeed.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat(electron): IPC handlers, electron-store, window-bounds persistence"
```

---

### Task 4: Swap `toolbar/open-diagram.ts`

**Files:**
- Modify: `src/toolbar/open-diagram.ts`
- Test: `test/toolbar/open-diagram.test.ts` (new)

**Interfaces:**
- Consumes: `platform.openTextFile` (Task 2).

- [ ] **Step 1: Write the failing test**

`test/toolbar/open-diagram.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupOpenDiagramAction } from '../../src/toolbar/open-diagram';

vi.mock('../../src/platform', () => ({ openTextFile: vi.fn() }));
import { openTextFile } from '../../src/platform';

beforeEach(() => vi.clearAllMocks());

describe('setupOpenDiagramAction', () => {
  it('reads the picked file and calls onOpen with content + path', async () => {
    (openTextFile as ReturnType<typeof vi.fn>).mockResolvedValue({ path: '/g.dot', content: 'digraph{}' });
    const button = document.createElement('button');
    const onOpen = vi.fn();
    setupOpenDiagramAction({ button, onOpen });
    button.click();
    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledWith('digraph{}', '/g.dot'));
  });

  it('does nothing when the dialog is cancelled', async () => {
    (openTextFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const button = document.createElement('button');
    const onOpen = vi.fn();
    setupOpenDiagramAction({ button, onOpen });
    button.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/toolbar/open-diagram.test.ts` → Expected: FAIL (still imports `@tauri-apps`).

- [ ] **Step 3: Rewrite `src/toolbar/open-diagram.ts`**

```ts
import { openTextFile } from '../platform';

interface OpenDiagramOptions {
  button: HTMLButtonElement | null;
  onOpen: (content: string, path: string) => void;
}

export function setupOpenDiagramAction(options: OpenDiagramOptions): void {
  const { button, onOpen } = options;
  if (!button) return;

  button.addEventListener('click', async () => {
    try {
      const opened = await openTextFile([
        { name: 'DOT Diagram', extensions: ['dot', 'gv'] },
        { name: 'All Files', extensions: ['*'] },
      ]);
      if (!opened) return;
      onOpen(opened.content, opened.path);
    } catch (error) {
      console.error('Failed to open diagram', error);
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/toolbar/open-diagram.test.ts` → Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/toolbar/open-diagram.ts test/toolbar/open-diagram.test.ts
git commit -m "refactor(open): use platform.openTextFile instead of Tauri"
```

---

### Task 5: Swap `toolbar/save-diagram.ts`

**Files:**
- Modify: `src/toolbar/save-diagram.ts`
- Test: `test/toolbar/save-diagram.test.ts` (new)

**Interfaces:**
- Consumes: `platform.pickSavePath`, `platform.writeTextFile`.

- [ ] **Step 1: Write the failing test**

`test/toolbar/save-diagram.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupSaveDiagramAction } from '../../src/toolbar/save-diagram';

vi.mock('../../src/platform', () => ({ pickSavePath: vi.fn(), writeTextFile: vi.fn() }));
import { pickSavePath, writeTextFile } from '../../src/platform';

const editor = { state: { doc: { toString: () => 'digraph{}' } } };
beforeEach(() => vi.clearAllMocks());

describe('setupSaveDiagramAction', () => {
  it('writes to the existing path without prompting', async () => {
    const button = document.createElement('button');
    const onPathChange = vi.fn();
    setupSaveDiagramAction({
      getEditor: () => editor as never,
      button,
      getPath: () => '/existing.dot',
      onPathChange,
    });
    button.click();
    await vi.waitFor(() => expect(writeTextFile).toHaveBeenCalledWith('/existing.dot', 'digraph{}'));
    expect(pickSavePath).not.toHaveBeenCalled();
    expect(onPathChange).toHaveBeenCalledWith('/existing.dot');
  });

  it('prompts for a path when none is set', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/new.dot');
    const button = document.createElement('button');
    const onPathChange = vi.fn();
    setupSaveDiagramAction({ getEditor: () => editor as never, button, getPath: () => null, onPathChange });
    button.click();
    await vi.waitFor(() => expect(writeTextFile).toHaveBeenCalledWith('/new.dot', 'digraph{}'));
    expect(onPathChange).toHaveBeenCalledWith('/new.dot');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/toolbar/save-diagram.test.ts` → Expected: FAIL.

- [ ] **Step 3: Rewrite `src/toolbar/save-diagram.ts`**

```ts
import type { EditorView } from 'codemirror';
import { pickSavePath, writeTextFile } from '../platform';

interface SaveDiagramOptions {
  getEditor: () => EditorView;
  button: HTMLButtonElement | null;
  getPath: () => string | null;
  onPathChange: (path: string | null) => void;
  onSave?: (doc: string, path: string) => void;
}

export function setupSaveDiagramAction(options: SaveDiagramOptions): void {
  const { getEditor, button, getPath, onPathChange, onSave } = options;
  if (!button) return;

  button.addEventListener('click', async () => {
    const documentContent = getEditor().state.doc.toString();
    let targetPath = getPath();
    try {
      if (!targetPath) {
        targetPath = await pickSavePath({
          defaultPath: 'diagram.dot',
          filters: [
            { name: 'DOT Diagram', extensions: ['dot', 'gv'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        if (!targetPath) return;
      }
      await writeTextFile(targetPath, documentContent);
      onPathChange(targetPath);
      onSave?.(documentContent, targetPath);
    } catch (error) {
      console.error('Failed to save diagram', error);
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/toolbar/save-diagram.test.ts` → Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/toolbar/save-diagram.ts test/toolbar/save-diagram.test.ts
git commit -m "refactor(save): use platform save API instead of Tauri"
```

---

### Task 6: Swap `toolbar/export-diagram.ts`

**Files:**
- Modify: `src/toolbar/export-diagram.ts` (only the two Tauri imports + the two `exportAsSvg`/`exportAsPng` write calls; the SVG→PNG canvas logic is unchanged)
- Test: extend existing `test/` coverage if present; otherwise add `test/toolbar/export-diagram.test.ts` covering the save-path + write delegation with a mocked `renderDotToSvg`.

**Interfaces:**
- Consumes: `platform.pickSavePath`, `platform.writeTextFile`, `platform.writeBinaryFile`.

- [ ] **Step 1: Write the failing test**

`test/toolbar/export-diagram.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/platform', () => ({
  pickSavePath: vi.fn(),
  writeTextFile: vi.fn(),
  writeBinaryFile: vi.fn(),
}));
vi.mock('../../src/preview/graphviz', () => ({
  renderDotToSvg: vi.fn().mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
}));
import { pickSavePath, writeTextFile } from '../../src/platform';
import { createExportHandler } from '../../src/toolbar/export-diagram';

const editor = { state: { doc: { toString: () => 'digraph{a->b}' } } };
beforeEach(() => vi.clearAllMocks());

describe('createExportHandler', () => {
  it('writes SVG text to the chosen path', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue('/out.svg');
    const handler = createExportHandler({ getEditor: () => editor as never, getPath: () => '/g.dot' });
    await handler('svg');
    expect(pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: expect.stringMatching(/\.svg$/) }),
    );
    expect(writeTextFile).toHaveBeenCalledWith('/out.svg', expect.stringContaining('<svg'));
  });

  it('aborts when the save dialog is cancelled', async () => {
    (pickSavePath as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const handler = createExportHandler({ getEditor: () => editor as never, getPath: () => null });
    await handler('svg');
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});
```
(Note: `getBBox` is not implemented in happy-dom; keep PNG-path assertions out of unit tests — PNG export is exercised in the Task 14 e2e. The SVG path above avoids `getBBox` by not asserting dimensions, but if `normalizeSvg` throws on `getBBox`, stub it: `SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 }) as DOMRect;` in the test's `beforeEach`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/toolbar/export-diagram.test.ts` → Expected: FAIL.

- [ ] **Step 3: Edit the imports and write calls**

In `src/toolbar/export-diagram.ts`, replace the top two imports:
```ts
// DELETE:
// import { save as showSaveDialog } from '@tauri-apps/plugin-dialog';
// import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
// ADD:
import { pickSavePath, writeBinaryFile, writeTextFile } from '../platform';
```
In `exportAsSvg`, replace the dialog+write:
```ts
const targetPath = await pickSavePath({
  defaultPath: `${baseName}.svg`,
  filters: [
    { name: 'SVG Image', extensions: ['svg'] },
    { name: 'All Files', extensions: ['*'] },
  ],
});
if (!targetPath) return;
await writeTextFile(targetPath, svg);
```
In `exportAsPng`, replace the dialog+write:
```ts
const targetPath = await pickSavePath({
  defaultPath: `${baseName}${suffix}.png`,
  filters: [
    { name: 'PNG Image', extensions: ['png'] },
    { name: 'All Files', extensions: ['*'] },
  ],
});
if (!targetPath) return;
const pngBytes = await convertSvgToPng(diagram, scale);
await writeBinaryFile(targetPath, pngBytes);
```
Leave `renderDiagram`, `normalizeSvg`, `convertSvgToPng`, and all helpers unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/toolbar/export-diagram.test.ts` → Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/toolbar/export-diagram.ts test/toolbar/export-diagram.test.ts
git commit -m "refactor(export): use platform save/write APIs instead of Tauri"
```

---

### Task 7: Swap the store type in `autosave/manager.ts` + `autosave/recovery.ts`

**Files:**
- Modify: `src/autosave/manager.ts`, `src/autosave/recovery.ts`
- Test: update `test/autosave/manager.test.ts`, `test/autosave/recovery.test.ts`

**Interfaces:**
- Consumes: `platform.store` (typed `{ get, set, delete }`), `platform.confirm`.
- Produces: `manager`/`recovery` functions now take a `PlatformStore` (a structural type) instead of Tauri `Store`.

- [ ] **Step 1: Define the store type + update `manager.ts`**

Add to `src/platform/index.ts` (after the `store` const):
```ts
export type PlatformStore = typeof store;
```
In `src/autosave/manager.ts`, replace `import type { Store } from '@tauri-apps/plugin-store';` with:
```ts
import type { PlatformStore } from '../platform';
```
Then replace every `Store` type annotation with `PlatformStore`, and **delete every `await store.save();` line** (electron-store persists on write). The `store.set`/`store.get`/`store.delete` calls are unchanged (same names).

- [ ] **Step 2: Update `recovery.ts`**

In `src/autosave/recovery.ts`, replace:
```ts
// DELETE: import { confirm } from '@tauri-apps/plugin-dialog';
// DELETE: import type { Store } from '@tauri-apps/plugin-store';
// ADD:
import { confirm } from '../platform';
import type { PlatformStore } from '../platform';
```
Replace every `Store` annotation with `PlatformStore` and delete `await store.save();` lines. The `confirm(message, { title, kind })` calls are unchanged (same signature).

- [ ] **Step 3: Update the tests to mock `src/platform`**

In `test/autosave/manager.test.ts` and `test/autosave/recovery.test.ts`, replace the Tauri mock import lines:
```ts
// DELETE: import type { Store } from '@tauri-apps/plugin-store';
// DELETE: import '../mocks/tauri'; import { mockStore, resetAllMocks } from '../mocks/tauri';
// ADD:
import { makeMockStore, mockConfirm, resetPlatformMocks } from '../mocks/platform';
import type { PlatformStore } from '../../src/platform';
```
(`test/mocks/platform.ts` is created in Task 12; if executing strictly in order, create a minimal inline mock here and consolidate in Task 12. Simplest: create `test/mocks/platform.ts` now — see Task 12 Step 1 — and reference it here.) Update `mockStore` usages to `makeMockStore()` which returns a `PlatformStore` whose `get/set/delete` are `vi.fn()`; drop any `.save` assertions.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run test/autosave` → Expected: PASS (all existing autosave tests, `.save()` assertions removed).

- [ ] **Step 5: Commit**

```bash
git add src/autosave test/autosave test/mocks/platform.ts src/platform/index.ts
git commit -m "refactor(autosave): use platform store/confirm instead of Tauri"
```

---

### Task 8: Swap `help/dialog.ts`

**Files:**
- Modify: `src/help/dialog.ts`
- Test: update `test/help/dialog.test.ts`

**Interfaces:**
- Consumes: `platform.appInfo`, `platform.openExternal`.

- [ ] **Step 1: Update the test mocks**

In `test/help/dialog.test.ts`, replace the two `vi.mock('@tauri-apps/…')` blocks with:
```ts
vi.mock('../../src/platform', () => ({
  appInfo: vi.fn().mockResolvedValue({ name: 'GraphvizJS', version: '1.2.3' }),
  openExternal: vi.fn(),
}));
import { appInfo, openExternal } from '../../src/platform';
```
Keep existing assertions but retarget them: the dialog header should show `GraphvizJS v1.2.3` (from `appInfo`), and clicking "View Source" calls `openExternal` with the GitHub URL.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/help/dialog.test.ts` → Expected: FAIL (source still imports Tauri).

- [ ] **Step 3: Edit `src/help/dialog.ts`**

Replace the top imports:
```ts
// DELETE: import { getName, getVersion } from '@tauri-apps/api/app';
// DELETE: import { open } from '@tauri-apps/plugin-shell';
// ADD:
import { appInfo, openExternal } from '../platform';
```
Replace the metadata fetch inside `createDialog`:
```ts
const { name: appName, version: appVersion } = await appInfo();
```
Replace the external-link handler body:
```ts
if (url) {
  await openExternal(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/help/dialog.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/help/dialog.ts test/help/dialog.test.ts
git commit -m "refactor(help): use platform appInfo/openExternal instead of Tauri"
```

---

### Task 9: Trim `window/state.ts` to editor-zoom only

**Files:**
- Modify: `src/window/state.ts` (remove all Tauri window/store code; keep editor-zoom helpers on `platform.store`)
- Test: `test/window/state.test.ts` (new, small)

**Interfaces:**
- Consumes: `platform.store`.
- Produces: `loadEditorZoom(): Promise<number | null>`, `saveEditorZoom(level: number): Promise<void>` (note: **signatures drop the `store` param** — they now use `platform.store` directly). Task 11 (`main.ts`) must call the new signatures.

- [ ] **Step 1: Write the failing test**

`test/window/state.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/platform', () => ({ store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() } }));
import { store } from '../../src/platform';
import { loadEditorZoom, saveEditorZoom } from '../../src/window/state';

beforeEach(() => vi.clearAllMocks());

describe('editor zoom persistence', () => {
  it('loads zoom from the store', async () => {
    (store.get as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    expect(await loadEditorZoom()).toBe(2);
    expect(store.get).toHaveBeenCalledWith('editorZoom');
  });
  it('returns null when unset', async () => {
    (store.get as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    expect(await loadEditorZoom()).toBeNull();
  });
  it('saves zoom to the store', async () => {
    await saveEditorZoom(3);
    expect(store.set).toHaveBeenCalledWith('editorZoom', 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/window/state.test.ts` → Expected: FAIL.

- [ ] **Step 3: Replace `src/window/state.ts`**

```ts
import { store } from '../platform';

const EDITOR_ZOOM_KEY = 'editorZoom';

export async function loadEditorZoom(): Promise<number | null> {
  try {
    const zoom = await store.get<number>(EDITOR_ZOOM_KEY);
    return zoom ?? null;
  } catch (error) {
    console.warn('Loading editor zoom failed', error);
    return null;
  }
}

export async function saveEditorZoom(level: number): Promise<void> {
  try {
    await store.set(EDITOR_ZOOM_KEY, level);
  } catch (error) {
    console.warn('Saving editor zoom failed', error);
  }
}
```
(All window-bounds persistence — `loadSettingsStore`, `setupWindowPersistence`, `persistWindowState`, `WindowStatePayload`, `AppWindow` — is deleted; the main process owns it now.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/window/state.test.ts` → Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/window/state.ts test/window/state.test.ts
git commit -m "refactor(window): drop Tauri window/store; keep editor-zoom on platform.store"
```

---

### Task 10: Swap `main.ts` (renderer entry)

**Files:**
- Modify: `src/main.ts`
- Test: covered by e2e (Task 14) + `pnpm typecheck`; `main.ts` is excluded from coverage.

**Interfaces:**
- Consumes: `platform.confirm`, `platform.store`, the new `loadEditorZoom`/`saveEditorZoom` (Task 9), autosave functions (unchanged signatures except store type).

- [ ] **Step 1: Remove Tauri window usage**

In `src/main.ts`:
- Delete `import { getCurrentWindow } from '@tauri-apps/api/window';`.
- Delete `const appWindow = getCurrentWindow();` and any `setupWindowPersistence(...)` / `appWindow` references (window bounds are handled in main now).
- Replace `const store = await loadSettingsStore();` and its `Store` usage: import `{ store } from './platform'` and pass `store` (the `PlatformStore`) to the autosave/recovery calls that need it (their signatures now take `PlatformStore`).

- [ ] **Step 2: Replace the dynamic confirm import**

Replace:
```ts
const { confirm } = await import('@tauri-apps/plugin-dialog');
const proceed = await confirm('This tab has unsaved changes. Close anyway?', {
  title: 'Unsaved Changes',
  kind: 'warning',
});
```
with a top-of-file `import { confirm } from './platform';` and inline:
```ts
const proceed = await confirm('This tab has unsaved changes. Close anyway?', {
  title: 'Unsaved Changes',
  kind: 'warning',
});
```
Update `loadEditorZoom()`/`saveEditorZoom()` call sites to the new no-`store`-param signatures from Task 9.

- [ ] **Step 3: Verify typecheck + app runs**

Run: `pnpm typecheck` → Expected: PASS.
Run: `pnpm dev` → open a `.dot`, edit, save, export SVG, trigger autosave-recovery (edit, wait, relaunch), open help/about, click View Source. Expected: all work with no Tauri errors in console.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "refactor(main): remove Tauri window/confirm; use platform"
```

---

### Task 11: Consolidate `test/mocks/platform.ts` + delete `test/mocks/tauri.ts`

**Files:**
- Create/finalize: `test/mocks/platform.ts`
- Delete: `test/mocks/tauri.ts`
- Test: full unit suite

**Interfaces:**
- Produces: `makeMockStore()`, `mockConfirm`, `resetPlatformMocks` used by autosave tests.

- [ ] **Step 1: Write `test/mocks/platform.ts`**

```ts
import { vi } from 'vitest';
import type { PlatformStore } from '../../src/platform';

export function makeMockStore(initial: Record<string, unknown> = {}): PlatformStore {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    get: vi.fn(async <T>(k: string) => data.get(k) as T | undefined),
    set: vi.fn(async (k: string, v: unknown) => { data.set(k, v); }),
    delete: vi.fn(async (k: string) => { data.delete(k); }),
  };
}

export const mockConfirm = vi.fn(async () => true);

export function resetPlatformMocks(): void {
  mockConfirm.mockReset();
  mockConfirm.mockResolvedValue(true);
}
```

- [ ] **Step 2: Delete the Tauri mock + confirm no references**

```bash
git rm test/mocks/tauri.ts
```
Run: `grep -rn "mocks/tauri\|@tauri-apps" test/ src/` → Expected: no matches.

- [ ] **Step 3: Run the full unit suite**

Run: `pnpm test` → Expected: PASS (all unit tests green, coverage thresholds met).

- [ ] **Step 4: Commit**

```bash
git add test/mocks/platform.ts
git commit -m "test: replace Tauri mocks with platform mock"
```

---

### Task 12: Remove Tauri deps + `src-tauri/`

**Files:**
- Delete: `src-tauri/`
- Modify: `package.json` (drop `@tauri-apps/*`)

- [ ] **Step 1: Remove packages and directory**

```bash
pnpm remove @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-fs @tauri-apps/plugin-shell @tauri-apps/plugin-store @tauri-apps/cli
git rm -r src-tauri
```

- [ ] **Step 2: Verify no Tauri remnants**

Run: `grep -rn "@tauri-apps\|tauri" src electron package.json` → Expected: no matches (except possibly a stale word in comments — remove any).
Run: `pnpm typecheck && pnpm test` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove Tauri deps and src-tauri/ (closes glib/rand alerts)"
```

---

### Task 13: Migrate e2e to Playwright's Electron runner

**Files:**
- Modify: `playwright.config.ts`, `test/e2e/helpers.ts`, all `test/e2e/*.spec.ts`
- Add: a test-mode dialog stub path in `electron/main.ts`

**Interfaces:**
- Consumes: the built app (`pnpm build` → `dist/` + `dist-electron/`).

- [ ] **Step 1: Add a test-mode dialog stub in main**

In `electron/main.ts`, gate native dialogs behind an env flag so e2e can drive them deterministically. At the top of `registerIpc`:
```ts
const stubOpen = process.env.GVJS_E2E_OPEN;   // path to return from dialog:openText
const stubSave = process.env.GVJS_E2E_SAVE;   // path to return from dialog:save
```
In `dialog:openText`, if `stubOpen` is set, return `{ path: stubOpen, content: await readFile(stubOpen, 'utf-8') }` without opening a dialog. In `dialog:save`, if `stubSave` is set, return `stubSave`. (Keep native behavior when the flags are unset.)

- [ ] **Step 2: Rewrite `test/e2e/helpers.ts` to launch Electron**

```ts
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export async function launchApp(env: Record<string, string> = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, ...env } });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}
```

- [ ] **Step 3: Update `playwright.config.ts`**

Remove any webServer/baseURL pointing at vite; Playwright now launches Electron directly. Ensure `pnpm build` runs before e2e (document in the script or a `globalSetup`).

- [ ] **Step 4: Port each spec**

For each of `app`, `examples`, `export`, `file-operations`, `keyboard-shortcuts`, `rendering` specs: replace the old page-launch with `launchApp()`, and for file-operations/export pass `GVJS_E2E_OPEN`/`GVJS_E2E_SAVE` env pointing at a temp fixture. Run each spec individually and fix until green:
```bash
pnpm build
pnpm playwright test test/e2e/app.spec.ts
# …repeat per spec…
```

- [ ] **Step 5: Full e2e + commit**

Run: `pnpm build && pnpm test:e2e` → Expected: PASS.
```bash
git add electron/main.ts test/e2e playwright.config.ts
git commit -m "test(e2e): run against Electron via Playwright, stub native dialogs"
```

---

### Task 14: Packaging + final verification

**Files:**
- Create: `electron-builder.yml`
- Modify: `.github/workflows/*` (drop Rust; build Electron), `CHANGELOG.md`, `README.md`

- [ ] **Step 1: electron-builder config**

`electron-builder.yml`:
```yaml
appId: com.danielsimonjr.graphvizjs
productName: GraphvizJS
directories:
  output: release
files:
  - dist/**
  - dist-electron/**
win:
  target: nsis
mac:
  target: dmg
linux:
  target: AppImage
```

- [ ] **Step 2: Produce and smoke-test a package**

Run: `pnpm build && pnpm package` → Expected: an installer in `release/`.
Install/run it: open the app, type a DOT graph, confirm it **renders** (validates `@hpcc-js/wasm` loads under `file://`), save a `.dot`, export a PNG. Expected: all work.

- [ ] **Step 3: Update CI + docs**

Edit the workflow to drop the Rust/Tauri steps and run `pnpm build && pnpm test && pnpm test:e2e`. Update `README.md` (replace Tauri build instructions with Electron) and add a `CHANGELOG.md` entry under `[Unreleased]` noting the Tauri→Electron migration, the removed Rust stack, and that prior Tauri-store user data does not carry over.

- [ ] **Step 4: Final gate + verify alerts gone**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → Expected: all PASS.
Run: `grep -rn "@tauri-apps" .` (excluding `node_modules`, `pnpm-lock.yaml`, `docs/`) → Expected: no matches.
Confirm on GitHub after merge: GraphvizJS open Dependabot alerts drop from 2 (glib/rand) to 0.

- [ ] **Step 5: Commit**

```bash
git add electron-builder.yml .github README.md CHANGELOG.md package.json
git commit -m "build: electron-builder packaging; update CI + docs"
```

---

## Self-Review

**Spec coverage:** Every spec section maps to a task — platform interface (T2), architecture/main+preload (T1,T3), persistence/electron-store (T3), each of the 8 file swaps (T4–T10), unit-test mocks (T11), Tauri removal (T12), e2e (T13), packaging + CI + docs + alert-verification (T14). ✓
**Placeholder scan:** No TBD/TODO; every code step has concrete code; test steps show real assertions. The one conditional (Task 6 `getBBox` stub) is spelled out. ✓
**Type consistency:** `PlatformStore` defined in T7 and used in T7/T9/T11; `GraphvizApi` channel names in preload (T1) match `ipcMain.handle` names (T3); `loadEditorZoom`/`saveEditorZoom` signature change (drop `store` param) is called out in T9 and consumed in T10. ✓
