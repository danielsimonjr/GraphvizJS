import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { exportDiagram } from '../core/export';
import type { ExportFormat } from '../core/types';
import { parseArgs } from './args';

const USAGE = `graphvizjs render <input.dot|-> -o <output> [--engine E] [--format svg|png|pdf]
  [--scale 1|2] [--pdf-page fit|letter|a4] [--pdf-orientation auto|portrait|landscape]
graphvizjs --help | --version`;

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
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8'));
    process.stdout.write(`graphvizjs ${pkg.version}\n`);
    return 0;
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
