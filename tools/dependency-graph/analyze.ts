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
        const key = [...cycle].sort().join('->');
        if (!cycles.some((c) => [...c].sort().join('->') === key)) cycles.push(cycle);
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
  const runtimeKeys = new Set(runtime.map((c) => [...c].sort().join('->')));
  const typeOnly = all.filter((c) => !runtimeKeys.has([...c].sort().join('->')));
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

  for (const file of [...files, ...testFiles]) {
    for (const dep of file.internalDeps) {
      const target = resolveCandidates(file.path, dep.file).find((c) => known.has(c));
      if (!target) continue;
      importedFiles.add(target);
      const set = importedNames.get(target) ?? new Set<string>();
      for (const imp of dep.imports) set.add(imp === '*' ? '*' : imp.replace(/^\* as /, ''));
      importedNames.set(target, set);
    }
  }

  const unusedFiles = files
    .map((f) => f.path)
    .filter((p) => !importedFiles.has(p) && !entryLike.has(p));

  const unusedExports: { file: string; name: string }[] = [];
  for (const file of files) {
    const used = importedNames.get(file.path);
    if (used?.has('*')) continue; // wildcard import consumes all
    for (const name of file.exports) {
      if (!used?.has(name)) unusedExports.push({ file: file.path, name });
    }
  }
  return { unusedFiles, unusedExports };
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
