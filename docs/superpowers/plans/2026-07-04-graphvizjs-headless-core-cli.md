# Headless Core + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all diagram render/export into a Node-only `core/` consumed by the Electron main process and a new `bin` CLI; the renderer holds zero Graphviz and drives preview/lint/export over IPC.

**Architecture:** `core/` (render via `@hpcc-js/wasm`; export SVG/PNG/PDF via string-normalize + `@resvg/resvg-js` + jsPDF/svg2pdf/jsdom/canvas). `electron/main.ts` exposes `render:svg` / `render:validate` / `export:render`. `cli/index.ts` (`bin: graphvizjs`) calls the core directly. The renderer's preview, linter, and export become IPC calls. Build the core + spike first, then IPC, then CLI, then re-seat the renderer one path at a time — each task keeps the app compiling and green via temporary re-export shims.

**Tech Stack:** TypeScript, Electron, `@hpcc-js/wasm`, `@resvg/resvg-js`, `jspdf` + `svg2pdf.js` + `jsdom` + `canvas`, Vitest (Node unit), Playwright `_electron` (e2e), tsx (CLI), Biome.

## Global Constraints

- Ships as **v2.0.0** — bump `package.json`; add `CHANGELOG.md` `## [2.0.0]`.
- Default branch **`master`**; tag `v2.0.0`; release title `GraphvizJS v2.0.0 — Headless core + CLI`.
- Windows-only build (electron-builder win nsis; CI windows-latest). Native deps (`@resvg/resvg-js`, `canvas`) must bundle via `@electron/rebuild` (already in the packaging step).
- **Behavior parity (binding):** preview, linting, and every export (SVG, PNG @1x/@2x, PDF fit/standard) produce output equivalent to v1.4.0.
- **Renderer purity (binding, final state):** after Task 11, `grep -r "@hpcc-js/wasm" src/` is empty and no `src/` module imports a runtime `core/` value (type-only imports allowed).
- Real types to reuse verbatim: `LayoutEngine` (8 engines), `DotValidationError { message; line?; column? }`, `PdfExportOptions { mode: 'fit'|'standard'; pageSize: 'letter'|'a4'; orientation: 'auto'|'portrait'|'landscape' }`, `ExportFormat = 'png'|'pngx2'|'svg'|'pdf'`.
- PNG constants (verbatim): `PNG_MIN_BASE = 512`, `PNG_MIN_DOUBLE = 1024`, `EXPORT_PADDING = 10`.
- Biome: 2-space, single quotes, semicolons, trailing commas, 100-col, no `any`.
- No dep may trip pnpm 11's `core-js` build-script gate.

---

## Task 1: De-risking spike — native deps + headless PNG/PDF

**Goal:** Prove `@resvg/resvg-js`, `jsdom`, and `canvas` (node-canvas) render a fixture SVG to PNG and to **vector** PDF headless, and confirm the exact working API. Decide vector-vs-raster PDF before building on it.

**Files:**
- Modify: `package.json` (add deps)
- Create (throwaway, deleted at end of task): `scratch-spike.mjs`

- [ ] **Step 1: Install the native deps**

```bash
pnpm add @resvg/resvg-js jsdom canvas
```
Expected: installs with prebuilt binaries. If `canvas` fails to build on Windows, record the exact error — that triggers the raster fallback (Step 4).

- [ ] **Step 2: Prove PNG + vector PDF headless**

Write `scratch-spike.mjs` at repo root that: (a) uses the repo's `@hpcc-js/wasm` to render `digraph { a -> b }` to an SVG string; (b) rasterizes it with `@resvg/resvg-js` to PNG bytes and asserts the PNG magic (`0x89 0x50 0x4E 0x47`); (c) builds a jsdom `window`, sets `global.document`/`DOMParser` from it, requires `canvas`, and runs `jspdf` (Node build) + `svg2pdf.js` on a parsed SVG element to produce PDF bytes, asserting the `%PDF-` header. Run with `node scratch-spike.mjs` (or `tsx`). Capture the exact working invocation of resvg (`new Resvg(svg, { fitTo:{mode:'width',value}, background:'#ffffff' }).render().asPng()`) and the jsdom-globals setup that makes `svg2pdf` succeed.

- [ ] **Step 3: Confirm packaging viability**

