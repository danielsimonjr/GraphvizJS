# GraphvizJS — Headless render/export core + CLI (design spec)

**Date:** 2026-07-04
**Ships as:** v2.0.0
**Status:** Approved for planning

## Goal

Re-architect GraphvizJS so a **headless, Node-only `core/`** owns all diagram
work (DOT→SVG render, validate, and SVG/PNG/PDF export). The Electron **main
process** and a new **`bin` CLI** both consume that core. The **renderer keeps
no Graphviz at all** — it sends DOT over IPC and receives SVG / diagnostics /
export bytes. This realizes the intended architecture: the GUI is thin
presentation ("icing") on top of a back-end/CLI core ("cake").

## Context — how it works today (from architecture recon, 2026-07-04)

- **DOT→SVG render is already headless.** `src/preview/graphviz.ts`
  (`renderDotToSvg`, `validateDot`, `initGraphviz`, `LayoutEngine`) is pure
  string→string with zero DOM. `@hpcc-js/wasm` embeds its WASM binary (no
  file/URL to resolve), so `Graphviz.load()` runs in Node unchanged.
- **Render is invoked from the renderer today.** `src/preview/render.ts`
  (`createPreview`) injects `renderDotToSvg` output into `#preview-host`;
  `src/editor/linting.ts` calls `validateDot` for lint markers. Both run in the
  browser context.
- **Export renders from the editor text, not the on-screen SVG.**
  `src/toolbar/export-diagram.ts` `createExportHandler` reads
  `getEditor().state.doc.toString()`, re-renders via `renderDotToSvg`, then:
  - `normalizeSvg` (DOM: `getBBox`, `XMLSerializer`) to compute padded dims;
  - **SVG:** writes the normalized string (`writeTextFile`);
  - **PNG/PNGx2:** `convertSvgToPng` — `document.createElement('canvas')`,
    `new Image()`, `URL.createObjectURL`/`Blob`, `ctx.drawImage`,
    `canvas.toBlob` (fully browser-bound);
  - **PDF:** `src/preview/export-pdf.ts` `svgToPdfBytes` — `jsPDF` + `svg2pdf.js`
    on a live SVG DOM node (`DOMParser`); `svg2pdf` needs working text
    measurement (`canvas.measureText` / `getBBox`).
- **Bytes reach disk** via `pickSavePath` + `writeTextFile`/`writeBinaryFile`
  (`src/platform` → IPC → `electron/main.ts` `node:fs`). The export code depends
  only on those `platform` functions.
- `ExportFormat = 'png'|'pngx2'|'svg'|'pdf'` (`src/toolbar/export-menu.ts`).
  `PdfExportOptions` etc. in `src/preview/export-pdf.ts`.
  `src/toolbar/pdf-options-dialog.ts` is a `<dialog>` modal returning
  `PdfExportOptions | null`.
- The **dep-graph tool** (`tools/…`, run via `tsx`) proves Node/tsx execution
  and a self-invoking entry pattern the CLI will mirror. No `bin` field exists.

## Decisions (locked)

1. **Full re-seat.** The GUI's file export moves to run through the Node core in
   the main process. The renderer sends DOT+options and receives bytes; a single
   export path is shared by CLI and GUI.
2. **All rendering in main.** The renderer holds **zero Graphviz** — no
   `@hpcc-js/wasm` in the browser bundle. Live preview, linting, AND export all
   round-trip to the Node core via IPC. (IPC overhead is ~ms on an already
   300ms-debounced preview; WASM layout time dominates and is unchanged.)
3. **Vector PDF via jsdom + node-canvas**, gated by a **de-risking spike**
   (Task 1). If node-canvas will not package into the Windows Electron installer,
   the documented fallback is **raster PDF** (resvg PNG embedded in a jsPDF
   page — no node-canvas, not true vector).
