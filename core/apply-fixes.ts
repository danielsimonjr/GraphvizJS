import type { DiagnosticFix, StructuralDiagnostic } from './types.js';

/**
 * Applies the quick fixes attached to structural diagnostics to `source`.
 *
 * Diagnostics without a `fix` are ignored. Candidate fixes are sorted by
 * start offset ascending; a fix is dropped if its `[from, to)` range
 * overlaps a fix that was already accepted (earliest-starting fix wins).
 * The accepted fixes are then applied right-to-left (descending `from`)
 * so earlier offsets in `source` remain valid as later edits are made.
 */
export function applyFixes(source: string, diagnostics: StructuralDiagnostic[]): string {
  const candidates = diagnostics
    .map((d) => d.fix)
    .filter((fix): fix is DiagnosticFix => fix !== undefined)
    .sort((a, b) => a.from - b.from);

  const accepted: DiagnosticFix[] = [];
  let lastTo = -Infinity;
  for (const fix of candidates) {
    if (fix.from >= lastTo) {
      accepted.push(fix);
      lastTo = fix.to;
    }
  }

  let result = source;
  for (let i = accepted.length - 1; i >= 0; i--) {
    const fix = accepted[i];
    result = result.slice(0, fix.from) + fix.text + result.slice(fix.to);
  }
  return result;
}
