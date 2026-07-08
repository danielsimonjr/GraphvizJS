// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { main } from '../../cli/index';

describe('graphvizjs CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gvjs-cli-'));
  const input = join(dir, 'g.dot');
  writeFileSync(input, 'digraph { a -> b }', 'utf-8');

  // Higher timeout on every real render: the first one pays for WASM graphviz
  // init (SVG), the first PNG pays for the native @resvg/resvg-js load, and the
  // first PDF pays for jsdom + dynamic jspdf/svg2pdf.js — each can exceed the
  // 15s default on a cold, loaded CI runner (see test/core/export-*.test.ts).
  it('renders SVG', async () => {
    const out = join(dir, 'o.svg');
    expect(await main(['render', input, '-o', out])).toBe(0);
    expect(readFileSync(out, 'utf-8')).toContain('<svg');
  }, 30000);
  it('renders PNG (magic bytes)', async () => {
    const out = join(dir, 'o.png');
    expect(await main(['render', input, '-o', out, '--format', 'png'])).toBe(0);
    const b = readFileSync(out);
    expect([b[0], b[1], b[2], b[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }, 30000);
  it('renders PDF (%PDF)', async () => {
    const out = join(dir, 'o.pdf');
    expect(await main(['render', input, '-o', out, '--format', 'pdf'])).toBe(0);
    expect(readFileSync(out).subarray(0, 4).toString('latin1')).toBe('%PDF');
  }, 30000);
  it('exits 2 on bad args, 1 on missing input file', async () => {
    expect(await main(['render'])).toBe(2);
    expect(await main(['render', join(dir, 'nope.dot'), '-o', join(dir, 'x.svg')])).toBe(1);
  });

  it('prints the package version resolved from the nearest package.json', async () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    const code = await main(['--version']);
    spy.mockRestore();
    expect(code).toBe(0);
    expect(writes.join('')).toBe(`graphvizjs ${pkg.version}\n`);
  });

  /** Run main(argv) capturing stdout; returns { code, out }. */
  async function runCapture(argv: string[]): Promise<{ code: number; out: string }> {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const code = await main(argv);
      return { code, out: writes.join('') };
    } finally {
      spy.mockRestore();
      errSpy.mockRestore();
    }
  }

  describe('validate', () => {
    it('valid DOT → exit 0, --json reports valid:true', async () => {
      const { code, out } = await runCapture(['validate', input, '--json']);
      expect(code).toBe(0);
      const parsed = JSON.parse(out);
      expect(parsed).toMatchObject({ valid: true, syntax: null, structural: [] });
    }, 30000);

    it('structural warning → exit 0 by default, exit 1 with --strict', async () => {
      const warn = join(dir, 'warn.dot');
      writeFileSync(warn, 'digraph { a [shp=box] }', 'utf-8');
      const lenient = await runCapture(['validate', warn, '--json']);
      expect(lenient.code).toBe(0);
      const parsed = JSON.parse(lenient.out);
      expect(parsed.syntax).toBeNull();
      expect(parsed.structural.length).toBeGreaterThan(0);
      const strict = await runCapture(['validate', warn, '--strict']);
      expect(strict.code).toBe(1);
    }, 30000);

    it('syntax error → exit 1 and valid:false', async () => {
      const bad = join(dir, 'bad.dot');
      writeFileSync(bad, 'digraph { a -> }', 'utf-8');
      const { code, out } = await runCapture(['validate', bad, '--json']);
      expect(code).toBe(1);
      expect(JSON.parse(out).valid).toBe(false);
    }, 30000);

    it('unknown flag → exit 2', async () => {
      expect((await runCapture(['validate', input, '--nope'])).code).toBe(2);
    });
  });
});
