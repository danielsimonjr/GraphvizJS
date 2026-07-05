import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../cli/args';

describe('parseArgs', () => {
  it('parses render with engine/scale', () => {
    const a = parseArgs(['render', 'in.dot', '-o', 'out.png', '--engine', 'neato', '--scale', '2']);
    expect(a).toMatchObject({
      command: 'render',
      input: 'in.dot',
      output: 'out.png',
      engine: 'neato',
      scale: 2,
    });
  });
  it('infers format from output extension', () => {
    expect(parseArgs(['render', 'in.dot', '-o', 'out.pdf'])).toMatchObject({ format: 'pdf' });
    expect(parseArgs(['render', 'in.dot', '-o', 'out.svg'])).toMatchObject({ format: 'svg' });
  });
  it('errors on unknown engine, bad scale, missing output, unknown flag', () => {
    expect('error' in parseArgs(['render', 'in.dot', '-o', 'x.svg', '--engine', 'bogus'])).toBe(
      true
    );
    expect('error' in parseArgs(['render', 'in.dot', '-o', 'x.png', '--scale', '3'])).toBe(true);
    expect('error' in parseArgs(['render', 'in.dot'])).toBe(true);
    expect('error' in parseArgs(['render', 'in.dot', '-o', 'x.svg', '--nope'])).toBe(true);
  });
  it('maps --pdf-page', () => {
    expect(parseArgs(['render', 'i.dot', '-o', 'o.pdf', '--pdf-page', 'a4'])).toMatchObject({
      pdf: { mode: 'standard', pageSize: 'a4' },
    });
    expect(parseArgs(['render', 'i.dot', '-o', 'o.pdf', '--pdf-page', 'fit'])).toMatchObject({
      pdf: { mode: 'fit' },
    });
  });
  it('recognizes help/version', () => {
    expect(parseArgs(['--help'])).toMatchObject({ command: 'help' });
    expect(parseArgs(['-v'])).toMatchObject({ command: 'version' });
  });
});
