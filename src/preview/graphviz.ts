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