Confirm `@resvg/resvg-js` and `canvas` appear as `dependencies` (not dev) so electron-builder bundles them, and that `pnpm package` (electron-builder + `@electron/rebuild`) completes with them present. (A full package build is slow; at minimum confirm `@electron/rebuild` does not reject them — build can be the release step's responsibility, but note any rebuild error here.)

- [ ] **Step 4: Decision + record**

If vector PDF worked: proceed with jsdom+canvas for `core/export-pdf.ts` (Task 5). If `canvas` will not install/package: switch Task 5 to the **raster fallback** — rasterize via resvg to PNG, embed with `doc.addImage(png, 'PNG', x, y, w, h)` in jsPDF (no node-canvas), losing true vector. Record the decision (vector vs raster) in the task report; it governs Task 5.

- [ ] **Step 5: Clean up + commit deps**

Delete `scratch-spike.mjs`. Commit only the `package.json`/lockfile dep additions.
```bash
rm scratch-spike.mjs
git add package.json pnpm-lock.yaml
git commit -m "build: add @resvg/resvg-js, jsdom, canvas for headless export (spike verified)"
```

---

## Task 2: `core/types.ts` + `core/render.ts` (relocate render+validate)

**Files:**
- Create: `core/types.ts`, `core/render.ts`
- Modify: `src/preview/graphviz.ts` → temporary re-export shim
- Modify: `tsconfig.json` (include `core/**/*.ts`, `cli/**/*.ts`)
- Test: `test/core/render.test.ts`

**Interfaces:**
- Produces: `core/types.ts` — `LayoutEngine`, `DotValidationError`, `ExportFormat`, `PdfExportOptions` (with `pageSize`), `ExportResult { bytes: Uint8Array; ext: string; mime: string }`.
- `core/render.ts` — `initGraphviz()`, `renderDotToSvg(dot, engine?)`, `validateDot(dot, engine?)`, `isGraphvizReady()` (moved verbatim from `src/preview/graphviz.ts`, importing types from `./types`).

- [ ] **Step 1: Write the failing test** (`test/core/render.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { renderDotToSvg, validateDot } from '../../core/render';

describe('core/render', () => {
  it('renders DOT to an SVG string', async () => {
    const svg = await renderDotToSvg('digraph { a -> b }', 'dot');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
  it('validates: null for valid, error for invalid', async () => {
    expect(await validateDot('digraph { a -> b }')).toBeNull();
    const err = await validateDot('digraph { a -> ');
    expect(err).not.toBeNull();
    expect(err?.message).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to fail** — `npx vitest run test/core/render.test.ts` → FAIL (module missing).

- [ ] **Step 3: Create the core modules**

- `core/types.ts`: define `LayoutEngine` (the 8-member union), `DotValidationError { message: string; line?: number; column?: number }`, `ExportFormat = 'png'|'pngx2'|'svg'|'pdf'`, `PdfPageMode`/`PdfPageSize`/`PdfOrientation` + `PdfExportOptions { mode: PdfPageMode; pageSize: PdfPageSize; orientation: PdfOrientation }`, `ExportResult { bytes: Uint8Array; ext: string; mime: string }`.
- `core/render.ts`: copy the body of `src/preview/graphviz.ts` (initGraphviz, renderDotToSvg, validateDot, isGraphvizReady, parseErrorLocation) verbatim, but `import type { LayoutEngine, DotValidationError } from './types'` and remove the local type declarations (they now live in `types.ts`).
- Turn `src/preview/graphviz.ts` into a temporary shim so existing importers keep working:
```ts
// src/preview/graphviz.ts — TEMPORARY shim; removed in Task 11.
export type { LayoutEngine, DotValidationError } from '../../core/types';
export { initGraphviz, renderDotToSvg, validateDot, isGraphvizReady } from '../../core/render';
```
- `tsconfig.json`: add `"core/**/*.ts"` and `"cli/**/*.ts"` to `include`.

- [ ] **Step 4: Run to pass** — `npx vitest run test/core/render.test.ts` → PASS. `pnpm typecheck` → 0. `pnpm test` → full suite green (renderer still works through the shim). `pnpm lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add core/types.ts core/render.ts src/preview/graphviz.ts tsconfig.json test/core/render.test.ts
git commit -m "feat(core): relocate DOT render + validate into core/ (shim keeps renderer working)"
```

---

## Task 3: `core/normalize-svg.ts` (string-based SVG normalization)

**Files:**
- Create: `core/normalize-svg.ts`
- Test: `test/core/normalize-svg.test.ts`

**Interfaces:**
- Produces: `normalizeSvg(svg: string, padding?: number): { svg: string; width: number; height: number }` — parses the Graphviz SVG root's `viewBox` (user units) plus `width`/`height`, applies `EXPORT_PADDING` (default 10) to width/height/viewBox, sets `preserveAspectRatio`, and returns the rewritten string + padded pixel dims. Pure string ops (regex/attribute rewrite), NO DOM.

**Design note:** Graphviz SVG output always carries `viewBox="minX minY W H"` and `width`/`height` on the root `<svg>`. Derive `{width,height}` from the viewBox W/H (user units — equivalent to the old `getBBox` path), add `padding*2`, shift `viewBox` min by `-padding`, and set the root `width`/`height` to the padded pixel values. Reuse `sanitizeDimension` (≥1) semantics.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { renderDotToSvg } from '../../core/render';
import { normalizeSvg } from '../../core/normalize-svg';

describe('normalizeSvg', () => {
  it('adds padding to a Graphviz SVG and reports padded dims', async () => {
    const raw = await renderDotToSvg('digraph { a -> b }', 'dot');
    const { svg, width, height } = normalizeSvg(raw, 10);
    expect(width).toBeGreaterThan(20); // content + 2*10 padding
    expect(height).toBeGreaterThan(20);
    expect(svg).toMatch(/viewBox="/);
    expect(svg).toContain(`width="${width}"`);
    expect(svg).toContain(`height="${height}"`);
  });
  it('is idempotent-safe on already-normalized input (no NaN)', async () => {
    const raw = await renderDotToSvg('digraph { a }', 'dot');
    const once = normalizeSvg(raw);
    const twice = normalizeSvg(once.svg);
    expect(Number.isFinite(twice.width)).toBe(true);
    expect(Number.isFinite(twice.height)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to fail** — module missing.

- [ ] **Step 3: Implement** `core/normalize-svg.ts` per the design note (regex-extract `viewBox` + `width`/`height`; recompute; rewrite the root `<svg ...>` opening tag's attributes; leave the body untouched). No `@hpcc-js/wasm`/DOM imports.

- [ ] **Step 4: Run to pass** — test green, `pnpm typecheck` 0, `pnpm lint` clean.

- [ ] **Step 5: Commit**

```bash
git add core/normalize-svg.ts test/core/normalize-svg.test.ts
git commit -m "feat(core): string-based SVG normalization (replaces getBBox path)"
```

---

## Task 4: `core/export-png.ts` (@resvg/resvg-js)

**Files:**
- Create: `core/export-png.ts`
- Test: `test/core/export-png.test.ts`

**Interfaces:**
- Produces: `toPngBytes(svg: string, width: number, height: number, scale: 1 | 2): Uint8Array` — reproduces the old scale math (`minDimension = scale>1 ? 1024 : 512`; `requiredScale = max(scale, minDim/width, minDim/height)`; `exportWidth = round(width*requiredScale)`), white background, using resvg with the working invocation confirmed in the Task 1 spike.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { renderDotToSvg } from '../../core/render';
import { normalizeSvg } from '../../core/normalize-svg';
import { toPngBytes } from '../../core/export-png';

describe('toPngBytes', () => {
  it('produces a PNG (magic bytes) at ~scaled dimensions', async () => {
    const { svg, width, height } = normalizeSvg(await renderDotToSvg('digraph { a -> b }'));
    const png = toPngBytes(svg, width, height, 1);
    expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const png2 = toPngBytes(svg, width, height, 2);
    expect(png2.length).toBeGreaterThan(png.length); // @2x is larger
  });
});
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement** using the spike-confirmed resvg call, e.g.:
```ts
import { Resvg } from '@resvg/resvg-js';
const PNG_MIN_BASE = 512, PNG_MIN_DOUBLE = 1024;
export function toPngBytes(svg: string, width: number, height: number, scale: 1 | 2): Uint8Array {
  const minDim = scale > 1 ? PNG_MIN_DOUBLE : PNG_MIN_BASE;
  const requiredScale = Math.max(scale, minDim / width, minDim / height);
  const exportWidth = Math.max(1, Math.round(width * requiredScale));
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: exportWidth },
    background: '#ffffff',
  }).render().asPng();
  return new Uint8Array(png);
}
```
(Adjust to the exact resvg-js API surface confirmed in the spike.)

- [ ] **Step 4: Run to pass** — test green, typecheck 0, lint clean.

- [ ] **Step 5: Commit**

```bash
git add core/export-png.ts test/core/export-png.test.ts
git commit -m "feat(core): headless PNG export via @resvg/resvg-js"
```

---

## Task 5: `core/export-pdf.ts` (relocate + headless PDF)

**Files:**
- Modify: `git mv src/preview/export-pdf.ts core/export-pdf.ts`
- Modify: `src/preview/export-pdf.ts` → temporary type shim (for `pdf-options-dialog.ts`)
- Test: `test/core/export-pdf.test.ts`

**Interfaces:**
- `computePageGeometry(widthPx, heightPx, options)` — unchanged (pure). `svgToPdfBytes(svg, width, height, options): Promise<Uint8Array>` — adapted to headless: `parseSvg` uses a jsdom `DOMParser` and the process sets up jsdom globals + `canvas` so `svg2pdf`'s text measurement works (per the Task 1 spike). Types import from `./types`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { renderDotToSvg } from '../../core/render';
import { normalizeSvg } from '../../core/normalize-svg';
import { svgToPdfBytes, computePageGeometry } from '../../core/export-pdf';

describe('core/export-pdf', () => {
  it('computePageGeometry fit = diagram bounds in pt', () => {
    const g = computePageGeometry(96, 48, { mode: 'fit', pageSize: 'letter', orientation: 'auto' });
    expect(g.pageWidth).toBeCloseTo(72); // 96px * 72/96
    expect(g.draw.width).toBeCloseTo(72);
  });
  it('produces vector PDF bytes headless', async () => {
    const { svg, width, height } = normalizeSvg(await renderDotToSvg('digraph { a -> b }'));
    const pdf = await svgToPdfBytes(svg, width, height, { mode: 'fit', pageSize: 'letter', orientation: 'auto' });
    expect(String.fromCharCode(pdf[0], pdf[1], pdf[2], pdf[3])).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(500);
  });
});
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Relocate + adapt.** `git mv` the file into `core/`. Change `import { PdfExportOptions ... }` local types to import from `./types` (keep `computePageGeometry` verbatim). Replace `parseSvg`'s browser `DOMParser` with jsdom: create/reuse a module-level jsdom window and set `globalThis.DOMParser`/`document` (and require `canvas` so svg2pdf measures text) — use the exact setup the spike proved. If the spike chose the **raster fallback**, implement `svgToPdfBytes` by rasterizing via `toPngBytes` and `doc.addImage(...)` instead of `svg2pdf`, and note it.

Leave a temporary shim so `src/toolbar/pdf-options-dialog.ts`'s `import type { PdfExportOptions } from '../preview/export-pdf'` keeps working:
```ts
// src/preview/export-pdf.ts — TEMPORARY type shim; removed in Task 11.
export type { PdfExportOptions, PdfPageMode, PdfPageSize, PdfOrientation } from '../../core/types';
```
(Move those PDF option types into `core/types.ts` in Task 2 if not already; `pdf-options-dialog.ts` and `export-diagram.ts` reference them.)

- [ ] **Step 4: Run to pass** — test green (Vitest runs in Node; jsdom+canvas available), typecheck 0, lint clean. If PDF text measurement is flaky under Vitest's happy-dom env, mark the pdf test to run in a `node` environment (`// @vitest-environment node` at file top).

