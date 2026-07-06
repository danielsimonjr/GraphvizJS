import { moduleOf } from './categorize';
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
  electron: new Set(['core']), // renderer handled specially (shared modules only)
  renderer: new Set(),
};

// Pure, DOM-free renderer modules the Electron main process may legitimately
// reuse. Anything else in src/ is renderer UI and must stay out of main.
const ELECTRON_SHARED_RENDERER = new Set(['menu', 'watch', 'platform']);

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
      if (from === 'electron' && toLayer === 'renderer') {
        // Electron main may reuse the pure shared renderer modules at runtime,
        // or type-only-reference any renderer type (erased — no runtime coupling).
        if (dep.typeOnly || ELECTRON_SHARED_RENDERER.has(moduleOf(to))) continue;
        out.push({
          from: file.path,
          to,
          spec: dep.file,
          typeOnly: dep.typeOnly,
          rule: `electron may import only the shared renderer modules (${[...ELECTRON_SHARED_RENDERER].join(', ')}), not ${moduleOf(to)}`,
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
