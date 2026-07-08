/**
 * Headless VECTOR PDF export via jsPDF + svg2pdf.js.
 *
 * svg2pdf.js needs a real DOM (SVG geometry, `DOMParser`, `canvas` for text
 * measurement) to walk the SVG tree, so this module builds a minimal jsdom +
 * node-canvas environment lazily on first use. It intentionally mutates Node
 * globals (`window`, `document`, `navigator`, ...) — do NOT import this from
 * browser code (see `src/preview/export-pdf.ts`, which stays the browser
 * version until it is retired).
 */

import type { PdfExportOptions } from './types.js';

/** CSS px are 96 dpi; PDF points are 72 dpi. */
const PX_TO_PT = 72 / 96;
const STANDARD_MARGIN_PT = 24;

/** Page sizes in pt, portrait convention (short edge x long edge). */
const PAGE_PT: Record<'letter' | 'a4', { short: number; long: number }> = {
  letter: { short: 612, long: 792 },
  a4: { short: 595.28, long: 841.89 },
};

export interface PageGeometry {
  pageWidth: number;
  pageHeight: number;
  orientation: 'portrait' | 'landscape';
  draw: { x: number; y: number; width: number; height: number };
}

/**
 * Pure geometry: diagram size in px + options → PDF page + draw rect (all in pt).
 *
 * `fit` makes the page exactly the diagram bounds (no whitespace). `standard`
 * scales the diagram to fit a Letter/A4 page inside a margin and centers it,
 * allowing upscale so small diagrams fill the page.
 *
 * Copied verbatim from `src/preview/export-pdf.ts` (kept in sync manually;
 * the two modules stay separate until the browser exporter is retired).
 */
export function computePageGeometry(
  widthPx: number,
  heightPx: number,
  options: PdfExportOptions
): PageGeometry {
  const dw = widthPx * PX_TO_PT;
  const dh = heightPx * PX_TO_PT;

  if (options.mode === 'fit') {
    // The page is the diagram bounds exactly (no whitespace). Note: a very large
    // diagram (> ~19200px) yields a page over the PDF spec's default 14400pt max,
    // which some viewers clamp; this is inherent to "fit exactly" and matches the
    // uncapped PNG export. Use "standard page" for guaranteed-portable output.
    return {
      pageWidth: dw,
      pageHeight: dh,
      orientation: dw >= dh ? 'landscape' : 'portrait',
      draw: { x: 0, y: 0, width: dw, height: dh },
    };
  }

  const orientation: 'portrait' | 'landscape' =
    options.orientation === 'auto' ? (dw > dh ? 'landscape' : 'portrait') : options.orientation;
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
    draw: {
      x: (pageWidth - drawW) / 2,
      y: (pageHeight - drawH) / 2,
      width: drawW,
      height: drawH,
    },
  };
}

// The jsdom/node-canvas globals below are untyped DOM shims; `any` is the
// only practical way to patch them (createElement override, getBBox
// polyfill, dynamic-import module shape). Kept to this one alias.
// biome-ignore lint/suspicious/noExplicitAny: jsdom/svg2pdf globals are untyped DOM shims
type AnyDoc = any;

let pdfEnvReady = false;
// Lazily import the Node builds once (svg2pdf's named export nests under
// `.default` in Node ESM — see the dynamic import below).
let jsPDFCtor: typeof import('jspdf').jsPDF | null = null;
let svg2pdfFn: ((el: unknown, doc: unknown, opts: unknown) => Promise<unknown>) | null = null;

/**
 * Build the headless jsdom + node-canvas environment svg2pdf.js needs, once.
 * Idempotent and lazy so importing this module never touches Node globals
 * until a PDF is actually requested.
 */
