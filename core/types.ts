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

/** DOT vocabulary handed to the renderer over IPC for highlighting/autocomplete. */
export interface DotVocabulary {
  keywords: string[];
  attributes: string[];
  /** Enum attribute name -> its value domain (from the attribute catalog). */
  attributeValues: Record<string, string[]>;
  /** Named colors accepted by color-valued attributes. */
  colors: string[];
}

/** A quick-fix replacement for a diagnostic, positioned by 0-based character offsets. */
export interface DiagnosticFix {
  from: number;
  to: number;
  text: string;
  label: string;
}

/** A structural lint finding, positioned by 0-based character offsets. */
export interface StructuralDiagnostic {
  from: number;
  to: number;
  severity: 'error' | 'warning';
  message: string;
  /** Stable identifier for the diagnostic rule that produced this finding. */
  code?: string;
  /** An optional quick fix that resolves this diagnostic. */
  fix?: DiagnosticFix;
}

/** The full diagnostic verdict for a diagram: Graphviz syntax + pure structural checks. */
export interface DiagramDiagnostics {
  syntax: DotValidationError | null;
  structural: StructuralDiagnostic[];
}
