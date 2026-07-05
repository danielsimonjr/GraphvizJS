import { svgToPdfBytes } from './export-pdf';
import { toPngBytes } from './export-png';
import { normalizeSvg } from './normalize-svg';
import { renderDotToSvg } from './render';
import type { ExportFormat, ExportResult, LayoutEngine, PdfExportOptions } from './types';

const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  mode: 'fit',
  pageSize: 'letter',
  orientation: 'auto',
};

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
      return { bytes: toPngBytes(svg, width, height, 1), ext: 'png', mime: 'image/png' };
    case 'pngx2':
      return { bytes: toPngBytes(svg, width, height, 2), ext: 'png', mime: 'image/png' };
    case 'pdf':
      return {
        bytes: await svgToPdfBytes(svg, width, height, options ?? DEFAULT_PDF_OPTIONS),
        ext: 'pdf',
        mime: 'application/pdf',
      };
  }
}
