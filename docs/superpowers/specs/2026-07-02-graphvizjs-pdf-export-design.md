# GraphvizJS — PDF export (design spec)

**Date:** 2026-07-02
**Status:** Approved design, pending implementation plan
**Cycle:** First of the post-migration "Rendering & Export" improvement cycles.

## Goal

Add **PDF** to the export menu (alongside SVG / PNG / PNG@2x). PDF output is a
**vector** PDF produced from the already-rendered diagram SVG, with an
export-time dialog to choose page sizing: **fit page to the diagram** (default)
or a **standard page** (Letter/A4) with the diagram scaled-to-fit and centered.

### Non-goals (this cycle)

- Copy-to-clipboard, fit-to-window/pan, and custom PNG scale/background options
  (other candidates in the Rendering & Export area) — deferred to their own cycles.
- Multi-page PDFs, PDF/A, embedded fonts beyond what `svg2pdf.js` emits, or
  batch/all-tabs export.
- Changing the existing SVG/PNG export behavior.

## Success criteria

- The export menu shows a **PDF** item; selecting it opens a small options dialog.
- Choosing **Fit to diagram** → **Export** writes a valid vector PDF whose single
  page equals the diagram's bounds (plus the existing export padding).
- Choosing **Standard page** (Letter or A4, orientation Auto/Portrait/Landscape)
  → **Export** writes a valid PDF on that page with the diagram scaled to fit and
  centered, white background.
- **Cancel** writes nothing.
- Empty/whitespace-only document → no dialog, no file (matches current export guard).
- Unit + e2e tests green; `pnpm build`/`typecheck`/`lint` clean; installer still builds.

## Current-state analysis (what we build on)

- `src/preview/graphviz.ts` — `renderDotToSvg(dot, engine)` calls
  `graphvizInstance.layout(dot, 'svg', engine)`. **`@hpcc-js/wasm` graphviz emits
  only text formats (svg/dot/json/plain) — no PDF** (its WASM build has no cairo
  renderer; this is also why PNG export rasterizes the SVG rather than asking
  graphviz for PNG). So PDF must be produced **from the SVG**.
- `src/toolbar/export-diagram.ts` — `createExportHandler({ getEditor, getPath })`
  returns `async (format: ExportFormat) => …` that: guards empty docs,
  `renderDiagram(doc)` → `RenderedDiagram { svg: string; width: number; height:
  number }` (via `normalizeSvg`, which sets width/height/viewBox and adds
  `EXPORT_PADDING = 10` px on each side), `inferBaseName(getPath())`, then
  branches: `'svg'` → `exportAsSvg`; else `exportAsPng(rendered, baseName, scale)`.
  `exportAsSvg`/`exportAsPng` call `platform.pickSavePath(...)` then
  `writeTextFile`/`writeBinaryFile`. **`renderDiagram` returns the SVG as a
  serialized string**, not an element.
- `src/toolbar/export-menu.ts` — `ExportFormat = 'png' | 'pngx2' | 'svg'`;
  `setupExportMenu` reads `target.dataset.export` from `.toolbar-menu-item`
  clicks and calls `onSelect(format)`. **Adding a menu item with
  `data-export="pdf"` is auto-dispatched** — no wiring change beyond the type.
- `src/help/dialog.ts` — reference pattern for a native `<dialog>` built in TS
  (`document.createElement('dialog')`, `showModal()`, close button, backdrop
  click, Escape). The PDF options dialog follows this pattern.
- `src/platform` — `pickSavePath({ defaultPath, filters })`, `writeBinaryFile(path,
  Uint8Array)`. PDF uses these exactly like PNG.
- **CSP** (`src/index.html`): `script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'`,
  no `'unsafe-inline'` in `script-src`. New deps are bundled (`'self'`); they must
  not require inline script. `img-src` allows `data: blob:`.

## Approach (chosen: A — `svg2pdf.js` + `jsPDF`, renderer-side)

Draw the rendered SVG into a `jsPDF` document with `svg2pdf.js`, output
`ArrayBuffer` → `Uint8Array` → `platform.writeBinaryFile`. Vector output; mirrors
the existing renderer-builds-bytes-then-platform-writes pattern; no new IPC; jsPDF
handles page size + orientation directly.

Rejected: **B — Electron `webContents.printToPDF`** (best font fidelity but needs
an offscreen window + IPC + CSP for the offscreen load, and exact fit-to-bounds is
awkward with page-oriented `printToPDF`); **C — raster PDF** (embed the existing
PNG; simplest but not vector, defeating the purpose).

## Design

### Units (isolated, single-responsibility)

**New — `src/preview/export-pdf.ts`**
```ts
export type PdfPageMode = 'fit' | 'standard';
export type PdfPageSize = 'letter' | 'a4';
export type PdfOrientation = 'auto' | 'portrait' | 'landscape';
export interface PdfExportOptions {
  mode: PdfPageMode;
  pageSize: PdfPageSize;       // used only when mode === 'standard'
  orientation: PdfOrientation; // used only when mode === 'standard'
}
// Parses the SVG string to an element, builds the jsPDF doc, returns PDF bytes.
export function svgToPdfBytes(svg: string, width: number, height: number,
                             options: PdfExportOptions): Promise<Uint8Array>;
```
Responsibilities: parse `svg` (a serialized `<svg>` string) into an
`SVGSVGElement` (via `DOMParser` / an offscreen container, matching how
`renderDiagram` mounts SVG for `getBBox`); compute the page geometry; draw with
`svg2pdf`; return `new Uint8Array(doc.output('arraybuffer'))`.
- **Units:** SVG px → PDF pt at 96 dpi (`pt = px * 72/96`). `jsPDF` default unit
  `pt`.
