import { describe, expect, it } from 'vitest';
import { computePageGeometry, type PdfExportOptions } from '../../src/preview/export-pdf';

const fit: PdfExportOptions = { mode: 'fit', pageSize: 'letter', orientation: 'auto' };

describe('computePageGeometry', () => {
  it('fit mode: page equals the diagram size in pt (px * 72/96)', () => {
    const g = computePageGeometry(400, 300, fit);
    expect(g.pageWidth).toBeCloseTo(300, 5); // 400 * 0.75
    expect(g.pageHeight).toBeCloseTo(225, 5); // 300 * 0.75
    expect(g.orientation).toBe('landscape'); // 400 > 300
    expect(g.draw).toEqual({ x: 0, y: 0, width: 300, height: 225 });
  });

  it('standard letter auto: wide diagram → landscape 792x612, scaled + centered with 24pt margin', () => {
    const g = computePageGeometry(1000, 500, {
      mode: 'standard',
      pageSize: 'letter',
      orientation: 'auto',
    });
    expect(g.orientation).toBe('landscape');
    expect(g.pageWidth).toBeCloseTo(792, 1);
    expect(g.pageHeight).toBeCloseTo(612, 1);
    // diagram pt = 750 x 375; scale = min((792-48)/750, (612-48)/375)
    const diagW = 750;
    const diagH = 375;
    const scale = Math.min((792 - 48) / diagW, (612 - 48) / diagH);
    expect(g.draw.width).toBeCloseTo(diagW * scale, 1);
    expect(g.draw.height).toBeCloseTo(diagH * scale, 1);
    expect(g.draw.x).toBeCloseTo((792 - diagW * scale) / 2, 1);
    expect(g.draw.y).toBeCloseTo((612 - diagH * scale) / 2, 1);
  });

  it('standard a4 portrait explicit: tall page 595.28x841.89', () => {
    const g = computePageGeometry(300, 900, {
      mode: 'standard',
      pageSize: 'a4',
      orientation: 'portrait',
    });
    expect(g.orientation).toBe('portrait');
    expect(g.pageWidth).toBeCloseTo(595.28, 1);
    expect(g.pageHeight).toBeCloseTo(841.89, 1);
  });
});
