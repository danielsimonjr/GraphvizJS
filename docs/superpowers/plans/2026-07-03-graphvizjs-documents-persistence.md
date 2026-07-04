# Documents & Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give GraphvizJS recent-files, Save As, silent session restore, a per-document layout engine, and external-change reload.

**Architecture:** Reuse the existing single-`electron-store` + `store:*` IPC seam for all persisted state (new keys `recentFiles`, `session`). Add exactly one new architectural direction — a main→renderer push channel (`file:changed`) plus `fs:readText` and `watch:setPaths` — to support external-change reload. Every feature follows the repo convention: a `setup*({ DOM, callbacks })` module under `src/<area>/`, wired in `src/main.ts::bootstrap()`. Pure logic (recent-files ops, session (de)serialize/migrate, watcher path-diffing) lives in dependency-free modules unit-tested with Vitest; Electron/fs behavior is covered by Playwright `_electron` e2e.

**Tech Stack:** TypeScript, Vite, CodeMirror 6, Electron, electron-store, Vitest + happy-dom (unit), Playwright `_electron` (e2e), Biome.

## Global Constraints

- Ships as **v1.3.0** — bump `package.json` `version`; add `CHANGELOG.md` `## [1.3.0]` section.
- Default branch is **`master`**. Tag `v1.3.0`; release title `GraphvizJS v1.3.0 — Documents & persistence`.
- Windows-only build (electron-builder win nsis; CI on windows-latest).
- **No new runtime dependency** — the watcher uses Node's built-in `fs.watch`; nothing that pulls `core-js`.
- **First-launch parity (binding):** with no `session` and no `tabDrafts` in the store (fresh profile — every Playwright run), boot behavior must be byte-identical to today: one tab, `DEFAULT_SNIPPET`, engine `dot`.
- Code style enforced by Biome: 2-space indent, single quotes, semicolons, trailing commas (ES5), 100-col, `const` over `let`, no `any`.
- Store keys (verbatim): recent = `'recentFiles'`, session = `'session'`, legacy multi-tab draft = `'tabDrafts'`.
- IPC channel names (verbatim): `'fs:readText'`, `'watch:setPaths'`, push `'file:changed'`.
- Quality gate before merge: `pnpm typecheck` (0 errors), `pnpm lint` (clean), `pnpm test` + `pnpm test:e2e` green.

---

## Task 1: Recent-files pure core + store I/O

**Files:**
- Create: `src/recent/recent-files.ts`
- Test: `test/recent/recent-files.test.ts`

**Interfaces:**
- Consumes: `PlatformStore` from `src/platform` (`{ get<T>(key): Promise<T|undefined>; set(key,value): Promise<void>; delete(key): Promise<void> }`).
- Produces:
  - `export const RECENT_FILES_KEY = 'recentFiles'`
  - `export const MAX_RECENT = 10`
  - `addRecent(list: readonly string[], path: string, cap?: number): string[]`
  - `removeRecent(list: readonly string[], path: string): string[]`
  - `loadRecent(store: PlatformStore): Promise<string[]>`
  - `saveRecent(store: PlatformStore, list: readonly string[]): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// test/recent/recent-files.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  addRecent,
  loadRecent,
  MAX_RECENT,
  RECENT_FILES_KEY,
  removeRecent,
  saveRecent,
} from '../../src/recent/recent-files';

describe('addRecent', () => {
  it('adds a new path to the front', () => {
    expect(addRecent(['b', 'c'], 'a')).toEqual(['a', 'b', 'c']);
  });
  it('moves an existing path to the front (dedupe)', () => {
    expect(addRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });
  it('caps the list length, dropping the oldest', () => {
    const start = Array.from({ length: MAX_RECENT }, (_, i) => `f${i}`);
    const result = addRecent(start, 'new');
    expect(result).toHaveLength(MAX_RECENT);
    expect(result[0]).toBe('new');
    expect(result).not.toContain(`f${MAX_RECENT - 1}`);
  });
  it('does not mutate the input list', () => {
    const input = ['a', 'b'];
    addRecent(input, 'c');
    expect(input).toEqual(['a', 'b']);
  });
});

describe('removeRecent', () => {
  it('removes the given path', () => {
    expect(removeRecent(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
  it('is a no-op for an absent path', () => {
    expect(removeRecent(['a'], 'z')).toEqual(['a']);
  });
});

describe('loadRecent / saveRecent', () => {
  const makeStore = (value: unknown) => ({
    get: vi.fn().mockResolvedValue(value),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  });
  it('returns [] when nothing stored', async () => {
    expect(await loadRecent(makeStore(undefined))).toEqual([]);
  });
  it('returns [] when stored value is not a string array', async () => {
    expect(await loadRecent(makeStore({ nope: 1 }))).toEqual([]);
    expect(await loadRecent(makeStore(['ok', 3]))).toEqual([]);
  });
  it('round-trips a valid list', async () => {
    const store = makeStore(['a', 'b']);
    expect(await loadRecent(store)).toEqual(['a', 'b']);
    await saveRecent(store, ['x']);
    expect(store.set).toHaveBeenCalledWith(RECENT_FILES_KEY, ['x']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/recent/recent-files.test.ts`
Expected: FAIL — module `src/recent/recent-files` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/recent/recent-files.ts
import type { PlatformStore } from '../platform';

/** Store key for the recent-files list (most-recent-first). */
export const RECENT_FILES_KEY = 'recentFiles';

/** Maximum number of recent files retained. */
export const MAX_RECENT = 10;

/** Return a new list with `path` moved/added to the front, deduped, capped. */
export function addRecent(list: readonly string[], path: string, cap = MAX_RECENT): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, cap);
}

/** Return a new list with `path` removed. */
export function removeRecent(list: readonly string[], path: string): string[] {
  return list.filter((p) => p !== path);
}

/** Read the recent-files list, tolerating missing or malformed data. */
export async function loadRecent(store: PlatformStore): Promise<string[]> {
  const raw = await store.get<unknown>(RECENT_FILES_KEY);
  if (Array.isArray(raw) && raw.every((p) => typeof p === 'string')) {
    return raw as string[];
  }
  return [];
}

