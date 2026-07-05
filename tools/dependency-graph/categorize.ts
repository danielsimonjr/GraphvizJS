import { resolveCandidates } from './scan';
import type { ModuleEdges, ModuleMap, ParsedFile } from './types';

/**
 * Module name for a repo-relative path.
 *  - Renderer/test tree: 'src/<module>/...' or 'test/<module>/...' → <module>;
 *    a top-level file ('src/main.ts') → 'root'.
 *  - Top-level app layers ('core/render.ts', 'cli/index.ts', 'electron/main.ts')
 *    → the layer name itself ('core', 'cli', 'electron').
 */
export function moduleOf(relPath: string): string {
  const parts = relPath.split('/');
  if (parts[0] === 'src' || parts[0] === 'test') {
    // parts[1] is the subdir module; a file directly under src/ or test/ is 'root'.
    return parts.length > 2 ? parts[1] : 'root';
  }
  return parts[0];
}

export function categorize(files: ParsedFile[]): ModuleMap {
  const map: ModuleMap = new Map();
  for (const f of files) {
    const mod = moduleOf(f.path);
    const list = map.get(mod) ?? [];
    list.push(f.path);
    map.set(mod, list);
  }
  return map;
}

export function computeModuleEdges(files: ParsedFile[]): ModuleEdges {
  const known = new Set(files.map((f) => f.path));
  const edges: ModuleEdges = new Map();
  for (const f of files) {
    const from = moduleOf(f.path);
    for (const dep of f.internalDeps) {
      const target = resolveCandidates(f.path, dep.file).find((c) => known.has(c));
      if (!target) continue;
      const to = moduleOf(target);
      if (to === from) continue;
      const set = edges.get(from) ?? new Set<string>();
      set.add(to);
      edges.set(from, set);
    }
  }
  return edges;
}
