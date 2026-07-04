// TEMPORARY re-export shim — the render logic now lives in core/. Removed in Task 11
// once the renderer's value consumers (render.ts, linting.ts, export-diagram.ts, main.ts)
// re-seat onto IPC and the renderer no longer imports Graphviz at all.
export { initGraphviz, isGraphvizReady, renderDotToSvg, validateDot } from '../../core/render';
export type { DotValidationError, LayoutEngine } from '../../core/types';
