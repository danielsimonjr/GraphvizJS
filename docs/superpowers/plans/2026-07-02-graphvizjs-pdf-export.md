# GraphvizJS PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vector **PDF** to the export menu, converting the rendered diagram SVG to PDF with an export-time dialog to choose fit-to-diagram vs a standard page (Letter/A4 + orientation).

**Architecture:** Renderer-side. `svg2pdf.js` draws the SVG (already produced by `renderDiagram()`) into a `jsPDF` document → `Uint8Array` → existing `platform.pickSavePath` + `writeBinaryFile`. Two new pure/isolated units: `export-pdf.ts` (conversion + page geometry) and `pdf-options-dialog.ts` (the sizing dialog). `export-diagram.ts` gains a `'pdf'` branch; `export-menu.ts` + `index.html` add the item.

**Tech Stack:** TypeScript, Vite, `jspdf@^4.2.1`, `svg2pdf.js@^2.7.0`, CodeMirror, `@hpcc-js/wasm`, Vitest (happy-dom), Playwright (Electron).

## Global Constraints

- Vector PDF only (not raster). Convert from the rendered SVG (`@hpcc-js/wasm` cannot emit PDF).
- White page background (matches the existing PNG export).
- Units: SVG px → PDF pt at 96 dpi (`pt = px * 72 / 96`); jsPDF unit `'pt'`.
- CSP is `script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'`, no `'unsafe-inline'`; deps must be bundled and not require inline script.
- Dialog defaults: mode `fit`, page `letter`, orientation `auto`. Standard-mode: fit-to-page **allowing upscale**, margin **24 pt**; `auto` orientation = landscape iff diagram `width > height`.
- Package manager **pnpm**. Commit after each task. Work on branch `feat/pdf-export`. Do not push to `master`.

---

## File Structure

- **Create** `src/preview/export-pdf.ts` — `svgToPdfBytes(...)`: SVG string → PDF `Uint8Array` (geometry + jsPDF/svg2pdf). One responsibility: conversion.
- **Create** `src/toolbar/pdf-options-dialog.ts` — `openPdfOptionsDialog()`: builds/opens the native `<dialog>`, resolves options or null.
- **Create** `test/preview/export-pdf.test.ts`, `test/toolbar/pdf-options-dialog.test.ts`.
- **Modify** `src/toolbar/export-menu.ts` — `ExportFormat` gains `'pdf'`.
- **Modify** `src/toolbar/export-diagram.ts` — add `'pdf'` branch.
- **Modify** `src/index.html` — PDF menu item.
- **Modify** `src/styles.css` — `.pdf-options-dialog` styles (+ `body.dark`).
- **Modify** `test/e2e/export.spec.ts` — PDF export e2e.
- **Modify** `package.json` — add `jspdf`, `svg2pdf.js`.

---

### Task 1: `export-pdf.ts` — SVG→PDF conversion + geometry

**Files:**
- Modify: `package.json` (add deps)
- Create: `src/preview/export-pdf.ts`
- Test: `test/preview/export-pdf.test.ts`

**Interfaces:**
- Produces: the types + `svgToPdfBytes(svg, width, height, options): Promise<Uint8Array>` consumed by Task 3.

- [ ] **Step 1: Add dependencies**

```bash
pnpm add jspdf svg2pdf.js
```

- [ ] **Step 2: Write the failing test**

`test/preview/export-pdf.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computePageGeometry, type PdfExportOptions } from '../../src/preview/export-pdf';

const fit: PdfExportOptions = { mode: 'fit', pageSize: 'letter', orientation: 'auto' };

describe('computePageGeometry', () => {
  it('fit mode: page equals the diagram size in pt (px * 72/96)', () => {
    const g = computePageGeometry(400, 300, fit);
    expect(g.pageWidth).toBeCloseTo(300, 5); // 400 * 0.75
    expect(g.pageHeight).toBeCloseTo(225, 5); // 300 * 0.75
    expect(g.orientation).toBe('landscape'); // 400 > 300
    expect(g.draw).toEqual({ x: 0, y: 0, width: 300, height: 225 });
  });

  it('standard letter auto: wide diagram → landscape 792x612, scaled + centered with 24pt margin', () => {
    const g = computePageGeometry(1000, 500, { mode: 'standard', pageSize: 'letter', orientation: 'auto' });
    expect(g.orientation).toBe('landscape');
    expect(g.pageWidth).toBeCloseTo(792, 1);
    expect(g.pageHeight).toBeCloseTo(612, 1);
    // scale = min((792-48)/750, (612-48)/375) where diagram pt = 750x375
    const diagW = 750, diagH = 375;
    const scale = Math.min((792 - 48) / diagW, (612 - 48) / diagH);
    expect(g.draw.width).toBeCloseTo(diagW * scale, 1);
    expect(g.draw.height).toBeCloseTo(diagH * scale, 1);
    expect(g.draw.x).toBeCloseTo((792 - diagW * scale) / 2, 1);
    expect(g.draw.y).toBeCloseTo((612 - diagH * scale) / 2, 1);
  });

  it('standard a4 portrait explicit: tall page 595.28x841.89', () => {
    const g = computePageGeometry(300, 900, { mode: 'standard', pageSize: 'a4', orientation: 'portrait' });
    expect(g.orientation).toBe('portrait');
    expect(g.pageWidth).toBeCloseTo(595.28, 1);
    expect(g.pageHeight).toBeCloseTo(841.89, 1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run test/preview/export-pdf.test.ts`
