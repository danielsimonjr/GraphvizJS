import { resolveCandidates } from './scan';
import type { LayerViolation, ParsedFile } from './types';

/** Top-level architecture layer a repo-relative path belongs to. */
export function layerOf(path: string): string {
  if (path.startsWith('core/')) return 'core';
  if (path.startsWith('cli/')) return 'cli';
  if (path.startsWith('electron/')) return 'electron';
  if (path.startsWith('src/')) return 'renderer';
  if (path.startsWith('tools/')) return 'tools';
  if (path.startsWith('test/')) return 'test';
  return 'other';
}

// Which layers each layer may import (besides itself). Encodes the headless
// architecture: core is a self-contained leaf; the CLI and Electron main both
// sit on top of core; the renderer is Graphviz-free (its one allowed reference
// to core is the type-only core/types contract, special-cased below).
const CORE_TYPES = 'core/types.ts';
const POLICY: Record<string, ReadonlySet<string>> = {
  core: new Set(),
  cli: new Set(['core']),
  electron: new Set(['core', 'renderer']),
  renderer: new Set(),
};

/**
 * Check every resolved internal edge against the layer policy. Returns one
 * violation per offending edge. A layer not listed in POLICY (test/tools/other)
 * is not policed as an importer.
 */
export function checkLayering(files: ParsedFile[]): LayerViolation[] {
  const known = new Set(files.map((f) => f.path));
  const out: LayerViolation[] = [];
  for (const file of files) {
    const from = layerOf(file.path);
    const allow = POLICY[from];
    if (!allow) continue;
    for (const dep of file.internalDeps) {
      const to = resolveCandidates(file.path, dep.file).find((c) => known.has(c));
      if (!to) continue;
      const toLayer = layerOf(to);
      if (toLayer === from) continue; // intra-layer edges are always fine

      if (from === 'renderer' && toLayer === 'core') {
        // The renderer may reference core only as the type-only core/types contract.
        if (dep.typeOnly && to === CORE_TYPES) continue;
        out.push({
          from: file.path,
          to,
          spec: dep.file,
          typeOnly: dep.typeOnly,
          rule: 'renderer may import core only as type-only core/types (renderer purity)',
        });
        continue;
      }
      if (allow.has(toLayer)) continue;

      out.push({
        from: file.path,
        to,
        spec: dep.file,
        typeOnly: dep.typeOnly,
        rule:
          from === 'core'
            ? `core must not depend on ${toLayer} (core is a leaf)`
            : `${from} must not depend on ${toLayer}`,
      });
    }
  }
  return out;
}