/** Persist the recent-files list. */
export async function saveRecent(store: PlatformStore, list: readonly string[]): Promise<void> {
  await store.set(RECENT_FILES_KEY, [...list]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/recent/recent-files.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/recent/recent-files.ts test/recent/recent-files.test.ts
git commit -m "feat: recent-files pure core and store I/O"
```

---

## Task 2: Recent-files UI + wiring + `readTextFile` IPC

**Files:**
- Modify: `src/platform/contract.ts` (add `readTextFile` to `GraphvizApi`)
- Modify: `electron/preload.ts` (bridge `fs:readText`)
- Modify: `electron/main.ts` (handle `fs:readText`)
- Modify: `src/platform/index.ts` (export `readTextFile` wrapper)
- Create: `src/toolbar/recent-menu.ts`
- Modify: `src/index.html` (Recent dropdown button + menu)
- Modify: `src/toolbar/actions.ts` (wire recent menu)
- Modify: `src/main.ts` (maintain `recentFiles`, record on open/save, open-from-recent)
- Test: `test/toolbar/recent-menu.test.ts`, `test/e2e/recent-files.spec.ts`

**Interfaces:**
- Consumes: `addRecent`, `loadRecent`, `saveRecent`, `removeRecent` (Task 1); existing `openTextFile`/`onOpen`/`onPathChange` flow in `main.ts`.
- Produces:
  - `GraphvizApi.readTextFile(path: string): Promise<string | null>`
  - `readTextFile(path: string): Promise<string | null>` from `src/platform`
  - `setupRecentMenu(options: RecentMenuOptions): void` where
    `RecentMenuOptions = { button: HTMLButtonElement | null; menu: HTMLDivElement | null; getRecent: () => string[]; onPick: (path: string) => void }`
  - `ToolbarActionsOptions` gains `recentButton`, `recentMenu`, `getRecent: () => string[]`, `onPickRecent: (path: string) => void`.

- [ ] **Step 1: Write the failing unit test (recent menu renders live list)**

```ts
// test/toolbar/recent-menu.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupRecentMenu } from '../../src/toolbar/recent-menu';

function build() {
  document.body.innerHTML = `
    <div class="toolbar-dropdown">
      <button data-action="recent-menu" aria-expanded="false"></button>
      <div class="toolbar-menu" data-menu="recent" hidden></div>
    </div>`;
  return {
    button: document.querySelector<HTMLButtonElement>('[data-action="recent-menu"]'),
    menu: document.querySelector<HTMLDivElement>('[data-menu="recent"]'),
  };
}

describe('setupRecentMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the current list each time it opens (basename label, full-path title)', () => {
    const { button, menu } = build();
    let list = ['C:/a/first.dot'];
    setupRecentMenu({ button, menu, getRecent: () => list, onPick: vi.fn() });
    button!.click();
    let items = menu!.querySelectorAll('.toolbar-menu-item');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe('first.dot');
    expect(items[0].getAttribute('title')).toBe('C:/a/first.dot');

    // Close, mutate list, reopen -> re-rendered.
    button!.click();
    list = ['C:/a/first.dot', 'D:/b/second.gv'];
    button!.click();
    items = menu!.querySelectorAll('.toolbar-menu-item');
    expect(items).toHaveLength(2);
  });

  it('shows a disabled empty state when the list is empty', () => {
    const { button, menu } = build();
    setupRecentMenu({ button, menu, getRecent: () => [], onPick: vi.fn() });
    button!.click();
    const empty = menu!.querySelector('.toolbar-menu-empty');
    expect(empty).not.toBeNull();
    expect(menu!.querySelectorAll('.toolbar-menu-item')).toHaveLength(0);
  });

  it('invokes onPick with the full path when an item is clicked', () => {
    const { button, menu } = build();
    const onPick = vi.fn();
    setupRecentMenu({ button, menu, getRecent: () => ['C:/a/first.dot'], onPick });
    button!.click();
    menu!.querySelector<HTMLButtonElement>('.toolbar-menu-item')!.click();
    expect(onPick).toHaveBeenCalledWith('C:/a/first.dot');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/toolbar/recent-menu.test.ts`
Expected: FAIL — `src/toolbar/recent-menu` missing.

- [ ] **Step 3: Implement `recent-menu.ts`**

Model the open/close/outside-click/Escape behavior on `src/toolbar/examples-menu.ts`, but re-render on every open from `getRecent()`.

```ts
// src/toolbar/recent-menu.ts
export interface RecentMenuOptions {
  button: HTMLButtonElement | null;
  menu: HTMLDivElement | null;
  getRecent: () => string[];
  onPick: (path: string) => void;
}

function basename(p: string): string {
  const n = p.replace(/\\/g, '/');
  const i = n.lastIndexOf('/');
  return i >= 0 ? n.slice(i + 1) : n;
}

export function setupRecentMenu({ button, menu, getRecent, onPick }: RecentMenuOptions): void {
  if (!button || !menu) return;
  let isOpen = false;

  const render = () => {
    menu.innerHTML = '';
    const paths = getRecent();
    if (paths.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'toolbar-menu-empty';
      empty.textContent = 'No recent files';
      menu.append(empty);
      return;
    }
    for (const path of paths) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'toolbar-menu-item';
      item.role = 'menuitem';
      item.dataset.path = path;
      item.textContent = basename(path);
      item.title = path;
      menu.append(item);
    }
  };

  const setOpen = (open: boolean) => {
    if (isOpen === open) return;
    isOpen = open;
    button.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    const method: 'addEventListener' | 'removeEventListener' = open
      ? 'addEventListener'
      : 'removeEventListener';
    document[method]('pointerdown', handlePointerDown, true);
  };

  const handlePointerDown = (event: Event) => {
    const target = event.target as Node | null;
    if (!target || menu.contains(target) || button.contains(target)) return;
    setOpen(false);
  };

  button.addEventListener('click', (event) => {
    event.preventDefault();
    if (!isOpen) render();
    setOpen(!isOpen);
  });

  menu.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      '.toolbar-menu-item'
    );
    const path = target?.dataset.path;
    if (!path) return;
    event.preventDefault();
    setOpen(false);
    onPick(path);
  });
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run test/toolbar/recent-menu.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `readTextFile` IPC across the four layers**

`src/platform/contract.ts` — add to `GraphvizApi`:
```ts
  readTextFile(path: string): Promise<string | null>;
```

`electron/preload.ts` — add to `api`:
```ts
  readTextFile: (path) => ipcRenderer.invoke('fs:readText', path),
```

`electron/main.ts` — add inside `registerIpc()` (import `readFile` is already present):
```ts
  ipcMain.handle('fs:readText', async (_e, p: string) => {
    try {
      return await readFile(p, 'utf-8');
    } catch {
      return null;
    }
  });
```

`src/platform/index.ts` — add wrapper:
```ts
export function readTextFile(path: string): Promise<string | null> {
  return window.graphviz.readTextFile(path);
}
```

- [ ] **Step 6: Add the Recent dropdown to `src/index.html`**

Insert as the first child of `.toolbar-right`, before the examples dropdown (line ~90):
```html
<div class="toolbar-dropdown" data-dropdown="recent">
  <button
    type="button"
    class="toolbar-button dropdown-button"
    aria-label="Recent files"
    aria-haspopup="true"
    aria-expanded="false"
    data-action="recent-menu"
    data-tooltip="Recent files"
  >
    <i class="ri-history-line icon-primary" aria-hidden="true"></i>
    <i class="ri-arrow-down-s-line icon-arrow" aria-hidden="true"></i>
  </button>
  <div class="toolbar-menu" role="menu" aria-label="Recent files" hidden data-menu="recent"></div>
</div>
```

Add a `.toolbar-menu-empty` rule to `src/styles.css` mirroring `.toolbar-menu-item` padding but muted/disabled (grey text, no hover), for both light and `body.dark`.

- [ ] **Step 7: Wire recent menu through `actions.ts` and `main.ts`**

`src/toolbar/actions.ts`:
- Import `setupRecentMenu`.
- Add to `ToolbarActionsOptions`: `recentButton: HTMLButtonElement | null; recentMenu: HTMLDivElement | null; getRecent: () => string[]; onPickRecent: (path: string) => void;`.
- In `setupToolbarActions`, call:
```ts
  setupRecentMenu({
    button: options.recentButton,
    menu: options.recentMenu,
    getRecent: options.getRecent,
    onPick: options.onPickRecent,
  });
```

`src/main.ts`:
- Query the new DOM refs near the other toolbar queries:
```ts
  const recentButton = document.querySelector<HTMLButtonElement>('[data-action="recent-menu"]');
  const recentMenu = document.querySelector<HTMLDivElement>('[data-dropdown="recent"] .toolbar-menu');
```
- Add imports: `import { addRecent, loadRecent, removeRecent, saveRecent } from './recent/recent-files';` and `readTextFile` from `./platform`.
- After `const tabManager = new TabManager();`, add module-local recent state:
```ts
  let recentFiles: string[] = await loadRecent(platformStore);
  async function recordRecent(path: string): Promise<void> {
    recentFiles = addRecent(recentFiles, path);
    await saveRecent(platformStore, recentFiles);
  }
```
- In the `onOpen(content, path)` callback, call `recordRecent(path);` after `createNewTab(content, path)`.
- In the `onPathChange(path)` callback, after setting `tab.filePath = path`, add: `if (path) recordRecent(path);`.
- Add to the `setupToolbarActions({...})` options object:
```ts
    recentButton,
    recentMenu,
    getRecent: () => recentFiles,
    async onPickRecent(path) {
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
        return;
      }
      createNewTab(content, path);
      await recordRecent(path);
    },
```

- [ ] **Step 8: Write the e2e test**

```ts
// test/e2e/recent-files.spec.ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('recently opened file appears in the Recent menu and reopens', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gvjs-recent-'));
  const file = join(dir, 'sample.dot');
  writeFileSync(file, 'digraph { a -> b }', 'utf-8');

  const app = await electron.launch({ args: ['.'], env: { ...process.env, GVJS_E2E_OPEN: file } });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();

  await page.locator('[data-action="open-diagram"]').click();
  // Recent menu now lists the opened file.
  await page.locator('[data-action="recent-menu"]').click();
  const item = page.locator('[data-menu="recent"] .toolbar-menu-item', { hasText: 'sample.dot' });
  await expect(item).toBeVisible();
  await item.click();
  await app.close();
});
```

- [ ] **Step 9: Run the suites**

Run: `npx vitest run test/toolbar/recent-menu.test.ts test/recent/recent-files.test.ts` → PASS.
Run: `npx playwright test test/e2e/recent-files.spec.ts` → PASS.
Run: `pnpm typecheck` → 0 errors.

- [ ] **Step 10: Commit**

```bash
git add src/platform/contract.ts electron/preload.ts electron/main.ts src/platform/index.ts \
  src/toolbar/recent-menu.ts src/index.html src/styles.css src/toolbar/actions.ts src/main.ts \
  test/toolbar/recent-menu.test.ts test/e2e/recent-files.spec.ts
git commit -m "feat: recent files menu with readTextFile IPC"
```

---

## Task 3: Save As action + button + `Ctrl+Shift+S`

**Files:**
- Create: `src/toolbar/save-as.ts`
- Modify: `src/index.html` (Save As button)
- Modify: `src/toolbar/actions.ts` (wire Save As)
- Modify: `src/toolbar/shortcuts.ts` (route `Ctrl+Shift+S` to Save As)
- Modify: `src/main.ts` (pass `saveAsButton` to shortcuts)
- Test: `test/toolbar/save-as.test.ts`, `test/e2e/save-as.spec.ts`

**Interfaces:**
- Consumes: `pickSavePath`, `writeTextFile` from `src/platform`; existing `getEditor`/`getPath`/`onPathChange`/`commitDocument` wiring.
- Produces:
  - `performSaveAs(opts: SaveAsOptions): Promise<void>` where
    `SaveAsOptions = { getEditor: () => EditorView; getPath: () => string | null; onPathChange: (path: string | null) => void; onSave: (doc: string, path: string) => void }`
  - `setupSaveAsAction(opts: SaveAsOptions & { button: HTMLButtonElement | null }): void`
  - `ToolbarShortcutsOptions` gains `saveAsButton?: HTMLButtonElement | null`.

- [ ] **Step 1: Write the failing unit test**

```ts
// test/toolbar/save-as.test.ts
import { describe, expect, it, vi } from 'vitest';

const pickSavePath = vi.fn();
const writeTextFile = vi.fn();
vi.mock('../../src/platform', () => ({ pickSavePath, writeTextFile }));

import { performSaveAs } from '../../src/toolbar/save-as';

const editor = { state: { doc: { toString: () => 'digraph{a}' } } } as never;

describe('performSaveAs', () => {
  it('always prompts for a path even when one already exists', async () => {
    pickSavePath.mockResolvedValueOnce('C:/new.dot');
    writeTextFile.mockResolvedValueOnce(undefined);
    const onPathChange = vi.fn();
    const onSave = vi.fn();
    await performSaveAs({ getEditor: () => editor, getPath: () => 'C:/old.dot', onPathChange, onSave });
    expect(pickSavePath).toHaveBeenCalledTimes(1);
    expect(writeTextFile).toHaveBeenCalledWith('C:/new.dot', 'digraph{a}');
    expect(onPathChange).toHaveBeenCalledWith('C:/new.dot');
    expect(onSave).toHaveBeenCalledWith('digraph{a}', 'C:/new.dot');
  });

  it('is a no-op when the dialog is cancelled', async () => {
    pickSavePath.mockResolvedValueOnce(null);
    const onSave = vi.fn();
    await performSaveAs({ getEditor: () => editor, getPath: () => null, onPathChange: vi.fn(), onSave });
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/toolbar/save-as.test.ts`
Expected: FAIL — `src/toolbar/save-as` missing.

- [ ] **Step 3: Implement `save-as.ts`**

```ts
// src/toolbar/save-as.ts
import type { EditorView } from 'codemirror';
import { pickSavePath, writeTextFile } from '../platform';

export interface SaveAsOptions {
  getEditor: () => EditorView;
  getPath: () => string | null;
  onPathChange: (path: string | null) => void;
  onSave: (doc: string, path: string) => void;
}

function defaultName(path: string | null): string {
  if (!path) return 'diagram.dot';
  const n = path.replace(/\\/g, '/');
  const i = n.lastIndexOf('/');
  return i >= 0 ? n.slice(i + 1) : n;
}

/** Save the active document to a newly chosen path (always prompts). */
export async function performSaveAs(opts: SaveAsOptions): Promise<void> {
  const content = opts.getEditor().state.doc.toString();
  try {
    const target = await pickSavePath({
      defaultPath: defaultName(opts.getPath()),
      filters: [
        { name: 'DOT Diagram', extensions: ['dot', 'gv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!target) return;
    await writeTextFile(target, content);
    opts.onPathChange(target);
    opts.onSave(content, target);
  } catch (error) {
    console.error('Failed to save diagram as', error);
  }
}

export function setupSaveAsAction(
  opts: SaveAsOptions & { button: HTMLButtonElement | null }
): void {
  const { button, ...rest } = opts;
  if (!button) return;
  button.addEventListener('click', () => {
    void performSaveAs(rest);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/toolbar/save-as.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the Save As button to `src/index.html`**

Insert immediately after the Save button (line ~53), before Find:
```html
<button
  type="button"
  class="toolbar-button icon-button"
  aria-label="Save diagram as"
  data-action="save-as-diagram"
  data-tooltip="Save As (Ctrl+Shift+S)"
>
  <i class="ri-save-2-line" aria-hidden="true"></i>
</button>
```

- [ ] **Step 6: Wire through `actions.ts` and `main.ts`; route the shortcut**

`src/toolbar/actions.ts`:
- Import `setupSaveAsAction`.
- Add `saveAsButton: HTMLButtonElement | null` to `ToolbarActionsOptions`.
- Call:
```ts
  setupSaveAsAction({
    button: options.saveAsButton,
    getEditor,
    getPath,
    onPathChange,
    onSave(doc) {
      commitDocument(doc, { saved: true });
    },
  });
```

`src/main.ts`:
- Query `const saveAsButton = document.querySelector<HTMLButtonElement>('[data-action="save-as-diagram"]');`.
- Pass `saveAsButton` in the `setupToolbarActions({...})` options.
- Pass `saveAsButton` in the `setupToolbarShortcuts({...})` options.

`src/toolbar/shortcuts.ts`:
- Add `saveAsButton?: HTMLButtonElement | null;` to `ToolbarShortcutsOptions`.
- Replace the current `key === 's'` branch (which ignores Shift) with Shift-aware routing:
```ts
    if (key === 's') {
      if (event.shiftKey) {
        if (trigger(options.saveAsButton)) {
          event.preventDefault();
          return;
        }
      } else if (trigger(options.saveButton)) {
        event.preventDefault();
        return;
      }
    }
```
(Note: the existing `event.altKey` early-return above is unchanged; this keeps `Shift` for Save As while plain `Ctrl+S` still saves.)

- [ ] **Step 7: Write the e2e test**

```ts
// test/e2e/save-as.spec.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('Save As prompts for a path even when the tab already has one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gvjs-saveas-'));
  const target = join(dir, 'out.dot');
  const app = await electron.launch({ args: ['.'], env: { ...process.env, GVJS_E2E_SAVE: target } });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();

  await page.locator('[data-action="save-as-diagram"]').click();
  // File status reflects the chosen path's basename.
  await expect(page.locator('[data-status="file"]')).toContainText('out.dot');
  await app.close();
});
```

- [ ] **Step 8: Run the suites**

Run: `npx vitest run test/toolbar/save-as.test.ts` → PASS.
Run: `npx playwright test test/e2e/save-as.spec.ts` → PASS.
Run: `pnpm typecheck` → 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/toolbar/save-as.ts src/index.html src/toolbar/actions.ts src/toolbar/shortcuts.ts \
  src/main.ts test/toolbar/save-as.test.ts test/e2e/save-as.spec.ts
git commit -m "feat: Save As action with Ctrl+Shift+S"
```