Expected: FAIL (cannot find module `../../src/preview/export-pdf`).

- [ ] **Step 4: Implement `src/preview/export-pdf.ts`**

```ts
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';

export type PdfPageMode = 'fit' | 'standard';
export type PdfPageSize = 'letter' | 'a4';
export type PdfOrientation = 'auto' | 'portrait' | 'landscape';

export interface PdfExportOptions {
  mode: PdfPageMode;
  pageSize: PdfPageSize;
  orientation: PdfOrientation;
}

const PX_TO_PT = 72 / 96;
const STANDARD_MARGIN_PT = 24;
// Long-edge x short-edge, in pt (portrait convention).
const PAGE_PT: Record<PdfPageSize, { short: number; long: number }> = {
  letter: { short: 612, long: 792 },
  a4: { short: 595.28, long: 841.89 },
};

export interface PageGeometry {
  pageWidth: number;
  pageHeight: number;
  orientation: 'portrait' | 'landscape';
  draw: { x: number; y: number; width: number; height: number };
}

/** Pure geometry: diagram px + options → PDF page + draw rect (all in pt). */
export function computePageGeometry(
  widthPx: number,
  heightPx: number,
  options: PdfExportOptions
): PageGeometry {
  const dw = widthPx * PX_TO_PT;
  const dh = heightPx * PX_TO_PT;

  if (options.mode === 'fit') {
    return {
      pageWidth: dw,
      pageHeight: dh,
      orientation: dw >= dh ? 'landscape' : 'portrait',
      draw: { x: 0, y: 0, width: dw, height: dh },
    };
  }

  const orientation: 'portrait' | 'landscape' =
    options.orientation === 'auto'
      ? dw > dh
        ? 'landscape'
        : 'portrait'
      : options.orientation;
  const { short, long } = PAGE_PT[options.pageSize];
  const pageWidth = orientation === 'landscape' ? long : short;
  const pageHeight = orientation === 'landscape' ? short : long;

  const availW = pageWidth - STANDARD_MARGIN_PT * 2;
  const availH = pageHeight - STANDARD_MARGIN_PT * 2;
  const scale = Math.min(availW / dw, availH / dh); // allow upscale
  const drawW = dw * scale;
  const drawH = dh * scale;
  return {
    pageWidth,
    pageHeight,
    orientation,
    draw: { x: (pageWidth - drawW) / 2, y: (pageHeight - drawH) / 2, width: drawW, height: drawH },
  };
}

/** Parse a serialized <svg> string into an element for svg2pdf. */
function parseSvg(svg: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const el = doc.documentElement as unknown as SVGSVGElement;
  if (!el || el.tagName.toLowerCase() !== 'svg') {
    throw new Error('Invalid SVG passed to PDF export.');
  }
  return el;
}

/** Convert a rendered diagram SVG string to vector PDF bytes. */
export async function svgToPdfBytes(
  svg: string,
  width: number,
  height: number,
  options: PdfExportOptions
): Promise<Uint8Array> {
  const g = computePageGeometry(width, height, options);
  const doc = new jsPDF({
    orientation: g.orientation,
    unit: 'pt',
    format: [g.pageWidth, g.pageHeight],
  });
  // White background so transparent SVG regions render white.
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), 'F');

  const el = parseSvg(svg);
  await svg2pdf(el, doc, {
    x: g.draw.x,
    y: g.draw.y,
    width: g.draw.width,
    height: g.draw.height,
  });
  return new Uint8Array(doc.output('arraybuffer'));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run test/preview/export-pdf.test.ts` → Expected: PASS (3 tests). (Tests exercise `computePageGeometry` only — pure, no jsPDF/DOM. `svgToPdfBytes` is covered by e2e in Task 4.)

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck` → 0 errors.
```bash
git add package.json pnpm-lock.yaml src/preview/export-pdf.ts test/preview/export-pdf.test.ts
git commit -m "feat(export): SVG->PDF conversion module (svg2pdf + jsPDF)"
```

---

### Task 2: `pdf-options-dialog.ts` — the sizing dialog

**Files:**
- Create: `src/toolbar/pdf-options-dialog.ts`
- Modify: `src/styles.css` (dialog styles)
- Test: `test/toolbar/pdf-options-dialog.test.ts`

**Interfaces:**
- Consumes: `PdfExportOptions` (Task 1).
- Produces: `openPdfOptionsDialog(): Promise<PdfExportOptions | null>` consumed by Task 3.

- [ ] **Step 1: Write the failing test**

`test/toolbar/pdf-options-dialog.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openPdfOptionsDialog } from '../../src/toolbar/pdf-options-dialog';

