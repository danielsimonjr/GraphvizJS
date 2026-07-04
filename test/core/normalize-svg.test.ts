import { describe, expect, it } from 'vitest';
import { normalizeSvg } from '../../core/normalize-svg';
import { renderDotToSvg } from '../../core/render';

describe('normalizeSvg', () => {
  it('adds padding to a Graphviz SVG and reports padded dims', async () => {
    const raw = await renderDotToSvg('digraph { a -> b }', 'dot');
    const { svg, width, height } = normalizeSvg(raw, 10);
    expect(width).toBeGreaterThan(20); // content + 2*10 padding
    expect(height).toBeGreaterThan(20);
    expect(svg).toMatch(/viewBox="/);
    expect(svg).toContain(`width="${width}"`);
    expect(svg).toContain(`height="${height}"`);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('derives dims from viewBox and applies 2*padding', () => {
    const input =
      '<svg width="100pt" height="50pt" viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><g/></svg>';
    const { width, height } = normalizeSvg(input, 10);
    expect(width).toBe(120); // 100 + 2*10
    expect(height).toBe(70); // 50 + 2*10
  });

  it('shifts the viewBox origin by -padding', () => {
    const input = '<svg viewBox="5 7 100 50" xmlns="http://www.w3.org/2000/svg"></svg>';
    const { svg } = normalizeSvg(input, 10);
    // minX 5-10 = -5, minY 7-10 = -3, W/H padded
    expect(svg).toContain('viewBox="-5 -3 120 70"');
  });

  it('falls back to width/height when viewBox is absent', () => {
    const input = '<svg width="80" height="40" xmlns="http://www.w3.org/2000/svg"></svg>';
    const { width, height } = normalizeSvg(input, 5);
    expect(width).toBe(90); // 80 + 2*5
    expect(height).toBe(50);
  });

  it('sanitizes non-positive/NaN dims to 1 and stays finite when applied twice', () => {
    const raw = '<svg viewBox="0 0 0 0" xmlns="http://www.w3.org/2000/svg"></svg>';
    const once = normalizeSvg(raw, 10);
    expect(Number.isFinite(once.width)).toBe(true);
    const twice = normalizeSvg(once.svg, 10);
    expect(Number.isFinite(twice.width)).toBe(true);
  });
});
