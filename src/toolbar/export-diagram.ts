import type { EditorView } from 'codemirror';
import type { LayoutEngine } from '../../core/types';
import { exportRender, pickSavePath, writeBinaryFile } from '../platform';
import type { ExportFormat } from './export-menu';
import { openPdfOptionsDialog } from './pdf-options-dialog';

interface ExportDiagramOptions {
  getEditor: () => EditorView;
  getPath: () => string | null;
  getEngine: () => LayoutEngine;
}

const FILTERS: Record<ExportFormat, { name: string; ext: string; suffix?: string }> = {
  svg: { name: 'SVG Image', ext: 'svg' },
  png: { name: 'PNG Image', ext: 'png' },
  pngx2: { name: 'PNG Image', ext: 'png', suffix: '@2x' },
  pdf: { name: 'PDF Document', ext: 'pdf' },
};

export function createExportHandler({ getEditor, getPath, getEngine }: ExportDiagramOptions) {
  return async (format: ExportFormat) => {
    const dot = getEditor().state.doc.toString().trim();
    if (!dot.length) {
      console.warn('Cannot export an empty diagram.');
      return;
    }
    try {
      const options = format === 'pdf' ? await openPdfOptionsDialog() : undefined;
      if (format === 'pdf' && !options) return; // cancelled
      const meta = FILTERS[format];
      const baseName = inferBaseName(getPath());
      const targetPath = await pickSavePath({
        defaultPath: `${baseName}${meta.suffix ?? ''}.${meta.ext}`,
        filters: [
          { name: meta.name, extensions: [meta.ext] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!targetPath) return;
      const bytes = await exportRender(dot, getEngine(), format, options ?? undefined);
      await writeBinaryFile(targetPath, bytes);
    } catch (error) {
      console.error('Failed to export diagram', error);
    }
  };
}

function inferBaseName(path: string | null): string {
  if (!path) {
    return 'diagram';
  }

  const trimmed = path.trim();
  if (!trimmed) {
    return 'diagram';
  }

  const segments = trimmed.split(/[/\\]+/);
  const lastSegment = segments[segments.length - 1] ?? 'diagram';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex > 0) {
    return lastSegment.slice(0, dotIndex);
  }
  return lastSegment.length ? lastSegment : 'diagram';
}