---

## Task 4: Per-document layout engine

**Files:**
- Modify: `src/tabs/manager.ts` (`layoutEngine` on `TabState` + `CreateTabOptions`)
- Modify: `src/main.ts` (write engine to active tab; sync selector on switch; `getEngine` reads active tab)
- Test: `test/tabs/manager.test.ts` (extend), `test/e2e/per-doc-engine.spec.ts`

**Interfaces:**
- Consumes: `LayoutEngine` from `src/preview/graphviz`; `getCurrentEngine`/`setupLayoutEngine` from `src/toolbar/layout-engine`.
- Produces: `TabState.layoutEngine: LayoutEngine`; `CreateTabOptions.layoutEngine?: LayoutEngine` (default `'dot'`).

- [ ] **Step 1: Write the failing unit test**

Add to `test/tabs/manager.test.ts`:
```ts
import type { LayoutEngine } from '../../src/preview/graphviz';

it('defaults layoutEngine to dot and accepts an override', () => {
  const mgr = new TabManager();
  const a = mgr.createTab();
  expect(a?.layoutEngine).toBe('dot');
  const b = mgr.createTab({ layoutEngine: 'neato' as LayoutEngine });
  expect(b?.layoutEngine).toBe('neato');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tabs/manager.test.ts`
Expected: FAIL — `layoutEngine` is not a property of `TabState`.

