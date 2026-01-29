/**
 * DOT Syntax Linting for CodeMirror
 *
 * Integrates Graphviz DOT validation with CodeMirror's lint system.
 * Provides real-time error highlighting in the editor with gutter markers.
 */

import type { Diagnostic, LintSource } from '@codemirror/lint';
import { lintGutter as cmLintGutter, linter } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { LayoutEngine } from '../preview/graphviz';
import { validateDot } from '../preview/graphviz';

/** Default debounce delay for linting (ms) */
const DEFAULT_LINT_DELAY = 500;

/**
 * Options for configuring the DOT linter
 */
export interface DotLinterOptions {
  /**
   * Callback to get the current layout engine.
   * Called on each lint pass to use the appropriate engine for validation.
   */
  getEngine: () => LayoutEngine;

  /**
   * Debounce delay in milliseconds before running the linter.
   * @default 500
   */
  delay?: number;
}

/**
 * Convert a 1-based line number to a 0-based character offset
 *
 * @param view - The CodeMirror EditorView
 * @param line - 1-based line number from Graphviz error
 * @returns Character offset for the start of the line
 */
function lineToOffset(view: EditorView, line: number): number {
  const doc = view.state.doc;
  // Clamp line number to valid range (1 to doc.lines)
  const clampedLine = Math.max(1, Math.min(line, doc.lines));
  // doc.line() is 1-based, returns a Line object with from/to offsets
  return doc.line(clampedLine).from;
}

/**
 * Get the end offset of a line (for marking the entire line)
 *
 * @param view - The CodeMirror EditorView
 * @param line - 1-based line number
 * @returns Character offset for the end of the line
 */
function lineEndOffset(view: EditorView, line: number): number {
  const doc = view.state.doc;
  const clampedLine = Math.max(1, Math.min(line, doc.lines));
  return doc.line(clampedLine).to;
}

/**
 * Create a CodeMirror Diagnostic from a DotValidationError
 *
 * @param view - The CodeMirror EditorView
 * @param message - Error message from Graphviz
 * @param line - Optional 1-based line number
 * @param column - Optional 1-based column number
 * @returns CodeMirror Diagnostic object
 */
function createDiagnostic(
  view: EditorView,
  message: string,
  line?: number,
  column?: number
): Diagnostic {
  const doc = view.state.doc;

  let from: number;
  let to: number;

  if (line !== undefined && line > 0) {
    // Line number is available - mark that line
    from = lineToOffset(view, line);
    to = lineEndOffset(view, line);

    // If column is available, try to narrow down the range
    if (column !== undefined && column > 0) {
      const lineStart = from;
      const lineLen = to - from;
      // Column is 1-based, so offset within line is column - 1
      const columnOffset = Math.min(column - 1, lineLen);
      from = lineStart + columnOffset;
      // Mark from column to end of line (we don't know the error span length)
    }
  } else {
    // No line number available - mark the first line
    from = 0;
    to = doc.lines > 0 ? doc.line(1).to : 0;
  }

  return {
    from,
    to,
    severity: 'error',
    message,
  };
}

/**
 * Create the lint source callback for DOT validation
 *
 * @param options - Linter options with getEngine callback
 * @returns LintSource function for CodeMirror
 */
function createDotLintSource(options: DotLinterOptions): LintSource {
  return async (view: EditorView): Promise<Diagnostic[]> => {
    const doc = view.state.doc.toString();

    // Skip validation for empty documents
    if (!doc.trim()) {
      return [];
    }

    const engine = options.getEngine();
    const error = await validateDot(doc, engine);

    if (error === null) {
      // No error - document is valid
      return [];
    }

    // Create diagnostic from validation error
    const diagnostic = createDiagnostic(view, error.message, error.line, error.column);
    return [diagnostic];
  };
}

/**
 * Create a DOT linter extension for CodeMirror
 *
 * The linter validates DOT source code using Graphviz WASM and displays
 * errors inline in the editor. Validation is debounced to avoid excessive
 * CPU usage during typing.
 *
 * @param options - Configuration options
 * @returns CodeMirror Extension for DOT linting
 *
 * @example
 * ```ts
 * const extensions = [
 *   createDotLinter({
 *     getEngine: () => currentEngine,
 *     delay: 500,
 *   }),
 *   lintGutter(),
 * ];
 * ```
 */
export function createDotLinter(options: DotLinterOptions): Extension {
  const delay = options.delay ?? DEFAULT_LINT_DELAY;

  return linter(createDotLintSource(options), {
    delay,
  });
}

/**
 * Re-export lintGutter for convenience
 *
 * Adds a gutter showing error markers next to lines with diagnostics.
 * Should be used alongside createDotLinter().
 */
export const lintGutter = cmLintGutter;
