import { describe, expect, it } from 'vitest';
import { toPngBytes } from '../../core/export-png';
import { normalizeSvg } from '../../core/normalize-svg';
import { renderDotToSvg } from '../../core/render';

describe('toPngBytes', () => {
  it('produces a PNG (magic bytes) and @2x is larger than @1x', async () => {
    const { svg, width, height } = normalizeSvg(await renderDotToSvg('digraph { a -> b }'));
    const png = await toPngBytes(svg, width, height, 1);
    expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const png2 = await toPngBytes(svg, width, height, 2);
    expect([png2[0], png2[1], png2[2], png2[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(png2.length).toBeGreaterThan(png.length);
  });

  it('upscales tiny diagrams to at least the min base dimension (512 @1x)', async () => {
    // A tiny diagram: width/height well under 512 -> requiredScale kicks in.
    const { svg, width, height } = normalizeSvg(await renderDotToSvg('digraph { a }'));
    expect(width).toBeLessThan(512);
    const png = await toPngBytes(svg, width, height, 1);
    // Decode the PNG IHDR width (bytes 16-19, big-endian) to confirm >= ~512.
    const w = (png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19];
    expect(w).toBeGreaterThanOrEqual(500);
  });
});
