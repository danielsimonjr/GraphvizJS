import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { computeStats, detectCycles, detectUnused, mapTestCoverage } from './analyze';
import { categorize, computeModuleEdges } from './categorize';
import { analyzeIpcFromRoot } from './ipc';
import { renderJson, renderMarkdown, renderMermaid } from './render';
import { scanDir } from './scan';
import type { Analysis, CliOptions } from './types';

const OUT_DIR = 'docs/architecture';

export function parseCli(argv: string[]): CliOptions {
  return { includeTests: argv.includes('--include-tests') };
}

export function buildAnalysis(root: string): Analysis {
  const files = scanDir(root, 'src');
  const testFiles = scanDir(root, 'test');
  const modules = categorize(files);
  const moduleEdges = computeModuleEdges(files);
  // Entry-like files that legitimately have no importer:
  //  - src/main.ts (app entry, loaded by index.html)
  //  - src/examples/** (loaded via Vite import.meta.glob, not static imports)
  const entryLike = new Set(
    files.map((f) => f.path).filter((p) => p === 'src/main.ts' || p.startsWith('src/examples/'))
  );
  return {
    files,
    testFiles,
    modules,
    moduleEdges,
    cycles: detectCycles(files),
    unused: detectUnused(files, testFiles, entryLike),
    coverage: mapTestCoverage(files, testFiles),
    ipc: analyzeIpcFromRoot(root),
    stats: computeStats(files, modules, moduleEdges),
  };
}

export function writeOutputs(root: string, a: Analysis): string[] {
  const dir = path.join(root, OUT_DIR);
  mkdirSync(dir, { recursive: true });
  const md = path.join(dir, 'DEPENDENCY_GRAPH.md');
  const json = path.join(dir, 'dependency-graph.json');
  const mermaid = path.join(dir, 'dependency-graph.mermaid');
  writeFileSync(md, renderMarkdown(a), 'utf-8');
  writeFileSync(json, renderJson(a), 'utf-8');
  writeFileSync(mermaid, renderMermaid(a.modules, a.moduleEdges), 'utf-8');
  return [md, json, mermaid];
}

export function main(argv: string[]): void {
  if (argv.includes('--help')) {
    console.log(
      'Usage: pnpm graph [--include-tests]\n' +
        'Writes docs/architecture/{DEPENDENCY_GRAPH.md,dependency-graph.json,dependency-graph.mermaid}'
    );
    return;
  }
  const root = process.cwd();
  const a = buildAnalysis(root);
  const written = writeOutputs(root, a);
  const { missingHandlers, orphanHandlers, missingContract, fullyWired } = a.ipc;
  console.log(
    `Wrote ${written.length} files. Modules: ${a.modules.size}, files: ${a.stats.fileCount}, ` +
      `IPC ✅ ${fullyWired.length} / ⚠️contract ${missingContract.length} / ` +
      `⚠️handler ${missingHandlers.length} / 🔸 ${orphanHandlers.length}, ` +
      `runtime cycles: ${a.cycles.runtime.length}.`
  );
  if (missingHandlers.length > 0 || orphanHandlers.length > 0 || missingContract.length > 0) {
    process.exitCode = 1;
  }
}

// Run when invoked directly (tsx tools/dependency-graph/index.ts).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.ts')) {
  main(process.argv.slice(2));
}
