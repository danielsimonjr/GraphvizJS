// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computePageGeometry, svgToPdfBytes } from '../../core/export-pdf';
import { normalizeSvg } from '../../core/normalize-svg';
import { renderDotToSvg } from '../../core/render';

describe('core/export-pdf', () => {
  it('computePageGeometry fit = diagram bounds in pt', () => {
    const g = computePageGeometry(96, 48, { mode: 'fit', pageSize: 'letter', orientation: 'auto' });
    expect(g.pageWidth).toBeCloseTo(72); // 96px * 72/96
    expect(g.draw.width).toBeCloseTo(72);
    expect(g.orientation).toBe('landscape');
  });
  it('computePageGeometry standard centers on a Letter page', () => {
    const g = computePageGeometry(100, 100, {
      mode: 'standard',
      pageSize: 'letter',
      orientation: 'portrait',
    });
    expect(g.pageWidth).toBe(612);
    expect(g.pageHeight).toBe(792);
    expect(g.draw.x).toBeGreaterThan(0);
  });
  // Higher timeout: first call pays for jsdom setup + dynamic import of
  // jspdf/svg2pdf.js + WASM graphviz init, which can be slow under full-suite
  // parallel worker contention (observed >15s, the suite default).
  it('produces a genuine VECTOR PDF headless (no raster image)', async () => {
    const { svg, width, height } = normalizeSvg(await renderDotToSvg('digraph { a -> b }'));
    const pdf = await svgToPdfBytes(svg, width, height, {
      mode: 'fit',
      pageSize: 'letter',
      orientation: 'auto',
    });
    expect(String.fromCharCode(pdf[0], pdf[1], pdf[2], pdf[3])).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(800);
    // Vector check: latin1 view has text ops and NO image XObject.
    const s = Buffer.from(pdf).toString('latin1');
    expect(s).not.toMatch(/\/Subtype\s*\/Image/);
    expect(s).toMatch(/BT|\/Font/); // real text, not rasterized
  }, 30000);
});