- [ ] **Step 3: Add the field to `manager.ts`**

- Import the type: `import type { LayoutEngine } from '../preview/graphviz';`.
- Add to `TabState`:
```ts
  /** Layout engine used to render this tab's diagram. */
  layoutEngine: LayoutEngine;
```
- Add to `CreateTabOptions`:
```ts
  /** Layout engine for this tab (defaults to 'dot'). */
  layoutEngine?: LayoutEngine;
```
- In `createTab`, set it on the new `TabState`:
```ts
      layoutEngine: options.layoutEngine ?? 'dot',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tabs/manager.test.ts`
Expected: PASS.

- [ ] **Step 5: Make the engine per-tab in `main.ts`**

- The preview scheduler's `getEngine` must read the active tab, not the DOM. Because `createPreview` is called before any tab exists, guard with a fallback:
```ts
    getEngine: () => tabManager.getActiveTab()?.layoutEngine ?? 'dot',
```
  Apply the same change to the linter wiring in `createTabEditor`:
```ts
      createDotLinter({ getEngine: () => tabManager.getActiveTab()?.layoutEngine ?? 'dot' }),
```
  (Remove the now-unused `getCurrentEngine` import if nothing else references it.)
- In `createNewTab`, thread the engine into the tab and the `<select>`:
```ts
  function createNewTab(
    content: string,
    filePath: string | null = null,
    engine: LayoutEngine = 'dot'
  ): TabState | null {
    const editorView = createTabEditor(content, true);
    const tab = tabManager.createTab({ content, filePath, editorView, layoutEngine: engine });
    ...
```
  After the tab is created and made active, sync the selector:
```ts
    syncEngineSelect(tab.layoutEngine);
```
  Add a helper near `refreshTabBar`:
```ts
  function syncEngineSelect(engine: LayoutEngine): void {
    const select = document.querySelector<HTMLSelectElement>('#layout-engine');
    if (select) select.value = engine;
  }
```
  (Import `LayoutEngine`: `import type { LayoutEngine } from './preview/graphviz';`.)
- In `switchToTab`, after `updateFileStatus()`, add `syncEngineSelect(newTab.layoutEngine);`.
- In the `setupLayoutEngine(...)` callback, write the chosen engine to the active tab, then re-render. `setupLayoutEngine` already passes the validated engine — change its callback signature use:
```ts
  setupLayoutEngine((engine) => {
    const tab = tabManager.getActiveTab();
    if (!tab) return;
    tab.layoutEngine = engine;
    if (tab.editorView) {
      schedulePreviewRender(tab.editorView.state.doc.toString());
    }
  });
```

- [ ] **Step 6: Write the e2e test**

```ts
// test/e2e/per-doc-engine.spec.ts
import { _electron as electron, expect, test } from '@playwright/test';

test('layout engine is per-tab and the selector follows the active tab', async () => {
  const app = await electron.launch({ args: ['.'] });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();

  const select = page.locator('#layout-engine');
  // Tab 1: set neato.
  await select.selectOption('neato');
  // Open a second tab (defaults to dot).
  await page.locator('.tab-new').click();
  await expect(select).toHaveValue('dot');
  // Switch back to tab 1 -> selector restores neato.
  await page.locator('[role="tab"]').first().click();
  await expect(select).toHaveValue('neato');
  await app.close();
});
```

- [ ] **Step 7: Run the suites**

Run: `npx vitest run test/tabs/manager.test.ts` → PASS.
Run: `npx playwright test test/e2e/per-doc-engine.spec.ts` → PASS.
Run: `pnpm typecheck` → 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/tabs/manager.ts src/main.ts test/tabs/manager.test.ts test/e2e/per-doc-engine.spec.ts
git commit -m "feat: per-document layout engine"
```

---

## Task 5: Session pure core (capture / (de)serialize / migrate / load)

**Files:**
- Create: `src/session/session.ts`
- Test: `test/session/session.test.ts`

**Interfaces:**
- Consumes: `PlatformStore` from `src/platform`; `LayoutEngine` from `src/preview/graphviz`; `TAB_DRAFTS_KEY` from `src/autosave/constants`.
- Produces:
  - `export const SESSION_KEY = 'session'`
  - `interface SessionTab { filePath: string | null; content: string; savedContent: string; engine: LayoutEngine }`
  - `interface SessionData { tabs: SessionTab[]; activeIndex: number }`
  - `interface CapturableTab { filePath: string | null; content: string; savedContent: string; engine: LayoutEngine }`
  - `captureSession(tabs: CapturableTab[], activeIndex: number): SessionData`
  - `deserializeSession(raw: unknown): SessionData | null`
  - `migrateLegacyDrafts(raw: unknown): SessionData | null`
  - `loadSession(store: PlatformStore): Promise<SessionData | null>`
  - `persistSession(store: PlatformStore, data: SessionData): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// test/session/session.test.ts
