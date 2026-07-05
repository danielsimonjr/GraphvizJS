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

  it('renders SVG', async () => {
    const out = join(dir, 'o.svg');
    expect(await main(['render', input, '-o', out])).toBe(0);
    expect(readFileSync(out, 'utf-8')).toContain('<svg');
  });
  it('renders PNG (magic bytes)', async () => {
    const out = join(dir, 'o.png');
    expect(await main(['render', input, '-o', out, '--format', 'png'])).toBe(0);
    const b = readFileSync(out);
    expect([b[0], b[1], b[2], b[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
  // Higher timeout: first PDF call pays for jsdom setup + dynamic import of
  // jspdf/svg2pdf.js + WASM graphviz init (see test/core/export-pdf.test.ts).
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
});
