import { resolveCandidates } from './scan';
import type { ModuleEdges, ModuleMap, ParsedFile } from './types';

/** Module name for a repo-relative path: 'src/<module>/...' → <module>; 'src/x.ts' → 'root'. */
export function moduleOf(relPath: string): string {
  const parts = relPath.split('/');
  // parts[0] is 'src' or 'test'; a nested file has a subdir at parts[1].
  return parts.length > 2 ? parts[1] : 'root';
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