async function ensurePdfEnv(): Promise<void> {
  if (pdfEnvReady) return;

  // Native/heavy modules, loaded lazily so importing this module for
  // render/validate/format (and bundling the CLI into a standalone exe) never
  // pulls node-canvas or jsdom until a PDF is actually requested.
  const { createCanvas, Image } = await import('canvas');
  const { JSDOM } = await import('jsdom');

  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.DOMParser = dom.window.DOMParser;
  // Node 24+ defines `globalThis.navigator` as a getter-only accessor;
  // plain assignment throws. Redefine it as a writable/configurable data
  // property so jsdom's navigator can be installed.
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  });
  g.Node = dom.window.Node;
  g.Element = dom.window.Element;
  g.SVGElement = dom.window.SVGElement;
  g.Image = Image;

  // jsdom has no <canvas> rendering backend; route document.createElement
  // ('canvas') to a real node-canvas 2D context so svg2pdf's canvas-based
  // text measurement works.
  const doc = dom.window.document as AnyDoc;
  const origCreateElement = doc.createElement.bind(doc);
  doc.createElement = (tagName: string, options?: unknown) => {
    if (typeof tagName === 'string' && tagName.toLowerCase() === 'canvas') {
      const nodeCanvas = createCanvas(300, 150);
      const el = origCreateElement(tagName, options);
      el.getContext = nodeCanvas.getContext.bind(nodeCanvas);
      el.toDataURL = nodeCanvas.toDataURL.bind(nodeCanvas);
      Object.defineProperty(el, 'width', {
        get: () => nodeCanvas.width,
        set: (v) => {
          nodeCanvas.width = v;
        },
      });
      Object.defineProperty(el, 'height', {
        get: () => nodeCanvas.height,
        set: (v) => {
          nodeCanvas.height = v;
        },
      });
      return el;
    }
    return origCreateElement(tagName, options);
  };

  // jsdom implements no SVG geometry (getBBox always throws "not
  // implemented"); polyfill it via node-canvas's `measureText` so svg2pdf
  // can lay out text nodes.
  (dom.window.SVGElement.prototype as AnyDoc).getBBox = function (this: AnyDoc) {
    const text = this.textContent || '';
    const fontFamily = this.getAttribute('font-family') || 'sans-serif';
    const fontSize = this.getAttribute('font-size') || '16px';
    const fontStyle = this.getAttribute('font-style') || 'normal';
    const fontWeight = this.getAttribute('font-weight') || 'normal';
    const ctx = createCanvas(1, 1).getContext('2d');
    ctx.font = [fontStyle, fontWeight, fontSize, fontFamily].join(' ');
    const width = text.length ? ctx.measureText(text).width : 0;
    const heightPx = Number.parseFloat(fontSize) || 16;
    return { x: 0, y: 0, width, height: heightPx };
  };

  const jspdf = await import('jspdf');
  jsPDFCtor = jspdf.jsPDF;
  // svg2pdf.js's named export nests under `.default` in Node ESM.
  const svgMod = (await import('svg2pdf.js')) as AnyDoc;
  svg2pdfFn = svgMod.svg2pdf ?? svgMod.default?.svg2pdf;
  pdfEnvReady = true;
}

/**
 * Convert a rendered diagram SVG (serialized string) to vector PDF bytes,
 * headless (Node/CLI): no browser DOM required.
 *
 * `width`/`height` are the diagram's px dimensions (already computed by the
 * caller's render step), so no DOM measurement is needed for page geometry.
 */
export async function svgToPdfBytes(
  svg: string,
  width: number,
  height: number,
  options: PdfExportOptions
): Promise<Uint8Array> {
  await ensurePdfEnv();
  const g = computePageGeometry(width, height, options);
  // Non-null: ensurePdfEnv() always populates jsPDFCtor before returning.
  const doc = new jsPDFCtor!({
    orientation: g.orientation,
    unit: 'pt',
    format: [g.pageWidth, g.pageHeight],
  });

  // Fill the page white so transparent SVG regions render white (matches PNG export).
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), 'F');

  const parsed = new (globalThis as AnyDoc).DOMParser().parseFromString(svg, 'image/svg+xml');
  const el = parsed.documentElement;
  if (!el || String(el.tagName).toLowerCase() !== 'svg') {
    throw new Error('Invalid SVG passed to PDF export.');
  }
  // Non-null: ensurePdfEnv() always populates svg2pdfFn before returning.
  await svg2pdfFn!(el, doc, {
    x: g.draw.x,
    y: g.draw.y,
    width: g.draw.width,
    height: g.draw.height,
  });

  return new Uint8Array(doc.output('arraybuffer'));
}
