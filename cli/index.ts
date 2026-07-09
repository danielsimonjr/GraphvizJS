#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyFixes } from '../core/apply-fixes.js';
import { exportDiagram } from '../core/export.js';
import { formatDot } from '../core/format.js';
import { graphStats } from '../core/graph-stats.js';
import type { ExportFormat, GraphStats } from '../core/types.js';
import { validateDiagram } from '../core/validate.js';
import { parseArgs } from './args.js';

const USAGE = `graphvizjs render <input.dot|-> -o <output> [--engine E] [--format svg|png|pdf]
  [--scale 1|2] [--pdf-page fit|letter|a4] [--pdf-orientation auto|portrait|landscape]
graphvizjs validate <input.dot|-> [--engine E] [--json] [--strict] [--fix] [-o <output>]
graphvizjs format <input.dot|-> [-o <output>]
graphvizjs stats <input.dot|-> [--json]
graphvizjs --help | --version`;

/** 1-based line/column for a 0-based character offset into `source`. */
export function offsetToLineCol(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  const end = Math.min(offset, source.length);
  for (let i = 0; i < end; i++) {
    if (source[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

/** Render stats as aligned `label: value` lines (roots/leaves only when directed). */
export function formatStats(stats: GraphStats): string {
  const yn = (b: boolean): string => (b ? 'yes' : 'no');
  const rows: [string, string][] = [
    ['directed', yn(stats.directed)],
    ['strict', yn(stats.strict)],
    ['nodes', String(stats.nodeCount)],
    ['edges', String(stats.edgeCount)],
    ['subgraphs', String(stats.subgraphCount)],
    ['clusters', String(stats.clusterCount)],
  ];
  if (stats.directed) {
    rows.push(['roots', String(stats.roots)], ['leaves', String(stats.leaves)]);
  }
  rows.push(
    ['isolated', String(stats.isolated)],
    ['self-loops', String(stats.selfLoops)],
    ['cycles', yn(stats.hasCycle)]
  );
  const width = Math.max(...rows.map(([label]) => label.length)) + 1; // +1 for the colon
  return rows.map(([label, value]) => `${`${label}:`.padEnd(width + 1)} ${value}`).join('\n');
}

/**
 * Read this package's version from the nearest ancestor package.json. Walking up
 * from the module's own location (rather than a fixed relative path) keeps the
 * lookup correct whether we run from source via tsx (`cli/index.ts`) or from the
 * compiled binary (`dist-cli/cli/index.js`), where the depth to package.json differs.
 *
 * The standalone SEA exe has no package.json on disk beside it, so the exe build
 * (scripts/build-cli-exe.mjs) injects the version via an esbuild `define` of
 * `process.env.GRAPHVIZJS_CLI_VERSION`, which this checks first.
 */
async function readPackageVersion(): Promise<string> {
  if (process.env.GRAPHVIZJS_CLI_VERSION) return process.env.GRAPHVIZJS_CLI_VERSION;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try {
      const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf-8'));
      if (typeof pkg.version === 'string') return pkg.version;
    } catch {
      // No readable package.json at this level — keep walking toward the root.
    }
    const parent = dirname(dir);
    if (parent === dir) return '0.0.0';
    dir = parent;
  }
}

async function readInput(input: string): Promise<string> {
  if (input === '-') {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf-8');
  }
  return readFile(input, 'utf-8');
}

/** Runs the `graphvizjs` CLI for the given argv (excluding node/script path); returns the exit code. */
export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    process.stderr.write(`${parsed.error}\n\n${USAGE}\n`);
    return 2;
  }
  if (parsed.command === 'help') {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (parsed.command === 'version') {
    process.stdout.write(`graphvizjs ${await readPackageVersion()}\n`);
    return 0;
  }
  if (parsed.command === 'validate') {
    try {
      const dot = await readInput(parsed.input!);
      const { syntax, structural } = await validateDiagram(dot, parsed.engine);

      if (parsed.fix) {
        const corrected = applyFixes(dot, structural);
        if (parsed.output) await writeFile(parsed.output, corrected);
        else process.stdout.write(corrected.endsWith('\n') ? corrected : `${corrected}\n`);
        return 0;
      }

      const failed = syntax !== null || (parsed.strict === true && structural.length > 0);
      const name = parsed.input === '-' ? '<stdin>' : parsed.input!;

      if (parsed.json) {
        process.stdout.write(
          `${JSON.stringify({
            input: name,
            engine: parsed.engine,
            valid: !failed,
            syntax,
            structural: structural.map((d) => ({
              severity: d.severity,
              message: d.message,
              code: d.code,
              fix: d.fix,
              ...offsetToLineCol(dot, d.from),
            })),
          })}\n`
        );
      } else {
        if (syntax) {
          const loc = syntax.line
            ? `:${syntax.line}${syntax.column ? `:${syntax.column}` : ''}`
            : '';
          process.stderr.write(`${name}${loc}: error: ${syntax.message}\n`);
        }
        for (const d of structural) {
          const { line, column } = offsetToLineCol(dot, d.from);
          process.stderr.write(`${name}:${line}:${column}: ${d.severity}: ${d.message}\n`);
        }
        if (!failed) process.stdout.write(`${name}: ok\n`);
      }
      return failed ? 1 : 0;
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  }
  if (parsed.command === 'format') {
    try {
      const dot = await readInput(parsed.input!);
      const formatted = formatDot(dot);
      if (parsed.output) await writeFile(parsed.output, formatted);
      else process.stdout.write(formatted.endsWith('\n') ? formatted : `${formatted}\n`);
      return 0;
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  }
  if (parsed.command === 'stats') {
    try {
      const dot = await readInput(parsed.input!);
      const stats = graphStats(dot);
      const name = parsed.input === '-' ? '<stdin>' : parsed.input!;
      if (parsed.json) {
        process.stdout.write(`${JSON.stringify({ input: name, ...stats })}\n`);
      } else {
        process.stdout.write(`${formatStats(stats)}\n`);
      }
      return 0;
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  }
  // render
  try {
    const dot = await readInput(parsed.input!);
    const format: ExportFormat =
      parsed.format === 'png' && parsed.scale === 2 ? 'pngx2' : (parsed.format ?? 'svg');
    const result = await exportDiagram(dot, parsed.engine, format, parsed.pdf);
    await writeFile(parsed.output!, result.bytes);
    return 0;
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

// Self-invoke when run directly (tsx cli/index.ts / bin), as opposed to being
// imported by the test suite. Compare resolved file:// URLs (not raw path
// strings) so this works cross-platform, including Windows drive-letter paths.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
