/**
 * Graphviz WASM Renderer Utility
 *
 * Provides a clean abstraction layer for rendering DOT diagrams to SVG
 * using the @hpcc-js/wasm Graphviz WebAssembly implementation.
 *
 * Uses singleton pattern to avoid multiple WASM loads.
 */

import { Graphviz } from '@hpcc-js/wasm';

// Singleton instance - only load WASM once
let graphvizInstance: Awaited<ReturnType<typeof Graphviz.load>> | null = null;

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
 * Initialize the Graphviz WASM module
 * Safe to call multiple times - will only load once
 */
export async function initGraphviz(): Promise<void> {
  if (!graphvizInstance) {
    graphvizInstance = await Graphviz.load();
  }
}

/**
 * Render DOT source to SVG string
 * @param dotSource - The DOT language source code
 * @param engine - Layout engine to use (default: 'dot')
 * @returns SVG string
 */
export async function renderDotToSvg(
  dotSource: string,
  engine: LayoutEngine = 'dot'
): Promise<string> {
  if (!graphvizInstance) {
    await initGraphviz();
  }
  return graphvizInstance!.layout(dotSource, 'svg', engine);
}

/**
 * Check if Graphviz WASM is loaded and ready
 */
export function isGraphvizReady(): boolean {
  return graphvizInstance !== null;
}

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

/**
 * Parse error location from Graphviz error message
 * Handles common error formats:
 * - 'Error: <stdin>: syntax error in line N'
 * - 'Error: <stdin>: syntax error in line N near ...'
 * - 'syntax error in line N'
 * - 'Error: ... in line N ...'
 *
 * @param errorMessage - The error message from Graphviz
 * @returns Object with line and optionally column, or null if parsing fails
 */
function parseErrorLocation(errorMessage: string): { line: number; column?: number } | null {
  // Pattern 1: "in line N" (most common)
  const lineMatch = errorMessage.match(/in line (\d+)/i);
  if (lineMatch) {
    const line = parseInt(lineMatch[1], 10);
    if (!isNaN(line) && line > 0) {
      return { line };
    }
  }

  // Pattern 2: "line N:" format
  const lineColonMatch = errorMessage.match(/line (\d+):/i);
  if (lineColonMatch) {
    const line = parseInt(lineColonMatch[1], 10);
    if (!isNaN(line) && line > 0) {
      return { line };
    }
  }

  // Pattern 3: ":N:" format (file:line:column)
  const colonMatch = errorMessage.match(/:(\d+):(\d+):/);
  if (colonMatch) {
    const line = parseInt(colonMatch[1], 10);
    const column = parseInt(colonMatch[2], 10);
    if (!isNaN(line) && line > 0) {
      return { line, column: !isNaN(column) && column > 0 ? column : undefined };
    }
  }

  return null;
}

/**
 * Validate DOT source code by attempting to render it
 *
 * @param dotSource - The DOT language source code to validate
 * @param engine - Layout engine to use for validation (default: 'dot')
 * @returns null if valid, DotValidationError if invalid
 */
export async function validateDot(
  dotSource: string,
  engine: LayoutEngine = 'dot'
): Promise<DotValidationError | null> {
  if (!graphvizInstance) {
    await initGraphviz();
  }

  try {
    // Attempt to render - if successful, source is valid
    graphvizInstance!.layout(dotSource, 'svg', engine);
    return null;
  } catch (error) {
    // Extract error message
    const message = error instanceof Error ? error.message : String(error);

    // Attempt to parse line/column from error message
    const location = parseErrorLocation(message);

    if (location) {
      return {
        message,
        line: location.line,
        column: location.column,
      };
    }

    // Return message-only error when parsing fails
    return { message };
  }
}
