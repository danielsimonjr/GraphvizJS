import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  computeImpact,
  computeStats,
  detectCycles,
  detectUnused,
  mapTestCoverage,
} from './analyze';
import { categorize, computeModuleEdges } from './categorize';
import { analyzeIpcFromRoot } from './ipc';
import { renderJson, renderMarkdown, renderMermaid } from './render';
import { checkLayering } from './rules';
import { scanDir } from './scan';
import type { Analysis, CliOptions } from './types';

const OUT_DIR = 'docs/architecture';

export function parseCli(argv: string[]): CliOptions {
  const impactIdx = argv.indexOf('--impact');
  return {
    includeTests: argv.includes('--include-tests'),
    check: argv.includes('--check'),
    impact: impactIdx >= 0 ? argv[impactIdx + 1] : undefined,
  };
}

/** Count of hard (build-failing) violations: layer breaks, runtime cycles, broken IPC. */
export function hardViolationCount(a: Analysis): number {
  return (
    a.layerViolations.length +
    a.cycles.runtime.length +
    a.ipc.missingHandlers.length +
    a.ipc.orphanHandlers.length +
    a.ipc.missingContract.length
  );
}

export function buildAnalysis(root: string): Analysis {
  // The whole application: the renderer (src/) plus the headless layers the main
  // process and CLI share (core/, cli/, electron/). tools/ audits itself elsewhere.
  const files = [
    ...scanDir(root, 'src'),
    ...scanDir(root, 'core'),
    ...scanDir(root, 'cli'),
    ...scanDir(root, 'electron'),
  ];
  const testFiles = scanDir(root, 'test');
  const modules = categorize(files);
  const moduleEdges = computeModuleEdges(files);
  // Entry-like files that legitimately have no importer:
  //  - src/main.ts (renderer entry, loaded by index.html)
  //  - src/examples/** (loaded via Vite import.meta.glob, not static imports)
  //  - cli/index.ts (bin entry), electron/main.ts + electron/preload.ts (Electron entries)
  const entryLike = new Set(
    files
      .map((f) => f.path)
      .filter(
        (p) =>
          p === 'src/main.ts' ||
          p.startsWith('src/examples/') ||
          p === 'cli/index.ts' ||
          p === 'electron/main.ts' ||
          p === 'electron/preload.ts'
      )
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
    layerViolations: checkLayering(files),
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

function printViolations(a: Analysis): void {
  for (const v of a.layerViolations) {
    console.error(`  ✗ layer: ${v.from} → ${v.to} — ${v.rule}`);
  }
  for (const c of a.cycles.runtime) console.error(`  ✗ runtime cycle: ${c.join(' → ')}`);
  for (const c of a.ipc.missingHandlers) console.error(`  ✗ IPC: ${c.channel} has no handler`);
  for (const c of a.ipc.orphanHandlers) console.error(`  ✗ IPC: ${c.channel} handler is orphaned`);
  for (const c of a.ipc.missingContract) console.error(`  ✗ IPC: ${c.channel} has no contract`);
}

function summaryLine(a: Analysis, prefix: string): string {
  const { missingHandlers, orphanHandlers, missingContract, fullyWired } = a.ipc;
  return (
    `${prefix} Modules: ${a.modules.size}, files: ${a.stats.fileCount}, ` +
    `layer violations: ${a.layerViolations.length}, runtime cycles: ${a.cycles.runtime.length}, ` +
    `dormant: ${a.unused.dormantFiles.length}, IPC ✅ ${fullyWired.length} / ⚠️contract ` +
    `${missingContract.length} / ⚠️handler ${missingHandlers.length} / 🔸 ${orphanHandlers.length}.`
  );
}

export function main(argv: string[]): void {
  if (argv.includes('--help')) {
    console.log(
      'Usage: pnpm graph [--include-tests] [--check] [--impact <file>]\n' +
        '  (default)        Write docs/architecture/{DEPENDENCY_GRAPH.md,.json,.mermaid}\n' +
        '  --check          Verify architecture invariants without writing; exit 1 on any\n' +
        '                   layer violation, runtime cycle, or broken IPC channel.\n' +
        '  --impact <file>  Print the transitive reverse-dependencies (blast radius) of a file.'
    );
    return;
  }
  const root = process.cwd();
  const opts = parseCli(argv);
  const a = buildAnalysis(root);

  if (opts.impact !== undefined) {
    const target = opts.impact.replace(/\\/g, '/').replace(/^\.\//, '');
    const { found, importers } = computeImpact(a.files, a.testFiles, target);
    if (!found) {
      console.error(`No scanned file matches "${target}".`);
      process.exitCode = 1;
      return;
    }
    console.log(`${importers.length} file(s) transitively import ${target}:`);
    for (const f of importers) console.log(`  ${f}`);
    return;
  }

  const failures = hardViolationCount(a);

  if (opts.check) {
    console.log(summaryLine(a, 'Architecture check —'));
    if (failures > 0) {
      console.error(`\n${failures} architecture violation(s):`);
      printViolations(a);
      process.exitCode = 1;
    }
    return;
  }

  const written = writeOutputs(root, a);
  console.log(summaryLine(a, `Wrote ${written.length} files.`));
  if (failures > 0) {
    console.error(`\n${failures} architecture violation(s):`);
    printViolations(a);
    process.exitCode = 1;
  }
}

// Run when invoked directly (tsx tools/dependency-graph/index.ts).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.ts')) {
  main(process.argv.slice(2));
}
