import { svgToPdfBytes } from './export-pdf.js';
import { toPngBytes } from './export-png.js';
import { normalizeSvg } from './normalize-svg.js';
import { renderDotToSvg } from './render.js';
import type { ExportFormat, ExportResult, LayoutEngine, PdfExportOptions } from './types.js';

const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  mode: 'fit',
  pageSize: 'letter',
  orientation: 'auto',
};

/**
 * Render DOT source and convert the result to one export format.
 * Every format starts from the normalized SVG, not from the raw Graphviz output.
 *
 * @param dot - The DOT source to export.
 * @param engine - The Graphviz layout engine, such as dot.
 * @param format - The output format: svg, png, pngx2 (PNG at twice the png scale), or pdf.
 * @param options - The PDF page settings, which apply only to pdf.
 *   By default, the page matches the diagram size.
 * @returns The export bytes, with the file extension and the MIME type.
 */
export async function exportDiagram(
  dot: string,
  engine: LayoutEngine,
  format: ExportFormat,
  options?: PdfExportOptions
): Promise<ExportResult> {
  const raw = await renderDotToSvg(dot, engine);
  const { svg, width, height } = normalizeSvg(raw);

  switch (format) {
    case 'svg':
      return { bytes: new TextEncoder().encode(svg), ext: 'svg', mime: 'image/svg+xml' };
    case 'png':
      return { bytes: await toPngBytes(svg, width, height, 1), ext: 'png', mime: 'image/png' };
    case 'pngx2':
      return { bytes: await toPngBytes(svg, width, height, 2), ext: 'png', mime: 'image/png' };
    case 'pdf':
      return {
        bytes: await svgToPdfBytes(svg, width, height, options ?? DEFAULT_PDF_OPTIONS),
        ext: 'pdf',
        mime: 'application/pdf',
      };
  }
}