- [ ] **Step 5: Commit**

```bash
git add core/export-pdf.ts src/preview/export-pdf.ts core/types.ts test/core/export-pdf.test.ts
git commit -m "feat(core): headless PDF export (jsdom+canvas / raster per spike)"
```

---

## Task 6: `core/export.ts` orchestrator

**Files:**
- Create: `core/export.ts`
- Test: `test/core/export.test.ts`

**Interfaces:**
- Produces: `exportDiagram(dot: string, engine: LayoutEngine, format: ExportFormat, options?: PdfExportOptions): Promise<ExportResult>` — render → normalize → dispatch:
  - `svg` → `{ bytes: utf8(normalized.svg), ext: 'svg', mime: 'image/svg+xml' }`
  - `png` → scale 1; `pngx2` → scale 2 → `toPngBytes` → `{ ext:'png', mime:'image/png' }`
  - `pdf` → `svgToPdfBytes(normalized..., options ?? defaultPdfOptions)` → `{ ext:'pdf', mime:'application/pdf' }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { exportDiagram } from '../../core/export';

const DOT = 'digraph { a -> b }';
describe('exportDiagram', () => {
  it('svg → svg bytes', async () => {
    const r = await exportDiagram(DOT, 'dot', 'svg');
    expect(r.ext).toBe('svg');
    expect(new TextDecoder().decode(r.bytes)).toContain('<svg');
  });
  it('png/pngx2 → PNG magic; pdf → %PDF', async () => {
    const png = await exportDiagram(DOT, 'dot', 'png');
    expect([png.bytes[0], png.bytes[1]]).toEqual([0x89, 0x50]);
    const pdf = await exportDiagram(DOT, 'dot', 'pdf', { mode: 'fit', pageSize: 'letter', orientation: 'auto' });
    expect(String.fromCharCode(pdf.bytes[0], pdf.bytes[1])).toBe('%P');
  });
});
```

