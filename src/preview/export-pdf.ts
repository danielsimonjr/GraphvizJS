import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';

export type PdfPageMode = 'fit' | 'standard';
export type PdfPageSize = 'letter' | 'a4';
export type PdfOrientation = 'auto' | 'portrait' | 'landscape';

export interface PdfExportOptions {
  mode: PdfPageMode;
  pageSize: PdfPageSize; // used only when mode === 'standard'
  orientation: PdfOrientation; // used only when mode === 'standard'
}

/** CSS px are 96 dpi; PDF points are 72 dpi. */
const PX_TO_PT = 72 / 96;
const STANDARD_MARGIN_PT = 24;

/** Page sizes in pt, portrait convention (short edge x long edge). */
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

/**
 * Pure geometry: diagram size in px + options → PDF page + draw rect (all in pt).
 *
 * `fit` makes the page exactly the diagram bounds (no whitespace). `standard`
 * scales the diagram to fit a Letter/A4 page inside a margin and centers it,
 * allowing upscale so small diagrams fill the page.
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

/** Parse a serialized `<svg>` string into an element for svg2pdf. */
function parseSvg(svg: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const el = doc.documentElement as unknown as SVGSVGElement;
  if (!el || el.tagName.toLowerCase() !== 'svg') {
    throw new Error('Invalid SVG passed to PDF export.');
  }
  return el;
}

/**
 * Convert a rendered diagram SVG (serialized string) to vector PDF bytes.
 * `width`/`height` are the diagram's px dimensions (already computed by the
 * caller's render step), so no DOM measurement is needed here.
 */
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

  // Fill the page white so transparent SVG regions render white (matches PNG export).
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
