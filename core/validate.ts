import { validateDot } from './render.js';
import { type StructuralDiagnostic, structuralDiagnostics } from './structure-lint.js';
import type { DotValidationError, LayoutEngine } from './types.js';

/** The full diagnostic verdict for a diagram: Graphviz syntax + pure structural checks. */
export interface DiagramDiagnostics {
  syntax: DotValidationError | null;
  structural: StructuralDiagnostic[];
}

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