- [ ] **Step 2–4:** run fail → implement `core/export.ts` → run pass; typecheck 0, lint clean.

- [ ] **Step 5: Commit**

```bash
git add core/export.ts test/core/export.test.ts
git commit -m "feat(core): unified exportDiagram orchestrator"
```

---

## Task 7: IPC layer — main handlers + platform wrappers

**Files:**
- Modify: `src/platform/contract.ts` (3 methods), `electron/preload.ts` (3 bridges), `src/platform/index.ts` (3 wrappers)
- Modify: `electron/main.ts` (3 handlers + `initGraphviz()` in `whenReady`)
- Test: (typecheck-only; behavior verified when consumers re-seat in Tasks 9–11)

**Interfaces:**
- `renderSvg(dot, engine): Promise<string>` → `render:svg`
- `validateDot(dot, engine): Promise<DotValidationError | null>` → `render:validate`
- `exportRender(dot, engine, format, options?): Promise<Uint8Array>` → `export:render`

- [ ] **Step 1: Contract + preload + platform**

`src/platform/contract.ts` — import the core types and add to `GraphvizApi`:
```ts
import type { DotValidationError, ExportFormat, LayoutEngine, PdfExportOptions } from '../../core/types';
// ...in GraphvizApi:
  renderSvg(dot: string, engine: LayoutEngine): Promise<string>;
  validateDot(dot: string, engine: LayoutEngine): Promise<DotValidationError | null>;
  exportRender(dot: string, engine: LayoutEngine, format: ExportFormat, options?: PdfExportOptions): Promise<Uint8Array>;
```
`electron/preload.ts` — add invoke bridges for `render:svg`, `render:validate`, `export:render`.
`src/platform/index.ts` — add the three wrappers (delegating to `window.graphviz.*`), re-exporting types from `../../core/types` as needed.

