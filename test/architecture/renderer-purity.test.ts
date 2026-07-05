import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Renderer purity (binding architectural constraint, v2.0.0+):
 *
 * All Graphviz rendering and SVG/PNG/PDF export live in the Node-only `core/`,
 * invoked by the Electron main process (and the CLI) and reached from the
 * renderer ONLY over IPC. The renderer (`src/`) must therefore contain zero
 * Graphviz: it may not import `@hpcc-js/wasm`, and it may not import a *runtime*
 * value from any `core/` render/export module. Type-only imports from
 * `core/types` are allowed (erased at build, never bundled).
 *
 * This test fails loudly if a future change re-introduces render/export logic
 * into the renderer bundle.
 */

const SRC = path.resolve(__dirname, '..', '..', 'src');

function srcFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) {
      out.push(...srcFiles(abs));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(abs);
    }
  }
  return out;
}

const files = srcFiles(SRC).map((abs) => ({
  rel: path.relative(SRC, abs).split(path.sep).join('/'),
  content: readFileSync(abs, 'utf-8'),
}));

/** A runtime import statement (i.e. NOT `import type ...`) whose specifier matches `re`. */
function hasRuntimeImportMatching(content: string, re: RegExp): boolean {
  const importRe = /import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content)) !== null) {
    const isTypeOnly = !!m[1];
    const spec = m[2];
    if (!isTypeOnly && re.test(spec)) return true;
  }
  return false;
}

describe('renderer purity', () => {
  it('no src/ file imports @hpcc-js/wasm', () => {
    const offenders = files.filter((f) => /@hpcc-js\/wasm/.test(f.content)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('no src/ file has a runtime import of a core render/export module', () => {
    // core/types is a pure type module — type-only imports of it are fine, but a
    // RUNTIME import of core/{render,export,export-png,export-pdf,normalize-svg}
    // would drag Graphviz/native deps into the renderer bundle.
    const coreRuntime = /(^|\/)core\/(render|export|export-png|export-pdf|normalize-svg)$/;
    const offenders = files
      .filter((f) => hasRuntimeImportMatching(f.content, coreRuntime))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('the deleted renderer shims stay deleted', () => {
    const shims = files.filter(
      (f) => f.rel === 'preview/graphviz.ts' || f.rel === 'preview/export-pdf.ts'
    );
    expect(shims).toEqual([]);
  });
});