- **Fit mode:** page = `[width, height]` (px→pt); draw SVG at `(0,0)` sized to the
  full page.
- **Standard mode:** page = Letter (612×792 pt) or A4 (595.28×841.89 pt);
  orientation: `portrait`/`landscape` explicit, or `auto` = landscape iff
  `width > height`. Scale = `min((pageW - 2*margin)/diagramW, (pageH -
  2*margin)/diagramH)` (never upscale past 1 is NOT required — diagrams may be
  small; do fit-to-page including upscale, or cap at 1 — **decision: fit-to-page,
  allow upscale** so small diagrams fill the page; margin = 24 pt). Center the
  scaled diagram.
- **Background:** fill the page white before drawing (matches PNG export's white
  fill), so transparent-SVG regions render white in the PDF.

**New — `src/toolbar/pdf-options-dialog.ts`**
```ts
export function openPdfOptionsDialog(): Promise<PdfExportOptions | null>;
```
Builds a native `<dialog class="pdf-options-dialog">` (help-dialog pattern),
resolves the chosen `PdfExportOptions` on **Export**, `null` on **Cancel**/Escape/
backdrop. Controls: radio **Page** (Fit to diagram [default] / Standard page);
select **Size** (Letter/A4) + select **Orientation** (Auto/Portrait/Landscape),
both `disabled` unless "Standard page" is selected. The dialog element is created
once and reused (like the help dialog). Styles added to `src/styles.css`
(reusing existing dialog/`help-dialog` styling; include `body.dark` variants).

**Modified — `src/toolbar/export-diagram.ts`**
Add a `'pdf'` branch to the handler:
```ts
if (format === 'pdf') {
  const opts = await openPdfOptionsDialog();
  if (!opts) return;                       // cancelled
  const bytes = await svgToPdfBytes(rendered.svg, rendered.width, rendered.height, opts);
  const targetPath = await pickSavePath({
    defaultPath: `${baseName}.pdf`,
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }, { name: 'All Files', extensions: ['*'] }],
  });
  if (!targetPath) return;
  await writeBinaryFile(targetPath, bytes);
  return;
}
```
(The empty-doc guard and `renderDiagram`/`inferBaseName` calls already run before
the branch — reuse them; only add the branch.)

**Modified — `src/toolbar/export-menu.ts`** — `ExportFormat = 'png' | 'pngx2' |
'svg' | 'pdf'`.

**Modified — `src/index.html`** — add `<button class="toolbar-menu-item"
data-export="pdf">PDF</button>` to the export dropdown (auto-dispatched by
`setupExportMenu`). No `actions.ts` change needed.

### Dependencies

- `jspdf` and `svg2pdf.js` (production deps; both maintained, browser-native,
  bundled by Vite). **CSP check (required in implementation):** confirm neither
  needs inline script or `eval` beyond the already-allowed `'unsafe-eval'`; verify
  a PDF actually generates in a `pnpm build` + e2e run (not just dev).

## Testing

- **Unit — `test/preview/export-pdf.test.ts`** (vitest/happy-dom): `svgToPdfBytes`
  returns bytes beginning with `%PDF-`; **fit** mode → page dims equal the
  px→pt-converted diagram size; **standard** Letter/A4 → correct page dims;
  `auto` orientation picks landscape for a wide diagram, portrait for a tall one.
  (If jsPDF/svg2pdf don't run cleanly in happy-dom, stub `svg2pdf` and assert the
  geometry passed to jsPDF + the `%PDF-` output; note this in the plan.)
- **Unit — `test/toolbar/pdf-options-dialog.test.ts`**: opening resolves the
  selected options on Export; `null` on Cancel; size/orientation disabled unless
  "Standard page"; defaults (`fit`, `letter`, `auto`).
- **e2e — extend `test/e2e/export.spec.ts`**: click **PDF** → dialog appears →
  **Export** (fit) → assert `writeBinaryFile` was called with a `.pdf` path and
  `%PDF-` bytes, via the `GVJS_E2E_SAVE` seam; and a **Cancel** path writes nothing.
- **Coverage:** keep the repo's existing thresholds; the new pure modules are the
  bulk of coverage.

## Risks & mitigations

- **`svg2pdf.js` text/font fidelity on Graphviz SVG.** Graphviz SVG is simple
  (paths, `<text>`, polygons/ellipses), which `svg2pdf` handles; but font
  substitution/positioning can drift. *Mitigation:* verify text renders and is
  positioned correctly by opening an exported PDF from a **packaged** build during
  implementation; if text is unacceptable, fall back to Approach B (Electron
  `printToPDF`) — noted as the contingency.
- **CSP / `eval`.** *Mitigation:* the CSP already allows `'unsafe-eval'` (needed by
  `@hpcc-js/wasm`); confirm the PDF path works under it in a built app.
- **`getBBox`/DOM in tests.** `svgToPdfBytes` mounts/parses SVG; happy-dom lacks
  `getBBox`. *Mitigation:* the sizing math uses the `width`/`height` passed in
  (already computed by `renderDiagram`), not a fresh `getBBox`, so unit tests need
  no `getBBox`; parsing uses `DOMParser` which happy-dom supports.

## Out of scope (future Rendering & Export cycles)

Copy-to-clipboard, fit-to-window + pan, PNG scale/background export options.
