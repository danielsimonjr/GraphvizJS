import { describe, expect, it } from 'vitest';
import { renderDotToSvg, validateDot } from '../../core/render';

describe('core/render', () => {
  it('renders DOT to an SVG string', async () => {
    const svg = await renderDotToSvg('digraph { a -> b }', 'dot');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
  it('validates: null for valid, error for invalid', async () => {
    expect(await validateDot('digraph { a -> b }')).toBeNull();
    const err = await validateDot('digraph { a -> ');
    expect(err).not.toBeNull();
    expect(err?.message).toBeTruthy();
  });
});