- [ ] **Step 2: Main handlers**

`electron/main.ts` — import from `../core`:
```ts
import { initGraphviz, renderDotToSvg, validateDot } from '../core/render';
import { exportDiagram } from '../core/export';
```
In `registerIpc()`:
```ts
  ipcMain.handle('render:svg', (_e, dot: string, engine) => renderDotToSvg(dot, engine));
  ipcMain.handle('render:validate', (_e, dot: string, engine) => validateDot(dot, engine));
  ipcMain.handle('export:render', async (_e, dot: string, engine, format, options) =>
    (await exportDiagram(dot, engine, format, options)).bytes
  );
```
In `app.whenReady().then(...)`, before/around `createWindow()`, add `void initGraphviz();` (eager WASM load in main).

- [ ] **Step 2b: Verify the boundary check still holds**

`export:render`/`render:*` are handle channels; the dependency-graph IPC test's wired-channel set grows by 3 (`render:svg`, `render:validate`, `export:render`). Update `test/tools/ipc.test.ts` + `test/tools/index.test.ts` to the new count (13 → 16) and add the three channels to the expected sorted list.

- [ ] **Step 3: Run** — `pnpm typecheck` 0, `pnpm lint` clean, `pnpm graph` → IPC ✅ 16 / 0 gaps (then `git checkout -- docs/architecture/`), `pnpm test` (tool tests updated) green.

- [ ] **Step 4: Commit**