import { describe, expect, it, vi } from 'vitest';
import { TAB_DRAFTS_KEY } from '../../src/autosave/constants';
import {
  captureSession,
  deserializeSession,
  loadSession,
  migrateLegacyDrafts,
  persistSession,
  SESSION_KEY,
} from '../../src/session/session';

const tab = (filePath: string | null, content: string, savedContent: string, engine = 'dot') =>
  ({ filePath, content, savedContent, engine }) as const;

describe('captureSession', () => {
  it('assembles tabs and clamps activeIndex into range', () => {
    const data = captureSession([tab(null, 'a', 'a'), tab('C:/f.dot', 'b*', 'b')], 5);
    expect(data.tabs).toHaveLength(2);
    expect(data.tabs[1]).toEqual({ filePath: 'C:/f.dot', content: 'b*', savedContent: 'b', engine: 'dot' });
    expect(data.activeIndex).toBe(1); // clamped to last index
  });
  it('clamps a negative activeIndex to 0', () => {
    expect(captureSession([tab(null, 'a', 'a')], -1).activeIndex).toBe(0);
  });
});

describe('deserializeSession', () => {
  it('accepts a well-formed object', () => {
    const raw = { tabs: [tab('C:/f.dot', 'x', 'x', 'neato')], activeIndex: 0 };
    expect(deserializeSession(raw)).toEqual(raw);
  });
  it('rejects malformed input', () => {
    expect(deserializeSession(null)).toBeNull();
    expect(deserializeSession({ tabs: 'no' })).toBeNull();
    expect(deserializeSession({ tabs: [{ filePath: 1 }], activeIndex: 0 })).toBeNull();
  });
  it('clamps activeIndex and defaults a missing engine to dot', () => {
    const raw = { tabs: [{ filePath: null, content: 'c', savedContent: 'c' }], activeIndex: 9 };
    const out = deserializeSession(raw);
    expect(out?.activeIndex).toBe(0);
    expect(out?.tabs[0].engine).toBe('dot');
  });
});

describe('migrateLegacyDrafts', () => {
  it('converts a tabDrafts payload into a clean session', () => {
    const legacy = { tabs: [{ content: 'a', filePath: null }, { content: 'b', filePath: 'C:/b.dot' }], timestamp: 't' };
    const out = migrateLegacyDrafts(legacy);
    expect(out?.tabs).toHaveLength(2);
    expect(out?.tabs[0]).toEqual({ filePath: null, content: 'a', savedContent: 'a', engine: 'dot' });
    expect(out?.activeIndex).toBe(0);
  });
  it('returns null for non-legacy input', () => {
    expect(migrateLegacyDrafts(undefined)).toBeNull();
    expect(migrateLegacyDrafts({ tabs: [] })).toBeNull();
  });
});

describe('loadSession', () => {
  const store = (map: Record<string, unknown>) => ({
    get: vi.fn(async (k: string) => map[k]),
    set: vi.fn(),
    delete: vi.fn(),
  });
  it('prefers a stored session', async () => {
    const s = { tabs: [tab(null, 'a', 'a')], activeIndex: 0 };
    expect(await loadSession(store({ [SESSION_KEY]: s }))).toEqual(s);
  });
  it('falls back to migrating legacy drafts', async () => {
    const legacy = { tabs: [{ content: 'a', filePath: null }], timestamp: 't' };
    const out = await loadSession(store({ [TAB_DRAFTS_KEY]: legacy }));
    expect(out?.tabs[0].content).toBe('a');
  });
  it('returns null when neither exists', async () => {
    expect(await loadSession(store({}))).toBeNull();
  });
  it('persistSession writes under SESSION_KEY', async () => {
    const s = store({});
    const data = { tabs: [tab(null, 'a', 'a')], activeIndex: 0 };
    await persistSession(s, data);
    expect(s.set).toHaveBeenCalledWith(SESSION_KEY, data);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/session/session.test.ts`
Expected: FAIL — `src/session/session` missing.

- [ ] **Step 3: Implement `session.ts`**

```ts
// src/session/session.ts
import { TAB_DRAFTS_KEY } from '../autosave/constants';
import type { PlatformStore } from '../platform';
import type { LayoutEngine } from '../preview/graphviz';

/** Store key for the persisted open-tab session. */
export const SESSION_KEY = 'session';

const ENGINES: ReadonlySet<string> = new Set<LayoutEngine>([
  'dot', 'neato', 'fdp', 'sfdp', 'circo', 'twopi', 'osage', 'patchwork',
]);

export interface SessionTab {
  filePath: string | null;
  content: string;
  savedContent: string;
  engine: LayoutEngine;
}

export interface SessionData {
  tabs: SessionTab[];
  activeIndex: number;
}

/** A tab's snapshot as captured from the running app (same shape as SessionTab). */
export type CapturableTab = SessionTab;

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.floor(index), Math.max(0, length - 1));
}

function toEngine(value: unknown): LayoutEngine {
  return typeof value === 'string' && ENGINES.has(value) ? (value as LayoutEngine) : 'dot';
}

/** Assemble a SessionData from captured tab snapshots, clamping activeIndex. */
export function captureSession(tabs: CapturableTab[], activeIndex: number): SessionData {
  return { tabs: tabs.map((t) => ({ ...t })), activeIndex: clampIndex(activeIndex, tabs.length) };
}

/** Validate and normalize a stored session value, or null if malformed. */
export function deserializeSession(raw: unknown): SessionData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as { tabs?: unknown; activeIndex?: unknown };
  if (!Array.isArray(obj.tabs)) return null;
  const tabs: SessionTab[] = [];
  for (const entry of obj.tabs) {
    if (typeof entry !== 'object' || entry === null) return null;
    const t = entry as Record<string, unknown>;
    if (typeof t.content !== 'string') return null;
    if (t.filePath !== null && typeof t.filePath !== 'string') return null;
    tabs.push({
      filePath: (t.filePath as string | null) ?? null,
      content: t.content,
      savedContent: typeof t.savedContent === 'string' ? t.savedContent : t.content,
      engine: toEngine(t.engine),
    });
  }
  return { tabs, activeIndex: clampIndex(Number(obj.activeIndex ?? 0), tabs.length) };
}

/** Convert a legacy `tabDrafts` payload into a clean SessionData, or null. */
export function migrateLegacyDrafts(raw: unknown): SessionData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as { tabs?: unknown };
  if (!Array.isArray(obj.tabs) || obj.tabs.length === 0) return null;
  const tabs: SessionTab[] = [];
  for (const entry of obj.tabs) {
    if (typeof entry !== 'object' || entry === null) return null;
    const t = entry as Record<string, unknown>;
    if (typeof t.content !== 'string') return null;
    tabs.push({
      filePath: (t.filePath as string | null) ?? null,
      content: t.content,
      savedContent: t.content,
      engine: 'dot',
    });
  }
  return { tabs, activeIndex: 0 };
}

/** Load the session, falling back to migrating legacy drafts. */
export async function loadSession(store: PlatformStore): Promise<SessionData | null> {
  const session = deserializeSession(await store.get<unknown>(SESSION_KEY));
  if (session && session.tabs.length > 0) return session;
  return migrateLegacyDrafts(await store.get<unknown>(TAB_DRAFTS_KEY));
}

