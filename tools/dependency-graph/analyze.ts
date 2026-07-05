import { resolveCandidates } from './scan';
import type {
  CoverageRow,
  CycleReport,
  ModuleEdges,
  ModuleMap,
  ParsedFile,
  Stats,
  UnusedReport,
} from './types';

const cycleKey = (c: string[]): string => [...c].sort().join('->');

/** Resolve a file's internal deps to known targets, optionally runtime-only. */
function edgesOf(file: ParsedFile, known: Set<string>, runtimeOnly: boolean): string[] {
  const out: string[] = [];
  for (const dep of file.internalDeps) {
    if (runtimeOnly && dep.typeOnly) continue;
    const target = resolveCandidates(file.path, dep.file).find((c) => known.has(c));
    if (target) out.push(target);
  }
  return out;
}

function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  const dfs = (node: string, pathAcc: string[]): void => {
    if (inStack.has(node)) {
      const start = pathAcc.indexOf(node);
      if (start !== -1) {
        const cycle = [...pathAcc.slice(start), node];
        const key = cycleKey(cycle);
        if (!cycles.some((c) => cycleKey(c) === key)) cycles.push(cycle);
      }
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    inStack.add(node);
    pathAcc.push(node);
    for (const next of graph.get(node) ?? []) dfs(next, pathAcc);
    pathAcc.pop();
    inStack.delete(node);
  };

  for (const node of graph.keys()) if (!visited.has(node)) dfs(node, []);
  return cycles;
}

export function detectCycles(files: ParsedFile[]): CycleReport {
  const known = new Set(files.map((f) => f.path));
  const runtimeGraph = new Map<string, string[]>();
  const allGraph = new Map<string, string[]>();
  for (const file of files) {
    runtimeGraph.set(file.path, edgesOf(file, known, true));
    allGraph.set(file.path, edgesOf(file, known, false));
  }
  const runtime = findCycles(runtimeGraph);
  const all = findCycles(allGraph);
  const runtimeKeys = new Set(runtime.map((c) => cycleKey(c)));
  const typeOnly = all.filter((c) => !runtimeKeys.has(cycleKey(c)));
  return { runtime, typeOnly };
}

export function detectUnused(
  files: ParsedFile[],
  testFiles: ParsedFile[],
  entryLike: Set<string>
): UnusedReport {
  const known = new Set(files.map((f) => f.path));
  const importedFiles = new Set<string>();
  const importedNames = new Map<string, Set<string>>();
  const adjacency = new Map<string, string[]>();

  for (const file of [...files, ...testFiles]) {
    const targets: string[] = [];
    for (const dep of file.internalDeps) {
      const target = resolveCandidates(file.path, dep.file).find((c) => known.has(c));
      if (!target) continue;
      targets.push(target);
      importedFiles.add(target);
      const set = importedNames.get(target) ?? new Set<string>();
      for (const imp of dep.imports) {
        set.add(imp === '*' || imp.startsWith('* as ') ? '*' : imp);
      }
      importedNames.set(target, set);
    }
    adjacency.set(file.path, targets);
  }

  const unusedFiles = files
    .map((f) => f.path)
    .filter((p) => !importedFiles.has(p) && !entryLike.has(p));

  // Files reachable by following imports out of any entry-like or test root.
  const reachable = new Set<string>();
  const stack = [...entryLike, ...testFiles.map((t) => t.path)];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    for (const next of adjacency.get(cur) ?? []) {
      if (!reachable.has(next)) stack.push(next);
    }
  }
  // Dormant = has an importer (so `unusedFiles` misses it) yet is unreachable
  // from every root — a dead import cluster.
  const dormantFiles = files
    .map((f) => f.path)
    .filter((p) => importedFiles.has(p) && !reachable.has(p) && !entryLike.has(p))
    .sort();

  const unusedExports: { file: string; name: string }[] = [];
  for (const file of files) {
    const used = importedNames.get(file.path);
    if (used?.has('*')) continue; // wildcard import consumes all
    for (const name of file.exports) {
      if (!used?.has(name)) unusedExports.push({ file: file.path, name });
    }
  }
  return { unusedFiles, dormantFiles, unusedExports };
}

export function mapTestCoverage(srcFiles: ParsedFile[], testFiles: ParsedFile[]): CoverageRow[] {
  const known = new Set(srcFiles.map((f) => f.path));
  const cover = new Map<string, string[]>();
  for (const f of srcFiles) cover.set(f.path, []);
  for (const test of testFiles) {
    for (const dep of test.internalDeps) {
      const target = resolveCandidates(test.path, dep.file).find((c) => known.has(c));
      if (target) cover.get(target)?.push(test.path);
    }
  }
  return [...cover.entries()].map(([file, testFilesList]) => ({
    file,
    testFiles: [...new Set(testFilesList)],
  }));
}

/**
 * Transitive reverse-dependencies of `target`: every source or test file that
 * imports it directly or indirectly (its "blast radius"). `found` is false when
 * no scanned file matches `target`.
 */
export function computeImpact(
  files: ParsedFile[],
  testFiles: ParsedFile[],
  target: string
): { found: boolean; importers: string[] } {
  const all = [...files, ...testFiles];
  const known = new Set(all.map((f) => f.path));
  if (!known.has(target)) return { found: false, importers: [] };

  // Reverse adjacency: imported file -> files that import it.
  const importedBy = new Map<string, string[]>();
  for (const f of all) {
    for (const dep of f.internalDeps) {
      const to = resolveCandidates(f.path, dep.file).find((c) => known.has(c));
      if (!to) continue;
      const list = importedBy.get(to) ?? [];
      list.push(f.path);
      importedBy.set(to, list);
    }
  }

  const impacted = new Set<string>();
  const stack = [target];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    for (const importer of importedBy.get(cur) ?? []) {
      if (!impacted.has(importer)) {
        impacted.add(importer);
        stack.push(importer);
      }
    }
  }
  return { found: true, importers: [...impacted].sort() };
}

export function computeStats(files: ParsedFile[], modules: ModuleMap, edges: ModuleEdges): Stats {
  const known = new Set(files.map((f) => f.path));
  let edgeCount = 0;
  let exportCount = 0;
  for (const f of files) {
    edgeCount += edgesOf(f, known, false).length;
    exportCount += f.exports.length;
  }
  void edges; // module edges reported separately; file edges counted here
  return {
    fileCount: files.length,
    moduleCount: modules.size,
    totalLoc: files.reduce((n, f) => n + f.loc, 0),
    edgeCount,
    exportCount,
  };
}