// happy-dom lacks showModal/close; stub them.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  });
});
afterEach(() => {
  document.querySelectorAll('dialog').forEach((d) => d.remove());
});

function dialog() {
  return document.querySelector('dialog.pdf-options-dialog') as HTMLDialogElement;
}

describe('openPdfOptionsDialog', () => {
  it('defaults to fit/letter/auto and resolves them on Export', async () => {
    const p = openPdfOptionsDialog();
    dialog().querySelector<HTMLButtonElement>('[data-pdf-action="export"]')!.click();
    await expect(p).resolves.toEqual({ mode: 'fit', pageSize: 'letter', orientation: 'auto' });
  });

  it('resolves null on Cancel', async () => {
    const p = openPdfOptionsDialog();
    dialog().querySelector<HTMLButtonElement>('[data-pdf-action="cancel"]')!.click();
    await expect(p).resolves.toBeNull();
  });

  it('returns chosen standard page + size + orientation', async () => {
    const p = openPdfOptionsDialog();
    const d = dialog();
    d.querySelector<HTMLInputElement>('input[name="pdf-mode"][value="standard"]')!.click();
    d.querySelector<HTMLSelectElement>('[data-pdf="size"]')!.value = 'a4';
    d.querySelector<HTMLSelectElement>('[data-pdf="orientation"]')!.value = 'landscape';
    d.querySelector<HTMLButtonElement>('[data-pdf-action="export"]')!.click();
    await expect(p).resolves.toEqual({ mode: 'standard', pageSize: 'a4', orientation: 'landscape' });
  });

  it('disables size/orientation until Standard page is selected', () => {
    openPdfOptionsDialog();
    const d = dialog();
    expect(d.querySelector<HTMLSelectElement>('[data-pdf="size"]')!.disabled).toBe(true);
    d.querySelector<HTMLInputElement>('input[name="pdf-mode"][value="standard"]')!.click();
    expect(d.querySelector<HTMLSelectElement>('[data-pdf="size"]')!.disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/toolbar/pdf-options-dialog.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/toolbar/pdf-options-dialog.ts`**

```ts
import type { PdfExportOptions } from '../preview/export-pdf';

export function openPdfOptionsDialog(): Promise<PdfExportOptions | null> {
  return new Promise((resolve) => {
    const el = document.createElement('dialog');
    el.className = 'pdf-options-dialog';
    el.innerHTML = `
      <form class="pdf-options-form" method="dialog">
        <h2>Export PDF</h2>
        <fieldset class="pdf-page-mode">
          <legend>Page</legend>
          <label><input type="radio" name="pdf-mode" value="fit" checked /> Fit page to diagram</label>
          <label><input type="radio" name="pdf-mode" value="standard" /> Standard page</label>
        </fieldset>
        <div class="pdf-standard-opts">
          <label>Size
            <select data-pdf="size" disabled>
              <option value="letter" selected>Letter</option>
              <option value="a4">A4</option>
            </select>
          </label>
          <label>Orientation
            <select data-pdf="orientation" disabled>
              <option value="auto" selected>Auto</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
        </div>
        <div class="pdf-options-actions">
          <button type="button" class="pdf-btn-cancel" data-pdf-action="cancel">Cancel</button>
          <button type="button" class="pdf-btn-export" data-pdf-action="export">Export</button>
        </div>
      </form>
    `;

    const sizeSel = el.querySelector<HTMLSelectElement>('[data-pdf="size"]')!;
    const orientSel = el.querySelector<HTMLSelectElement>('[data-pdf="orientation"]')!;
    const modeInputs = el.querySelectorAll<HTMLInputElement>('input[name="pdf-mode"]');

    const syncEnabled = () => {
      const standard =
        el.querySelector<HTMLInputElement>('input[name="pdf-mode"]:checked')!.value === 'standard';
      sizeSel.disabled = !standard;
      orientSel.disabled = !standard;
    };
    modeInputs.forEach((i) => i.addEventListener('change', syncEnabled));

    let settled = false;
    const finish = (result: PdfExportOptions | null) => {
      if (settled) return;
      settled = true;
      el.close();
      el.remove();
      resolve(result);
    };

    el.querySelector('[data-pdf-action="cancel"]')!.addEventListener('click', () => finish(null));
    el.querySelector('[data-pdf-action="export"]')!.addEventListener('click', () => {
      const mode = el.querySelector<HTMLInputElement>('input[name="pdf-mode"]:checked')!
        .value as PdfExportOptions['mode'];
      finish({
        mode,
        pageSize: sizeSel.value as PdfExportOptions['pageSize'],
        orientation: orientSel.value as PdfExportOptions['orientation'],
      });
    });
    // Backdrop click + Escape (native dialog 'cancel') resolve null.
    el.addEventListener('cancel', () => finish(null));
    el.addEventListener('click', (e) => {
      if (e.target === el) finish(null);
    });

    document.body.appendChild(el);
    el.showModal();
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/toolbar/pdf-options-dialog.test.ts` → Expected: PASS (4 tests).

- [ ] **Step 5: Add dialog styles**

In `src/styles.css`, append (reusing the existing dialog look; check the `.help-dialog` rules and mirror them):
```css
.pdf-options-dialog {
  border: none;
  border-radius: 8px;
  padding: 20px;
  min-width: 320px;
  color: inherit;
  background: #fff;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
}
.pdf-options-dialog::backdrop { background: rgba(0, 0, 0, 0.4); }
.pdf-options-dialog h2 { margin: 0 0 12px; font-size: 1.1rem; }
.pdf-options-dialog fieldset { border: none; margin: 0 0 12px; padding: 0; }
.pdf-options-dialog legend { font-weight: 600; padding: 0 0 6px; }
.pdf-options-dialog label { display: block; margin: 4px 0; }
.pdf-standard-opts { display: flex; gap: 12px; margin-bottom: 16px; }
.pdf-options-actions { display: flex; justify-content: flex-end; gap: 8px; }
.pdf-options-dialog select:disabled { opacity: 0.5; }
body.dark .pdf-options-dialog { background: #1e1e1e; }
```

- [ ] **Step 6: Verify lint + commit**

Run: `pnpm vitest run test/toolbar/pdf-options-dialog.test.ts` (still PASS) and `pnpm lint`.
```bash
git add src/toolbar/pdf-options-dialog.ts test/toolbar/pdf-options-dialog.test.ts src/styles.css
git commit -m "feat(export): PDF options dialog (fit vs standard page)"
```

---

### Task 3: Wire PDF into the export flow

**Files:**
- Modify: `src/toolbar/export-menu.ts`, `src/toolbar/export-diagram.ts`, `src/index.html`

**Interfaces:**
- Consumes: `svgToPdfBytes` (Task 1), `openPdfOptionsDialog` (Task 2).

- [ ] **Step 1: Extend the ExportFormat type**

In `src/toolbar/export-menu.ts`, change the type:
```ts
export type ExportFormat = 'png' | 'pngx2' | 'svg' | 'pdf';
```

- [ ] **Step 2: Add the `'pdf'` branch to the handler**

In `src/toolbar/export-diagram.ts`, add imports at the top:
```ts
import { openPdfOptionsDialog } from './pdf-options-dialog';
import { svgToPdfBytes } from '../preview/export-pdf';
import { pickSavePath, writeBinaryFile } from '../platform';
```
(If `pickSavePath`/`writeBinaryFile` are already imported, don't duplicate.) Inside `createExportHandler`'s returned function, AFTER `const baseName = inferBaseName(getPath());` and BEFORE the `if (format === 'svg')` block, add:
```ts
      if (format === 'pdf') {
        const opts = await openPdfOptionsDialog();
        if (!opts) return; // cancelled
        const bytes = await svgToPdfBytes(rendered.svg, rendered.width, rendered.height, opts);
        const targetPath = await pickSavePath({
          defaultPath: `${baseName}.pdf`,
          filters: [
            { name: 'PDF Document', extensions: ['pdf'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        if (!targetPath) return;
        await writeBinaryFile(targetPath, bytes);
        return;
      }
```

- [ ] **Step 3: Add the menu item**

In `src/index.html`, inside the export dropdown menu (`[data-dropdown="export"] .toolbar-menu`, next to the existing `data-export` items), add:
```html
<button type="button" class="toolbar-menu-item" data-export="pdf">PDF</button>
```

- [ ] **Step 4: Verify typecheck/build/unit**

Run: `pnpm typecheck` → 0; `pnpm test` → all pass (existing + new); `pnpm build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/toolbar/export-menu.ts src/toolbar/export-diagram.ts src/index.html
git commit -m "feat(export): wire PDF into the export menu + handler"
```

---

### Task 4: E2E — PDF export in the real app

**Files:**
- Modify: `test/e2e/export.spec.ts`

**Interfaces:**
- Consumes: the wired flow (Task 3), the `GVJS_E2E_SAVE` main-process stub.

- [ ] **Step 1: Add e2e tests**

In `test/e2e/export.spec.ts` (follow the existing patterns in that file for `launchApp`, typing DOT, opening the export menu, and the `GVJS_E2E_SAVE` env seam), add:
```ts
test('PDF export (fit) writes a valid PDF via the options dialog', async () => {
  const savePath = path.join(os.tmpdir(), `gvjs-e2e-${Date.now()}.pdf`);
  const { app, page } = await launchApp({ GVJS_E2E_SAVE: savePath });
  try {
    await waitForAppReady(page);
    // open export menu, click PDF
    await page.click('[data-action="export-menu"]');
    await page.click('[data-export="pdf"]');
    // options dialog: default is fit; click Export
    await page.click('.pdf-options-dialog [data-pdf-action="export"]');
    await page.waitForTimeout(500); // allow write
    const bytes = fs.readFileSync(savePath);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  } finally {
    await app.close();
  }
});

test('PDF export Cancel writes nothing', async () => {
  const savePath = path.join(os.tmpdir(), `gvjs-e2e-cancel-${Date.now()}.pdf`);
  const { app, page } = await launchApp({ GVJS_E2E_SAVE: savePath });
  try {
    await waitForAppReady(page);
    await page.click('[data-action="export-menu"]');
    await page.click('[data-export="pdf"]');
    await page.click('.pdf-options-dialog [data-pdf-action="cancel"]');
    await page.waitForTimeout(300);
    expect(fs.existsSync(savePath)).toBe(false);
  } finally {
    await app.close();
  }
});
```
Add any missing imports at the top of the spec: `import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';` (only those not already present).

- [ ] **Step 2: Run e2e**

Run: `pnpm build && pnpm test:e2e` → Expected: all specs pass, including the 2 new PDF tests. This also confirms `svg2pdf`/`jsPDF` work under the app CSP in the built app.

- [ ] **Step 3: Font-fidelity manual check (risk mitigation)**

Open the PDF written by the fit-mode test (or run the app + export a PDF of an examples diagram) and confirm node **text renders and is positioned correctly**. If text is broken, the contingency is Approach B (Electron `webContents.printToPDF`) — stop and report rather than shipping broken text.

- [ ] **Step 4: Commit + CHANGELOG**

Add a `## [Unreleased]` CHANGELOG entry: "Added: PDF export (vector, with a fit-to-diagram / standard-page dialog)."
```bash
git add test/e2e/export.spec.ts CHANGELOG.md
git commit -m "test(e2e): PDF export; changelog"
```

---

## Self-Review

**Spec coverage:** menu item + dialog (T2/T3), vector conversion from SVG (T1), fit vs standard page + orientation + white bg + 24pt margin + allow-upscale (T1 `computePageGeometry`, tested), cancel writes nothing (T2 + T4), empty-doc guard (unchanged, runs before the branch), unit + e2e + font-fidelity check (T1/T2/T4), deps + CSP (T1 add, T4 built-app verify). ✓
**Placeholder scan:** every code step has complete code; e2e references the existing spec's helpers explicitly. No TBD/TODO. ✓
**Type consistency:** `PdfExportOptions`/`PdfPageMode`/`PdfPageSize`/`PdfOrientation` defined in T1, imported by T2/T3; `svgToPdfBytes(svg, width, height, options)` signature matches the T3 call; `openPdfOptionsDialog(): Promise<PdfExportOptions | null>` matches T3 usage; `data-pdf-action`/`data-pdf`/`name="pdf-mode"` selectors consistent between the dialog impl (T2 Step 3) and its tests (T2 Step 1) and the e2e (T4). ✓