/** Persist the session. */
export async function persistSession(store: PlatformStore, data: SessionData): Promise<void> {
  await store.set(SESSION_KEY, data);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/session/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session/session.ts test/session/session.test.ts
git commit -m "feat: session model pure core"
```

---

## Task 6: Silent session restore + persistence; retire crash-recovery prompt

**Files:**
- Modify: `src/main.ts` (hydrate from session at boot; persist on interval + events; remove recovery block; `createNewTab` savedContent/engine params)
- Modify: `electron/main.ts` (add `GVJS_E2E_USERDATA` seam above `new Store()`)
- Test: `test/e2e/session-restore.spec.ts`

**Interfaces:**
- Consumes: `loadSession`, `persistSession`, `captureSession` (Task 5); `TabState.layoutEngine` (Task 4); `createNewTab`, `switchToTab`, `tabManager` (existing).
- Produces: no new public API. `createNewTab` gains optional params:
  `createNewTab(content: string, filePath?: string | null, engine?: LayoutEngine, savedContent?: string): TabState | null`.

- [ ] **Step 1: Add the userData test seam to `electron/main.ts`**

Immediately after the `electron` import and before `const store = new Store(...)`:
```ts
// Test seam: isolate persisted state to a temp dir under Playwright so session
// restore can be exercised deterministically. Must run before Store construction.
if (process.env.GVJS_E2E_USERDATA) {
  app.setPath('userData', process.env.GVJS_E2E_USERDATA);
}
```

- [ ] **Step 2: Write the failing e2e test (restore from a seeded store)**

```ts
// test/e2e/session-restore.spec.ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

function seedSession(userData: string, session: unknown) {
  // electron-store's default file is config.json in userData.
  writeFileSync(join(userData, 'config.json'), JSON.stringify({ session }), 'utf-8');
}

test('restores a seeded multi-tab session silently on launch', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'gvjs-session-'));
  seedSession(userData, {
    tabs: [
      { filePath: null, content: 'digraph { restored_one }', savedContent: 'digraph { restored_one }', engine: 'neato' },
      { filePath: null, content: 'digraph { restored_two }', savedContent: 'digraph { restored_two }', engine: 'dot' },
    ],
    activeIndex: 1,
  });

  const app = await electron.launch({ args: ['.'], env: { ...process.env, GVJS_E2E_USERDATA: userData } });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();

  // Two tabs restored, no recovery dialog, active tab is index 1 (engine dot).
  await expect(page.locator('[role="tab"]')).toHaveCount(2);
  await expect(page.locator('#layout-engine')).toHaveValue('dot');
  await expect(page.locator('#editor-host')).toContainText('restored_two');
  await app.close();
});

test('fresh profile shows a single default snippet tab (parity)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'gvjs-fresh-'));
  const app = await electron.launch({ args: ['.'], env: { ...process.env, GVJS_E2E_USERDATA: userData } });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();
  await expect(page.locator('[role="tab"]')).toHaveCount(1);
  await expect(page.locator('#editor-host')).toContainText('Decision');
  await app.close();
});
```

- [ ] **Step 3: Run the e2e to verify it fails**

Run: `npx playwright test test/e2e/session-restore.spec.ts`
Expected: FAIL — the restore test sees 1 tab (default snippet) because restore isn't wired yet. (The parity test may already pass.)

- [ ] **Step 4: Extend `createNewTab` to accept savedContent + engine**

Change the signature and body in `src/main.ts`:
```ts
  function createNewTab(
    content: string,
    filePath: string | null = null,
    engine: LayoutEngine = 'dot',
    savedContent: string = content
  ): TabState | null {
    const editorView = createTabEditor(content, true);
    const tab = tabManager.createTab({ content, filePath, editorView, layoutEngine: engine });
    if (!tab) {
      editorView.destroy();
      status.info(`Maximum ${MAX_TABS} tabs reached`);
      return null;
    }
    // ...existing hide-others + editor-zoom setup unchanged...
    tab.lastCommittedDoc = savedContent;
    tab.isDirty = content !== savedContent;
    syncEngineSelect(tab.layoutEngine);
    refreshTabBar();
    updateFileStatus();
    schedulePreviewRender(content);
    editorView.focus();
    return tab;
  }
```
(Existing call sites pass only `content`/`filePath` and keep today's behavior because `savedContent` defaults to `content` → clean.)

- [ ] **Step 5: Replace the recovery block with silent session restore**

Remove the import line `import { checkForMultiTabRecovery, promptMultiTabRecovery } from './autosave/recovery';` and the entire recovery block (`{ const recoveryData = ... await clearDraft(platformStore); }`, main.ts ~324-359).

Replace with, right after `commitDocument(initialTab.editorView!.state.doc.toString());`:
```ts
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
```
(Add imports: `import { loadSession, persistSession, captureSession } from './session/session';` and `import { TAB_DRAFTS_KEY } from './autosave/constants';`.)

- [ ] **Step 6: Persist the session on interval + lifecycle events**

- Remove the `setupMultiTabAutosave({...})` block and its import; replace with a session-save scheduler. Add near the other helpers:
```ts
  const captureCurrentSession = (): SessionData =>
    captureSession(
      tabManager.getAllTabs().map((t) => ({
        filePath: t.filePath,
        content: t.editorView?.state.doc.toString() ?? t.lastCommittedDoc,
        savedContent: t.lastCommittedDoc,
        engine: t.layoutEngine,
      })),
      tabManager.getAllTabs().findIndex((t) => t.id === tabManager.getActiveTabId())
    );

  let sessionSaveTimer: number | null = null;
  const scheduleSessionSave = (): void => {
    if (sessionSaveTimer !== null) window.clearTimeout(sessionSaveTimer);
    sessionSaveTimer = window.setTimeout(() => {
      sessionSaveTimer = null;
      void persistSession(platformStore, captureCurrentSession());
    }, 500);
  };
```
  (Import `SessionData` type from `./session/session`.)
- Add a 30s backstop interval near where autosave used to start:
```ts
  window.setInterval(() => {
    void persistSession(platformStore, captureCurrentSession());
  }, AUTOSAVE_INTERVAL);
```
  (Import `AUTOSAVE_INTERVAL` from `./autosave/constants`.)
- Call `scheduleSessionSave()` from: end of `handleDocChange`, end of `commitDocument` (replacing the `clearDraft(platformStore)` call — session capture now reflects the saved/clean state), end of `createNewTab`, end of `closeTab`, end of `switchToTab`, and inside the `onPathChange` callback.
- Remove the now-unused `clearDraft` import if no longer referenced.

- [ ] **Step 7: Run the e2e + typecheck**

Run: `npx playwright test test/e2e/session-restore.spec.ts` → both tests PASS.
Run: `pnpm typecheck` → 0 errors.
Run: `pnpm test` → full unit suite green (confirm no test relied on the removed recovery prompt; if `test/autosave/recovery.test.ts` exists it may still pass since `recovery.ts` remains on disk — only its use in main.ts is removed).

- [ ] **Step 8: Commit**

```bash
git add src/main.ts electron/main.ts test/e2e/session-restore.spec.ts
git commit -m "feat: silent session restore replacing crash-recovery prompt"
```

---

## Task 7: External-change IPC plumbing (`watch:setPaths` + `file:changed` push + watch-plan core)

**Files:**
- Create: `src/watch/watch-plan.ts` (pure)
- Create: `electron/file-watcher.ts` (main-process watcher)
- Modify: `src/platform/contract.ts` (`setWatchedPaths`, `onFileChanged`)
- Modify: `electron/preload.ts` (bridge both)
- Modify: `electron/main.ts` (call `setupFileWatcher` in `app.whenReady`)
- Modify: `src/platform/index.ts` (wrappers)
- Test: `test/watch/watch-plan.test.ts`

**Interfaces:**
- Produces:
  - `groupByDir(paths: string[]): Record<string, string[]>` — dir → basenames.
  - `dirDiff(current: string[], next: string[]): { toWatch: string[]; toUnwatch: string[] }`.
  - `GraphvizApi.setWatchedPaths(paths: string[]): Promise<void>`
  - `GraphvizApi.onFileChanged(cb: (path: string) => void): () => void`
  - `setupFileWatcher(): void` (registers `watch:setPaths`, watches dirs, pushes `file:changed`).
  - `setWatchedPaths`, `onFileChanged` wrappers from `src/platform`.

- [ ] **Step 1: Write the failing test for the pure core**

```ts
// test/watch/watch-plan.test.ts
import { describe, expect, it } from 'vitest';
import { dirDiff, groupByDir } from '../../src/watch/watch-plan';

