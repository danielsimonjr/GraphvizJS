import { describe, expect, it } from 'vitest';
import { applyFixes } from '../../core/apply-fixes';

const d = (from: number, to: number, text: string) => ({
  from,
  to,
  severity: 'warning' as const,
  message: '',
  code: 'x',
  fix: { from, to, text, label: '' },
});

describe('applyFixes', () => {
  it('applies a single fix', () => {
    expect(applyFixes('a [shp=box]', [d(3, 6, 'shape')])).toBe('a [shape=box]');
  });

  it('applies multiple non-overlapping fixes regardless of order', () => {
    const s = 'a [shp=box, dirr=both]';
    const out = applyFixes(s, [d(3, 6, 'shape'), d(12, 16, 'dir')]);
    expect(out).toBe('a [shape=box, dir=both]');
  });

  it('skips overlapping fixes (first-wins by start offset)', () => {
    const out = applyFixes('abcdef', [d(1, 4, 'X'), d(2, 5, 'Y')]);
    expect(out).toBe('aXef');
  });

  it('ignores diagnostics without a fix', () => {
    expect(
      applyFixes('abc', [{ from: 0, to: 1, severity: 'warning', message: '', code: 'x' }])
    ).toBe('abc');
  });
});
