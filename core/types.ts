/**
 * Available Graphviz layout engines
 * - dot: hierarchical/directed graphs (default)
 * - neato: spring model for undirected graphs
 * - fdp: force-directed placement
 * - sfdp: scalable force-directed placement (large graphs)
 * - circo: circular layout
 * - twopi: radial layout
 * - osage: array-based layout
 * - patchwork: squarified treemap layout
 */
export type LayoutEngine =
  | 'dot'
  | 'neato'
  | 'fdp'
  | 'sfdp'
  | 'circo'
  | 'twopi'
  | 'osage'
  | 'patchwork';

/**
 * Structured error information from DOT validation
 */
export interface DotValidationError {
  /** Error message from Graphviz */
  message: string;
  /** Line number where the error occurred (1-indexed) */
  line?: number;
  /** Column number where the error occurred (1-indexed) */
  column?: number;
}

/** Supported export formats for a rendered diagram */
export type ExportFormat = 'png' | 'pngx2' | 'svg' | 'pdf';

/** PDF page fitting mode: fit the diagram to one page, or use a standard page size */
export type PdfPageMode = 'fit' | 'standard';

/** Standard PDF page size (used when `PdfPageMode` is 'standard') */
export type PdfPageSize = 'letter' | 'a4';

/** PDF page orientation */
export type PdfOrientation = 'auto' | 'portrait' | 'landscape';

/** Options controlling PDF export layout */
export interface PdfExportOptions {
  mode: PdfPageMode;
  pageSize: PdfPageSize;
  orientation: PdfOrientation;
}

/** Result of an export operation */
export interface ExportResult {
  bytes: Uint8Array;
  ext: string;
  mime: string;
}