describe('groupByDir', () => {
  it('groups basenames under their parent directory', () => {
    const g = groupByDir(['C:/a/x.dot', 'C:/a/y.dot', 'C:/b/z.dot']);
    expect(new Set(g['C:/a'])).toEqual(new Set(['x.dot', 'y.dot']));
    expect(g['C:/b']).toEqual(['z.dot']);
  });
  it('handles an empty list', () => {
    expect(groupByDir([])).toEqual({});
  });
});

describe('dirDiff', () => {
  it('computes directories to start and stop watching', () => {
    expect(dirDiff(['C:/a', 'C:/b'], ['C:/b', 'C:/c'])).toEqual({
      toWatch: ['C:/c'],
      toUnwatch: ['C:/a'],
    });
  });
  it('is empty when unchanged', () => {
    expect(dirDiff(['C:/a'], ['C:/a'])).toEqual({ toWatch: [], toUnwatch: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/watch/watch-plan.test.ts`
Expected: FAIL — `src/watch/watch-plan` missing.

- [ ] **Step 3: Implement the pure core**

```ts
// src/watch/watch-plan.ts
// Pure helpers for the main-process file watcher. No Electron/fs imports so the
// logic is unit-testable and reusable from both processes.

function dirname(p: string): string {
  const n = p.replace(/\\/g, '/');
  const i = n.lastIndexOf('/');
  return i > 0 ? n.slice(0, i) : i === 0 ? '/' : '.';
}

function basename(p: string): string {
  const n = p.replace(/\\/g, '/');
  const i = n.lastIndexOf('/');
  return i >= 0 ? n.slice(i + 1) : n;
}

/** Group file paths by their parent directory → list of basenames. */
export function groupByDir(paths: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of paths) {
    const dir = dirname(p);
    (out[dir] ??= []).push(basename(p));
  }
  return out;
}

/** Directories to start/stop watching given the current and next dir sets. */
export function dirDiff(
  current: string[],
  next: string[]
): { toWatch: string[]; toUnwatch: string[] } {
  const cur = new Set(current);
  const nxt = new Set(next);
  return {
    toWatch: next.filter((d) => !cur.has(d)),
    toUnwatch: current.filter((d) => !nxt.has(d)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/watch/watch-plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the main-process watcher**

```ts
// electron/file-watcher.ts
import { type FSWatcher, watch } from 'node:fs';
import path from 'node:path';
import { BrowserWindow, ipcMain } from 'electron';
import { dirDiff, groupByDir } from '../src/watch/watch-plan';

const DEBOUNCE_MS = 200;

/** Registers the watch:setPaths handler and pushes file:changed on disk edits. */
export function setupFileWatcher(): void {
  const watchers = new Map<string, FSWatcher>();
  let basenamesByDir: Record<string, string[]> = {};
  const timers = new Map<string, NodeJS.Timeout>();

  const emit = (fullPath: string) => {
    const existing = timers.get(fullPath);
    if (existing) clearTimeout(existing);
    timers.set(
      fullPath,
      setTimeout(() => {
        timers.delete(fullPath);
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send('file:changed', fullPath);
        }
      }, DEBOUNCE_MS)
    );
  };

  ipcMain.handle('watch:setPaths', (_e, paths: string[]) => {
    const next = groupByDir(paths);
    const { toWatch, toUnwatch } = dirDiff(Object.keys(basenamesByDir), Object.keys(next));
    for (const dir of toUnwatch) {
      watchers.get(dir)?.close();
      watchers.delete(dir);
    }
    for (const dir of toWatch) {
      try {
        const w = watch(dir, (_event, filename) => {
          if (!filename) return;
          const base = path.basename(filename.toString());
          if ((basenamesByDir[dir] ?? []).includes(base)) emit(path.join(dir, base));
        });
        watchers.set(dir, w);
      } catch {
        // Directory may be unwatchable (removed/permission); ignore.
      }
    }
    basenamesByDir = next;
  });
}
```

- [ ] **Step 6: Add `watch:setPaths` + `file:changed` to the bridge layers**

`src/platform/contract.ts` — add to `GraphvizApi`:
```ts
  setWatchedPaths(paths: string[]): Promise<void>;
  onFileChanged(cb: (path: string) => void): () => void;
```

`electron/preload.ts` — add to `api`:
```ts
  setWatchedPaths: (paths) => ipcRenderer.invoke('watch:setPaths', paths),
  onFileChanged: (cb) => {
    const listener = (_e: unknown, p: string) => cb(p);
    ipcRenderer.on('file:changed', listener);
    return () => ipcRenderer.removeListener('file:changed', listener);
  },
```

`src/platform/index.ts` — add wrappers:
```ts
export function setWatchedPaths(paths: string[]): Promise<void> {
  return window.graphviz.setWatchedPaths(paths);
}

export function onFileChanged(cb: (path: string) => void): () => void {
  return window.graphviz.onFileChanged(cb);
}
```

`electron/main.ts` — import and call in `app.whenReady().then(...)`, alongside `registerIpc()`:
```ts
import { setupFileWatcher } from './file-watcher';
// ...
  registerIpc();
  setupFileWatcher();
  createWindow();
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run test/watch/watch-plan.test.ts` → PASS.
Run: `pnpm typecheck` → 0 errors (verify preload/main compile against the electron tsconfig).

- [ ] **Step 8: Commit**

```bash
git add src/watch/watch-plan.ts electron/file-watcher.ts src/platform/contract.ts \
  electron/preload.ts electron/main.ts src/platform/index.ts test/watch/watch-plan.test.ts
git commit -m "feat: file-watch IPC plumbing (watch:setPaths + file:changed push)"
```

---

## Task 8: External-change reload policy + renderer wiring

**Files:**
- Create: `src/watch/file-watch.ts` (renderer wiring)
- Modify: `src/main.ts` (reload policy `onExternalChange`; sync watched paths on tab/path changes)
- Modify: `electron/main.ts` (`GVJS_E2E_CONFIRM` stub in `dialog:confirm`)
- Test: `test/e2e/external-change.spec.ts`

**Interfaces:**
- Consumes: `onFileChanged`, `setWatchedPaths`, `readTextFile`, `confirm` from `src/platform`; `tabManager`, `switchToTab` (existing).
- Produces:
  - `setupFileWatch(options: FileWatchOptions): { sync: () => void; dispose: () => void }` where
    `FileWatchOptions = { getOpenPaths: () => string[]; onExternalChange: (path: string) => void | Promise<void> }`.

- [ ] **Step 1: Add the confirm test seam to `electron/main.ts`**

In `registerIpc()`, alongside the other stubs:
```ts
  const stubConfirm = process.env.GVJS_E2E_CONFIRM; // 'ok' | 'cancel'
```
At the top of the `dialog:confirm` handler:
```ts
  ipcMain.handle('dialog:confirm', async (_e, message: string, opts?: ConfirmOptions) => {
    if (stubConfirm) return stubConfirm === 'ok';
    // ...existing native showMessageBox path unchanged...
```

- [ ] **Step 2: Implement the renderer watch wiring**

```ts
// src/watch/file-watch.ts
import { onFileChanged, setWatchedPaths } from '../platform';

export interface FileWatchOptions {
  getOpenPaths: () => string[];
  onExternalChange: (path: string) => void | Promise<void>;
}

/** Subscribe to external file changes and keep the main-process watch set in sync. */
export function setupFileWatch({ getOpenPaths, onExternalChange }: FileWatchOptions): {
  sync: () => void;
  dispose: () => void;
} {
  const unsubscribe = onFileChanged((path) => {
    void onExternalChange(path);
  });
  const sync = () => {
    void setWatchedPaths(getOpenPaths());
  };
  sync();
  return { sync, dispose: unsubscribe };
}
```

- [ ] **Step 3: Wire the policy in `main.ts`**

Add imports: `import { setupFileWatch } from './watch/file-watch';` and ensure `readTextFile`, `confirm` are imported from `./platform`.

Add a helper and set up the watch after the initial tab exists (e.g., after session restore, before `setupToolbarActions`):
```ts
  function openPaths(): string[] {
    return tabManager
      .getAllTabs()
      .map((t) => t.filePath)
      .filter((p): p is string => p !== null);
  }

  function basename(p: string): string {
    const n = p.replace(/\\/g, '/');
    const i = n.lastIndexOf('/');
    return i >= 0 ? n.slice(i + 1) : n;
  }

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
  }

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
          `"${basename(changedPath)}" changed on disk. Reload and discard your edits?`,
          { title: 'File Changed', kind: 'warning' }
        );
        if (proceed) applyReload(tab, disk);
      }
    }
  }

  const fileWatch = setupFileWatch({ getOpenPaths: openPaths, onExternalChange });
```
Call `fileWatch.sync()` wherever the open-path set can change: end of `createNewTab`, `closeTab`, and inside `onOpen`, `onPathChange`, and `onPickRecent`. (These already exist; add `fileWatch.sync();` after the tab/path mutation in each.)

- [ ] **Step 4: Write the e2e test**

```ts
// test/e2e/external-change.spec.ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('a clean tab auto-reloads when its file changes on disk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gvjs-ext-'));
  const file = join(dir, 'watched.dot');
  writeFileSync(file, 'digraph { before_edit }', 'utf-8');

  const app = await electron.launch({ args: ['.'], env: { ...process.env, GVJS_E2E_OPEN: file } });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();
  await page.locator('[data-action="open-diagram"]').click();
  await expect(page.locator('#editor-host')).toContainText('before_edit');

  writeFileSync(file, 'digraph { after_edit }', 'utf-8');
  await expect(page.locator('#editor-host')).toContainText('after_edit', { timeout: 5000 });
  await app.close();
});

test('a dirty tab keeps edits when the reload prompt is cancelled', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gvjs-ext-dirty-'));
  const file = join(dir, 'watched.dot');
  writeFileSync(file, 'digraph { base }', 'utf-8');

  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, GVJS_E2E_OPEN: file, GVJS_E2E_CONFIRM: 'cancel' },
  });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();
  await page.locator('[data-action="open-diagram"]').click();

  // Make the tab dirty.
  await page.locator('.cm-content').click();
  await page.keyboard.type(' // my edit');
  await expect(page.locator('[data-status="file"]')).toContainText('Unsaved');

  // Change the file on disk; cancel the reload -> edit is preserved.
  writeFileSync(file, 'digraph { changed_on_disk }', 'utf-8');
  await expect(page.locator('#editor-host')).toContainText('my edit', { timeout: 5000 });
  await expect(page.locator('#editor-host')).not.toContainText('changed_on_disk');
  await app.close();
});
```

- [ ] **Step 5: Run the suites + full gate**

Run: `npx playwright test test/e2e/external-change.spec.ts` → PASS.
Run: `pnpm test` → all unit green.
Run: `pnpm test:e2e` → all e2e green.
Run: `pnpm typecheck` → 0 errors. Run: `pnpm lint` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/watch/file-watch.ts src/main.ts electron/main.ts test/e2e/external-change.spec.ts
git commit -m "feat: external-change reload (clean auto-reload, dirty prompt)"
```

---

## Task 9: Release v1.3.0

**Files:**
- Modify: `package.json` (`version` → `1.3.0`)
- Modify: `CHANGELOG.md` (new `## [1.3.0]` section)

- [ ] **Step 1: Bump the version**

Set `package.json` `"version": "1.3.0"`.

- [ ] **Step 2: Add the changelog entry**

```markdown
## [1.3.0] - 2026-07-03

### Added
- Recent files menu — reopen recently opened or saved diagrams from the toolbar.
- Save As (Ctrl+Shift+S) — save the current diagram to a new path.
- Silent session restore — reopens the tabs (with unsaved edits and per-tab
  engine) you had open last launch; replaces the old crash-recovery prompt.
- Per-document layout engine — each tab remembers its own dot/neato/fdp/… engine.
- External-change reload — a diagram edited by another program reloads
  automatically when clean, or prompts before discarding your unsaved edits.
```

- [ ] **Step 3: Verify the gate once more**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 0 errors, clean, all green.

- [ ] **Step 4: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore: release v1.3.0 (Documents & persistence)"
```

- [ ] **Step 5: Finish the branch**

Use superpowers:finishing-a-development-branch. Then push, open a PR against `master`, merge, tag `v1.3.0`, and publish a GitHub release titled `GraphvizJS v1.3.0 — Documents & persistence` with the built Windows installer attached (mirror the v1.2.0 release flow).

---

## Self-Review

**Spec coverage:**
- Recent files → Tasks 1, 2. ✓
- Save As → Task 3. ✓
- Session restore (silent) + retire crash recovery → Tasks 5, 6. ✓
- Per-doc layout engine → Task 4. ✓
- External-change reload (clean auto / dirty prompt) → Tasks 7, 8. ✓
- New IPC (`fs:readText`, `watch:setPaths`, `file:changed` push) → Tasks 2, 7. ✓
- `GVJS_E2E_CONFIRM` + `GVJS_E2E_USERDATA` seams → Tasks 8, 6. ✓
- v1.3.0 release → Task 9. ✓
- First-launch parity constraint → Task 6, parity e2e. ✓

**Type consistency:** `SessionTab`/`CapturableTab` shape identical across Tasks 5–6; `createNewTab(content, filePath, engine, savedContent)` signature defined in Task 6 and used consistently; `readTextFile` introduced in Task 2 and reused in Task 8; `layoutEngine` field (Task 4) consumed by capture (Task 5) and restore (Task 6); `dirDiff`/`groupByDir` defined in Task 7 and used by the watcher there.

**Ordering:** Task 4 (engine field) precedes Tasks 5–6 (session captures engine); Task 2 (`readTextFile`) precedes Task 8 (reload reads disk); Task 7 (push channel) precedes Task 8 (renderer subscribes).

**Placeholder scan:** none — every code step carries complete code.
