import { validateDot } from './render.js';
import { structuralDiagnostics } from './structure-lint.js';
import type { DiagramDiagnostics, LayoutEngine } from './types.js';

export type { DiagramDiagnostics } from './types.js';

/**
 * The single source of truth for "what's wrong with this DOT", consumed by both
 * the CLI (`graphvizjs validate`) and the renderer (over the render:validate IPC).
 * Syntax validation requires the Graphviz engine (async); structural analysis is
 * pure. They are independent — structural warnings surface even on valid syntax.
 */
export async function validateDiagram(
  source: string,
  engine: LayoutEngine = 'dot'
): Promise<DiagramDiagnostics> {
  const syntax = await validateDot(source, engine);
  const structural = structuralDiagnostics(source);
  return { syntax, structural };
}
