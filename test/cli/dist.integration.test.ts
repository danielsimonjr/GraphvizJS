// @vitest-environment node
//
// Exercises the *compiled* CLI distributable (dist-cli/cli/index.js) as a real
// subprocess — the thing `bin.graphvizjs` points at and `npm i -g` installs.
// The in-process cli.integration suite imports main() directly; this one proves
// the shipped artifact runs under Node's own ESM loader: shebang, NodeNext
// module resolution, layout-independent version read, stdin, and the native
// (@resvg/resvg-js) + WASM (@hpcc-js/wasm) deps resolving from node_modules.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const bin = join(repoRoot, 'dist-cli', 'cli', 'index.js');
const tsc = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const dir = mkdtempSync(join(tmpdir(), 'gvjs-dist-'));
const input = join(dir, 'g.dot');
const run = (args: string[], stdin?: string): string =>
  execFileSync(process.execPath, [bin, ...args], { cwd: dir, input: stdin, encoding: 'utf-8' });

describe('graphvizjs compiled distributable', () => {
  // Build from source so the test always reflects current cli/ + core/.
  beforeAll(() => {
    execFileSync(process.execPath, [tsc, '-p', 'tsconfig.cli.json'], { cwd: repoRoot });
    writeFileSync(input, 'digraph { a -> b }', 'utf-8');
  }, 60000);

  it('starts with a node shebang', () => {
    expect(readFileSync(bin, 'utf-8').split('\n', 1)[0]).toBe('#!/usr/bin/env node');
  });

  it('reports the package version (resolved in the compiled layout)', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
    expect(run(['--version'])).toBe(`graphvizjs ${pkg.version}\n`);
  });

  it('renders a file to SVG', () => {
    const out = join(dir, 'file.svg');
    run(['render', input, '-o', out]);
    expect(readFileSync(out, 'utf-8')).toContain('<svg');
  });

  it('renders DOT from stdin', () => {
    const out = join(dir, 'stdin.svg');
    run(['render', '-', '-o', out], 'digraph { x -> y }');
    expect(readFileSync(out, 'utf-8')).toContain('<svg');
  });

  it('renders PNG via the bundled native resvg (magic bytes)', () => {
    const out = join(dir, 'file.png');
    run(['render', input, '-o', out, '--format', 'png']);
    const b = readFileSync(out);
    expect([b[0], b[1], b[2], b[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }, 30000);

  it('validates a file to JSON (valid:true)', () => {
    const parsed = JSON.parse(run(['validate', input, '--json']));
    expect(parsed).toMatchObject({ valid: true, syntax: null, structural: [] });
  }, 30000);

  it('validates a fixable file to JSON, reporting a diagnostic code', () => {
    const fixable = join(dir, 'fixable.dot');
    writeFileSync(fixable, 'digraph { a [shape=boxx] }', 'utf-8');
    const parsed = JSON.parse(run(['validate', fixable, '--json']));
    expect(parsed.valid).toBe(true);
    expect(parsed.structural.length).toBeGreaterThan(0);
    expect(parsed.structural[0]).toHaveProperty('code');
  }, 30000);

  it('formats DOT to stdout', () => {
    const out = run(['format', '-'], 'digraph G {\na->b;\n}');
    expect(out).toContain('digraph G {\n  a -> b;\n}');
  }, 30000);
});