4. **PNG via `@resvg/resvg-js`** (SVG string → PNG, white background, min-
   dimension upscale — reproducing today's behavior).
5. Ships as **v2.0.0** (renderer no longer renders; new CLI product surface).

## Architecture

```
core/ (Node-only, no DOM)
  render.ts        initGraphviz, renderDotToSvg(dot,engine), validateDot(dot,engine),
                   LayoutEngine, DotValidationError            [moved from src/preview/graphviz.ts]
  normalize-svg.ts normalizeSvg(svg): { svg, width, height }  [string-based; NO getBBox]
  export-svg.ts    toSvgBytes(normalized): string
  export-png.ts    toPngBytes(svg, scale): Uint8Array          [@resvg/resvg-js]
  export-pdf.ts    computePageGeometry(...)  [moved, pure] + svgToPdfBytes(svg,w,h,opts)
                   [jsPDF-node + svg2pdf + jsdom DOMParser + node-canvas measureText]
  export.ts        exportDiagram(dot, engine, format, options): { bytes, ext, mime }
  types.ts         LayoutEngine, ExportFormat, PdfExportOptions, DotValidationError

electron/main.ts   registers core IPC handlers; initGraphviz() at startup:
  render:svg       (dot, engine) -> svg string                 [live preview]
  render:validate  (dot, engine) -> DotValidationError | null  [linting]
  export:render    (dot, engine, format, options) -> Uint8Array

cli/index.ts       bin `graphvizjs`; args -> core.exportDiagram -> node:fs write

src/ (renderer — pure presentation, no Graphviz):
  platform         renderSvg / validateDot / exportRender wrappers
  preview/render   createPreview calls renderSvg (IPC) instead of renderDotToSvg
  editor/linting   linter calls validateDot (IPC) instead of importing it
  toolbar/export-diagram  rewritten: getEditor text -> pickSavePath ->
                          exportRender -> writeBinaryFile/writeTextFile
  toolbar/pdf-options-dialog  UNCHANGED (produces options for export:render)
```

### Core module contracts

```ts
// core/types.ts
export type LayoutEngine = 'dot'|'neato'|'fdp'|'sfdp'|'circo'|'twopi'|'osage'|'patchwork';
export type ExportFormat = 'svg' | 'png' | 'pngx2' | 'pdf';
export interface DotValidationError { message: string; line?: number; column?: number; }
export interface PdfExportOptions { mode: 'fit'|'standard'; size?: 'letter'|'a4'; orientation?: 'auto'|'portrait'|'landscape'; }
export interface ExportResult { bytes: Uint8Array; ext: string; mime: string; }

// core/render.ts (moved from src/preview/graphviz.ts, unchanged behavior)
export async function initGraphviz(): Promise<void>;
export async function renderDotToSvg(dot: string, engine?: LayoutEngine): Promise<string>;
export async function validateDot(dot: string, engine?: LayoutEngine): Promise<DotValidationError | null>;

// core/normalize-svg.ts (string-based replacement for the DOM normalizeSvg)
export function normalizeSvg(svg: string, padding?: number): { svg: string; width: number; height: number };

// core/export-png.ts
export function toPngBytes(svg: string, width: number, height: number, scale: 1|2): Uint8Array;

// core/export-pdf.ts (computePageGeometry moved verbatim; svgToPdfBytes adapted)
export function computePageGeometry(widthPx: number, heightPx: number, options: PdfExportOptions): PageGeometry;
export async function svgToPdfBytes(svg: string, width: number, height: number, options: PdfExportOptions): Promise<Uint8Array>;

// core/export.ts — the single entry both main and CLI use
export async function exportDiagram(
  dot: string, engine: LayoutEngine, format: ExportFormat, options?: PdfExportOptions
): Promise<ExportResult>;
```

`exportDiagram` orchestrates: `renderDotToSvg` → `normalizeSvg` → dispatch to
svg/png/pdf → return `{ bytes, ext, mime }`. It is pure Node, no persistence.

### IPC additions (`src/platform/contract.ts` + preload + main)

```ts
renderSvg(dot: string, engine: LayoutEngine): Promise<string>;                 // render:svg
validateDot(dot: string, engine: LayoutEngine): Promise<DotValidationError|null>; // render:validate
exportRender(dot: string, engine: LayoutEngine, format: ExportFormat,
             options?: PdfExportOptions): Promise<Uint8Array>;                 // export:render
```

Main constructs the core once (`initGraphviz()` in `whenReady`) and the handlers
call the core. `render:svg` errors (invalid DOT) surface as a rejected promise
that the preview scheduler already handles as a render error.

### CLI (`cli/index.ts`, `bin: { graphvizjs }`)

```
graphvizjs render <input.dot|-> -o <output>
  [--engine dot|neato|fdp|sfdp|circo|twopi|osage|patchwork]   (default dot)
  [--format svg|png|pdf]   (default: inferred from -o extension, else svg)
  [--scale 1|2]            (png only; default 1)
  [--pdf-page fit|letter|a4]         (pdf only; default fit)
  [--pdf-orientation auto|portrait|landscape]  (pdf standard only)
graphvizjs --help | --version
```
- Reads DOT from the input path or stdin (`-`); writes bytes with `node:fs`.
- `png` maps to `format='png', scale=1`; `--scale 2` → the `pngx2` behavior.
- Exit codes: 0 ok; 1 on render/validation error (message to stderr); 2 on bad
  args. Mirrors the dep-graph tool's tsx self-invoke entry; `bin` points at the
  built/`tsx` entry.

### Renderer changes (behavior preserved)

- `src/preview/render.ts`: `createPreview`'s render call becomes
  `await renderSvg(dot, engine)` (IPC); the debounce + token-cancel scheduler is
  unchanged; DOM injection unchanged.
- `src/editor/linting.ts`: the DOT linter source awaits `validateDot(dot, engine)`
  (IPC) instead of the imported function; CodeMirror async linters already
  support this.
- `src/toolbar/export-diagram.ts`: rewritten to `getEditor().state.doc` →
  (for pdf) `openPdfOptionsDialog()` → `pickSavePath(...)` →
  `exportRender(dot, engine, format, options)` → `writeBinaryFile`/`writeTextFile`.
  Deletes `renderDiagram`/`normalizeSvg`/`convertSvgToPng`/`loadImage`/canvas code.
- `@hpcc-js/wasm` import removed from the renderer; it becomes a core dependency
  used by main + CLI. `src/preview/graphviz.ts` and `src/preview/export-pdf.ts`
  are moved into `core/` (their renderer importers switch to IPC).

## Dependencies

Add: `@resvg/resvg-js` (native, prebuilt binaries), `jsdom`, `canvas`
(node-canvas). `jspdf` + `svg2pdf.js` already present. These are **runtime
dependencies of the app** (main process uses them), so they go in
`dependencies` and must bundle into the installer (electron-builder +
`@electron/rebuild`, already in the build). `@hpcc-js/wasm` stays a dependency
(now used by core, not the renderer bundle).

**Guard:** none of these may enter the renderer bundle. The renderer imports
only *types* from `core/` (erased) and never a runtime core module. The
dependency-graph tool should be extended to scan `core/` + `cli/` so the
boundary is auditable.

## Testing strategy

- **Unit (Vitest, Node):** the core is now unit-testable without Electron —
  `renderDotToSvg` (SVG string contains expected `<svg`/nodes), string
  `normalizeSvg` (parses width/height/viewBox, applies padding, idempotent),
  `toPngBytes` (PNG magic bytes `89 50 4E 47`, dimensions ≈ scale×), PDF bytes
  (`%PDF-` header, non-trivial length), `computePageGeometry` (unchanged tests),
  `exportDiagram` format dispatch, CLI arg parsing.
- **CLI integration (Vitest or a spec):** run the CLI entry on a fixture `.dot`
  for each format; assert the output file's magic bytes/extension.
- **e2e (Playwright `_electron`):** behavior preserved — preview updates on type
  (now IPC-backed), lint markers appear for invalid DOT, and each export format
  writes a valid file via the export menu. Use the existing `GVJS_E2E_*` stubs +
  isolated userData (per the e2e-isolation fix).

## Global constraints

- Ships as **v2.0.0** — bump `package.json`; add `CHANGELOG.md` `## [2.0.0]`.
- Default branch **`master`**; tag `v2.0.0`; release title
  `GraphvizJS v2.0.0 — Headless core + CLI`.
- Windows-only build (electron-builder win nsis; CI on windows-latest). Native
  deps (`@resvg/resvg-js`, `canvas`) must package + `@electron/rebuild` cleanly.
- **No behavior regressions** (binding): the GUI's preview, linting, and every
  export format (SVG, PNG @1x/@2x, PDF fit/standard) produce equivalent output
  to v1.4.0. The e2e suite is the guardrail.
- **Renderer purity** (binding): after this cycle, `grep -r "@hpcc-js/wasm" src/`
  returns nothing, and no renderer module imports a runtime `core/` export.
- `core-js`/pnpm build-script gotcha still applies to any transitive dep.
- Quality gate before merge: `pnpm typecheck` 0, `pnpm lint` clean, full unit +
  CLI + e2e green, `pnpm graph` clean (extended to cover `core/` + `cli/`),
  `pnpm package` produces a runnable installer (native deps bundled).

## Risks & sequencing

- **node-canvas packaging (gating):** de-risked by **Task 1 — a spike** that
  installs `@resvg/resvg-js` + `jsdom` + `canvas`, renders a fixture SVG to PNG
  and to vector PDF headless, and confirms `pnpm package`/`@electron/rebuild`
  bundles them on Windows. If it fails, switch PDF to the **raster fallback**
  (resvg PNG in a jsPDF page) — decided at the spike, recorded in the plan.
- **Biggest rewire yet:** the hot preview + lint paths become IPC and export is
  fully replaced. Sequence the plan so the core + spike land first, then the IPC
  layer, then the CLI, then the renderer re-seat (one path at a time: preview,
  then lint, then export), each verified before the next.
- Renderer bundle shrinks (no WASM) — a positive side effect.

## Out of scope (deferred)

- A standalone packaged CLI binary (`.exe` via pkg/nexe) — the `bin`/tsx entry
  ships this cycle; a distributable binary is a follow-up.
- New export formats or render options beyond current parity.
- Any GUI feature changes (theme toggle, command palette, etc. remain deferred).
