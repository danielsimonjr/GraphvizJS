// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { exportDiagram } from '../../core/export';

const DOT = 'digraph { a -> b }';

describe('exportDiagram', () => {
  it('svg → svg bytes', async () => {
    const r = await exportDiagram(DOT, 'dot', 'svg');
    expect(r.ext).toBe('svg');
    expect(r.mime).toBe('image/svg+xml');
    expect(new TextDecoder().decode(r.bytes)).toContain('<svg');
  });
  it('png and pngx2 → PNG magic; pngx2 larger', async () => {
    const png = await exportDiagram(DOT, 'dot', 'png');
    expect(png.ext).toBe('png');
    expect([png.bytes[0], png.bytes[1], png.bytes[2], png.bytes[3]]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    const png2 = await exportDiagram(DOT, 'dot', 'pngx2');
    expect(png2.bytes.length).toBeGreaterThan(png.bytes.length);
  });
  // Higher timeout: first call pays for jsdom setup + dynamic import of
  // jspdf/svg2pdf.js + WASM graphviz init, which can exceed the 15s suite
  // default under worker contention (see test/core/export-pdf.test.ts).
  it('pdf → %PDF (defaults to fit/letter when no options)', async () => {
    const pdf = await exportDiagram(DOT, 'dot', 'pdf');
    expect(pdf.ext).toBe('pdf');
    expect(String.fromCharCode(pdf.bytes[0], pdf.bytes[1], pdf.bytes[2], pdf.bytes[3])).toBe(
      '%PDF'
    );
  }, 30000);
});
