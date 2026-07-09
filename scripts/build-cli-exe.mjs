/**
 * Build a standalone `graphvizjs` executable via Node's Single Executable
 * Applications (SEA) feature — no Node install required to run it.
 *
 * Pipeline: esbuild bundles cli/ + core/ + @hpcc-js/wasm (whose WASM is inlined,
 * so it travels inside the JS) into one CJS file; the native/heavy export deps
 * (@resvg/resvg-js, canvas, jsdom, jspdf, svg2pdf.js) are left external and
 * lazy-loaded — so the exe fully supports `format`, `validate`, `stats`, and
 * `render→svg`, while `render→png/pdf` need the full `pnpm build:cli` install
 * (native .node binaries can't be inlined into a single file). Node's SEA
 * config then produces a blob that postject injects into a copy of the node
 * binary.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Resolve build tools via the CJS resolver — robust against pnpm's isolated
// node_modules layout, where a bare ESM `import 'esbuild'` may not resolve.
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { inject } = require('postject');

const root = process.cwd();
const outDir = path.join(root, 'dist-exe');
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8')).version;

const bundlePath = path.join(outDir, 'graphvizjs.cjs');
const blobPath = path.join(outDir, 'sea-prep.blob');
const seaConfigPath = path.join(outDir, 'sea-config.json');
const exeName = process.platform === 'win32' ? 'graphvizjs.exe' : 'graphvizjs';
const exePath = path.join(outDir, exeName);

// Native/heavy modules used only by png/pdf export — kept external and lazy.
const NATIVE_EXTERNALS = ['@resvg/resvg-js', 'canvas', 'jsdom', 'jspdf', 'svg2pdf.js'];
// Node's fixed SEA fuse sentinel (see nodejs.org SEA docs).
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

async function run() {
  mkdirSync(outDir, { recursive: true });

  console.log('• esbuild bundle (cli + core + @hpcc-js/wasm) …');
  await build({
    entryPoints: [path.join(root, 'scripts', 'exe-entry.mjs')],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: `node${process.versions.node.split('.')[0]}`,
    external: NATIVE_EXTERNALS,
    define: { 'process.env.GRAPHVIZJS_CLI_VERSION': JSON.stringify(version) },
    logLevel: 'warning',
  });

  console.log('• generate SEA blob …');
  writeFileSync(
    seaConfigPath,
    JSON.stringify({ main: bundlePath, output: blobPath, disableExperimentalSEAWarning: true })
  );
  execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], {
    stdio: 'inherit',
  });

  console.log('• inject blob into node binary …');
  copyFileSync(process.execPath, exePath);
  await inject(exePath, 'NODE_SEA_BLOB', readFileSync(blobPath), { sentinelFuse: FUSE });

  console.log('• self-verify the produced exe …');
  verify(exePath);

  console.log(`\n✅ standalone CLI: ${path.relative(root, exePath)}  (v${version})`);
  console.log('   supports: format · validate · stats · render→svg · --help/--version');
  console.log('   png/pdf need the native install (pnpm build:cli).');
}

function verify(exe) {
  const call = (args, input) => execFileSync(exe, args, { input, encoding: 'utf-8' });
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`exe self-check failed: ${msg}`);
  };

  const v = call(['--version']).trim();
  assert(v === `graphvizjs ${version}`, `--version was "${v}"`);

  const formatted = call(['format', '-'], 'digraph G {\na->b;\n}');
  assert(formatted.includes('digraph G {\n  a -> b;\n}'), `format output was "${formatted}"`);

  const validated = JSON.parse(call(['validate', '-', '--json'], 'digraph { a -> b }'));
  assert(validated.valid === true && validated.syntax === null, 'validate --json not valid:true');

  const stats = JSON.parse(call(['stats', '-', '--json'], 'digraph { a -> b -> a }'));
  assert(stats.hasCycle === true && stats.nodeCount === 2, 'stats --json wrong');

  const dot = path.join(outDir, '_verify.dot');
  const svg = path.join(outDir, '_verify.svg');
  writeFileSync(dot, 'digraph { a -> b }');
  call(['render', dot, '-o', svg]);
  assert(readFileSync(svg, 'utf-8').includes('<svg'), 'render→svg produced no <svg');
  rmSync(dot, { force: true });
  rmSync(svg, { force: true });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