```bash
git add src/platform/contract.ts electron/preload.ts src/platform/index.ts electron/main.ts test/tools/ipc.test.ts test/tools/index.test.ts
git commit -m "feat: core IPC channels (render:svg/validate, export:render) + main init"
```

---

## Task 8: CLI (`cli/index.ts`, `bin: graphvizjs`)

**Files:**
- Create: `cli/index.ts`, `cli/args.ts`
- Modify: `package.json` (`bin`, a `graphvizjs` script)
- Test: `test/cli/args.test.ts`, `test/cli/cli.integration.test.ts`

**Interfaces:**
- `parseArgs(argv: string[]): { command: 'render'|'help'|'version'; input?: string; output?: string; engine: LayoutEngine; format?: ExportFormat; scale: 1|2; pdf: PdfExportOptions } | { error: string }` (pure).
- `main(argv): Promise<number>` — reads DOT (file or `-` stdin), calls `exportDiagram`, writes bytes via `node:fs`, returns exit code.

- [ ] **Step 1: Failing arg-parser test** (`test/cli/args.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../cli/args';

describe('parseArgs', () => {
  it('parses render with engine/format/scale', () => {
    const a = parseArgs(['render', 'in.dot', '-o', 'out.png', '--engine', 'neato', '--scale', '2']);
    expect(a).toMatchObject({ command: 'render', input: 'in.dot', output: 'out.png', engine: 'neato', scale: 2 });
  });
  it('infers format from output extension', () => {
    expect(parseArgs(['render', 'in.dot', '-o', 'out.pdf'])).toMatchObject({ format: 'pdf' });
  });
  it('errors on unknown engine / missing output', () => {
    expect('error' in parseArgs(['render', 'in.dot', '-o', 'x.svg', '--engine', 'bogus'])).toBe(true);
    expect('error' in parseArgs(['render', 'in.dot'])).toBe(true);
  });
  it('recognizes --help / --version', () => {
    expect(parseArgs(['--help'])).toMatchObject({ command: 'help' });
    expect(parseArgs(['--version'])).toMatchObject({ command: 'version' });
  });
});
```

- [ ] **Step 2: Run fail → implement `cli/args.ts`** (pure parser; `png`+`--scale 2` maps to `format:'png', scale:2` which the core treats as `pngx2`; default format from `-o` extension, else `svg`; validate engine against the 8-member set).

- [ ] **Step 3: Implement `cli/index.ts`**

`main(argv)`: handle help/version (print + return 0); for `render`, read DOT from `input` (or stdin when `-`), call `exportDiagram(dot, engine, scale===2 && format==='png' ? 'pngx2' : format, pdf)`, `await fs.writeFile(output, result.bytes)`, return 0; on error print to stderr, return 1; bad args → usage to stderr, return 2. Self-invoke guard like the dep-graph tool (`if (import.meta.url === ...) process.exitCode = await main(process.argv.slice(2))`).
`package.json`: add `"bin": { "graphvizjs": "cli/index.ts" }` (run via tsx) and a script `"graphvizjs": "tsx cli/index.ts"`.

- [ ] **Step 4: Integration test** (`test/cli/cli.integration.test.ts`)

Write a fixture `.dot` to a temp dir, run the CLI entry (`tsx cli/index.ts render <fixture> -o <tmp>/out.svg` via `node:child_process`, or import `main` directly and pass argv), assert the output file exists with the right magic bytes for svg/png/pdf.

- [ ] **Step 5: Run** — `npx vitest run test/cli/` → PASS; `pnpm graphvizjs render <fixture> -o /tmp/x.png` produces a PNG; typecheck 0, lint clean.

- [ ] **Step 6: Commit**

```bash
git add cli/ package.json test/cli/
git commit -m "feat(cli): graphvizjs render CLI on the headless core"
```

---

## Task 9: Re-seat the live preview onto `render:svg`

**Files:**
- Modify: `src/preview/render.ts` (inject a `render` fn), `src/main.ts` (wire `renderSvg`)
- Test: extend `test/preview/render.test.ts`; e2e `test/e2e/rendering.spec.ts` (already covers preview-updates)

**Interfaces:**
- `createPreview`'s options gain `render: (dot: string, engine: LayoutEngine) => Promise<string>` (replaces the imported `renderDotToSvg`). `src/main.ts` passes `render: renderSvg` (platform IPC).

- [ ] **Step 1:** Update `test/preview/render.test.ts` to pass a `render` spy and assert the scheduler calls it and injects its resolved SVG (replacing any direct-`renderDotToSvg` mock).
- [ ] **Step 2:** Run fail.
- [ ] **Step 3:** In `render.ts`, remove `import { renderDotToSvg } from './graphviz'`; add `render` to `PreviewOptions`; change the render line to `const svg = await options.render(trimmed, getEngine())`. In `src/main.ts`, import `renderSvg` from `./platform` and pass it into `createPreview`.
- [ ] **Step 4:** Run pass. `npx playwright test test/e2e/rendering.spec.ts` → preview-update tests PASS (now IPC-backed). typecheck 0, lint clean.
- [ ] **Step 5: Commit** `git commit -m "feat: live preview renders via core IPC"`.

---

## Task 10: Re-seat the linter onto `render:validate`

**Files:**
- Modify: `src/editor/linting.ts` (inject a `validate` fn), `src/main.ts` (wire `validateDot`)
- Test: extend `test/editor/linting.test.ts`; e2e (invalid DOT shows marker)

**Interfaces:**
- `DotLinterOptions` gains `validate: (dot: string, engine: LayoutEngine) => Promise<DotValidationError | null>`. `createDotLinter` uses it instead of the imported `validateDot`. `src/main.ts` passes `validate: validateDot` (platform IPC).

- [ ] **Step 1–4:** Update the linter test to inject a `validate` spy; implement the injection (remove `import { validateDot } from '../preview/graphviz'`; keep the `LayoutEngine` type import — repoint to `../../core/types`); wire in `main.ts` (createDotLinter now gets `validate`). Run unit + the invalid-DOT e2e. typecheck 0, lint clean.
- [ ] **Step 5: Commit** `git commit -m "feat: DOT linting validates via core IPC"`.

---

## Task 11: Re-seat export + achieve renderer purity

**Files:**
- Rewrite: `src/toolbar/export-diagram.ts` (thin IPC caller)
- Delete shims: `src/preview/graphviz.ts`, `src/preview/export-pdf.ts`
- Modify: `src/main.ts` (drop the renderer `initGraphviz` import/call), type-import repoints, `package.json` (remove `@hpcc-js/wasm` from renderer usage — it stays a dep for core)
- Test: extend `test/toolbar/export-diagram.test.ts`; e2e `test/e2e/export.spec.ts`

**Interfaces:**
- `createExportHandler({ getEditor, getPath })` unchanged signature; body now: read DOT from editor → (pdf) `openPdfOptionsDialog()` → `pickSavePath(...)` → `exportRender(dot, engine, format, options)` → `writeBinaryFile(path, bytes)`. Needs the active engine — extend options to `{ getEditor, getPath, getEngine }` and wire `getEngine` from `main.ts` (active tab's engine).

- [ ] **Step 1:** Rewrite the export-diagram test to mock `../platform` `exportRender`/`pickSavePath`/`writeBinaryFile` and assert each format calls `exportRender` with the right args and writes the returned bytes (drop all canvas/DOM mocks).
- [ ] **Step 2:** Run fail.
- [ ] **Step 3: Rewrite `export-diagram.ts`.** Remove `renderDiagram`/`normalizeSvg`/`convertSvgToPng`/`loadImage`/`encodeSvgDataUri` and the `../preview/graphviz`/`../preview/export-pdf` imports. New flow (all formats): derive `baseName` via `inferBaseName` (keep it), pick save path with the right filter, call `exportRender(dot, engine, format, options)`, `writeBinaryFile(target, bytes)`. SVG can also use `writeBinaryFile` (bytes are UTF-8). PDF: `openPdfOptionsDialog()` first (cancel → return). Add `getEngine` to the options and use it. Update `src/toolbar/actions.ts` + `src/main.ts` to pass `getEngine: () => tabManager.getActiveTab()?.layoutEngine ?? 'dot'`.
- [ ] **Step 4: Purity.** Delete `src/preview/graphviz.ts` and `src/preview/export-pdf.ts` shims. Repoint any remaining `../preview/graphviz`/`../preview/export-pdf` type imports (`session.ts`, `tabs/manager.ts`, `toolbar/layout-engine.ts`, `pdf-options-dialog.ts`, `linting.ts`, `main.ts`) to `../../core/types` (or correct relative depth). In `src/main.ts` remove `import { initGraphviz }` and the `await initGraphviz()` call (main process now inits). Confirm `grep -r "@hpcc-js/wasm" src/` is EMPTY and `grep -rn "core/render\|core/export" src/` shows only type-only imports from `core/types` (no runtime core import in `src/`).
- [ ] **Step 5: Run** — `pnpm typecheck` 0, `pnpm lint` clean, `pnpm test` full unit green, `npx playwright test test/e2e/export.spec.ts test/e2e/rendering.spec.ts` green (all export formats + preview).
- [ ] **Step 6: Commit** `git commit -m "feat: export via core IPC; renderer holds zero Graphviz (purity)"`.

---

## Task 12: Dependency-graph coverage + release v2.0.0

**Files:**
- Modify: `tools/dependency-graph/*` (scan `core/` + `cli/`), tool tests
- Modify: `package.json` (version), `CHANGELOG.md`, `docs/architecture/*`

- [ ] **Step 1:** Extend the dep-graph tool's `buildAnalysis` to also scan `core/` and `cli/` (so the new layers are audited for unused/cycles and the render/export boundary is visible). Update `test/tools/index.test.ts` expectations (module count, fileCount) accordingly. Run `pnpm graph` → IPC ✅ 16, 0 cycles, and confirm no `src/` → `core/` runtime edge exists (renderer purity is now machine-checkable).
- [ ] **Step 2:** Bump `package.json` to `2.0.0`. Add `CHANGELOG.md`:
```markdown
## [2.0.0] - 2026-07-04

### Changed
- Re-architected so all diagram rendering and SVG/PNG/PDF export run in a headless
  Node core. The Electron renderer no longer contains Graphviz — it drives preview,
  linting, and export over IPC. Behavior is unchanged for GUI users.

### Added
- `graphvizjs` CLI: `graphvizjs render <input.dot> -o <output>` with
  `--engine/--format/--scale/--pdf-page/--pdf-orientation`, reading stdin via `-`.
  The GUI and CLI now share one render/export core.
```
- [ ] **Step 3: Gate** — `pnpm typecheck && pnpm lint && pnpm test && pnpm graph` all green; `pnpm build`; then `pnpm package` produces an installer with native deps bundled (this validates `@resvg/resvg-js` + `canvas` package correctly — the final proof of the Task 1 spike).
- [ ] **Step 4: Commit** `git commit -m "chore: dependency-graph covers core/+cli/; release v2.0.0"`.
- [ ] **Step 5: Finish the branch** — use superpowers:finishing-a-development-branch, then push, PR vs `master`, CI green, squash-merge, sync master (`git fetch` + `git reset --hard origin/master`), tag `v2.0.0`, build the installer, publish the GitHub release titled `GraphvizJS v2.0.0 — Headless core + CLI` with `release/GraphvizJS Setup 2.0.0.exe` attached (mirror the v1.4.0 flow).

---

## Self-Review

**Spec coverage:** headless core (render Task 2, normalize 3, png 4, pdf 5, orchestrator 6) ✓; renderer-zero-Graphviz via IPC (7) + re-seat preview/lint/export (9/10/11) ✓; CLI (8) ✓; native-dep spike + fallback (1) ✓; dep-graph coverage + release (12) ✓; renderer purity binding (Task 11 Step 4 grep) ✓; behavior parity (unit + e2e per re-seat task) ✓.

**Type consistency:** `PdfExportOptions` uses the real `{mode,pageSize,orientation}` shape everywhere; `ExportResult {bytes,ext,mime}` from `exportDiagram` (Task 6) → `export:render` returns `.bytes` (Task 7) → renderer writes bytes (Task 11); `LayoutEngine`/`DotValidationError`/`ExportFormat` sourced from `core/types` and type-imported by the renderer.

**Green-between-tasks:** temporary shims (`src/preview/graphviz.ts`, `src/preview/export-pdf.ts`) keep the app compiling from Task 2 until they're deleted in Task 11 after all value consumers move to IPC. IPC channels (Task 7) land before their renderer consumers (9–11). Tool-test channel counts updated in Task 7 (→16) and module coverage in Task 12.

**Placeholder scan:** none — new modules carry complete code; moved modules carry `git mv` + exact adaptations; resvg/jsdom exact API is pinned by the Task 1 spike.
