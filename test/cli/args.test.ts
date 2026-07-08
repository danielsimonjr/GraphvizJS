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
  it('accepts "-" as the stdin input, not an unknown flag', () => {
    expect(parseArgs(['render', '-', '-o', 'out.svg'])).toMatchObject({
      command: 'render',
      input: '-',
      output: 'out.svg',
    });
  });
});

describe('parseArgs — validate', () => {
  it('parses `validate in.dot --json`', () => {
    const r = parseArgs(['validate', 'in.dot', '--json']);
    expect(r).toMatchObject({ command: 'validate', input: 'in.dot', json: true });
  });
  it('parses `--engine` and `--strict`', () => {
    const r = parseArgs(['validate', '-', '--engine', 'neato', '--strict']);
    expect(r).toMatchObject({ command: 'validate', input: '-', engine: 'neato', strict: true });
  });
  it('rejects an unknown engine', () => {
    expect('error' in parseArgs(['validate', 'in.dot', '--engine', 'nope'])).toBe(true);
  });
  it('rejects render-only flags on validate', () => {
    expect('error' in parseArgs(['validate', 'in.dot', '-o', 'out.svg'])).toBe(true);
  });
  it('requires an input', () => {
    expect('error' in parseArgs(['validate'])).toBe(true);
  });
});

describe('parseArgs — format', () => {
  it('parses `format in.dot -o out.dot`', () => {
    const r = parseArgs(['format', 'in.dot', '-o', 'out.dot']);
    expect(r).toMatchObject({ command: 'format', input: 'in.dot', output: 'out.dot' });
  });
  it('allows format without -o (stdout)', () => {
    const r = parseArgs(['format', 'in.dot']);
    expect(r).toMatchObject({ command: 'format', input: 'in.dot' });
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.output).toBeUndefined();
  });
  it('rejects an unknown flag on format', () => {
    expect('error' in parseArgs(['format', 'in.dot', '--engine', 'dot'])).toBe(true);
  });
});
