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
  it('rejects -o without --fix on validate', () => {
    expect('error' in parseArgs(['validate', 'in.dot', '-o', 'out.svg'])).toBe(true);
  });
  it('requires an input', () => {
    expect('error' in parseArgs(['validate'])).toBe(true);
  });
  it('parses `validate in.dot --fix -o out.dot`', () => {
    const r = parseArgs(['validate', 'in.dot', '--fix', '-o', 'out.dot']);
    expect(r).toMatchObject({ command: 'validate', fix: true, output: 'out.dot' });
  });
  it('allows --fix without -o (stdout)', () => {
    const r = parseArgs(['validate', 'in.dot', '--fix']);
    expect(r).toMatchObject({ command: 'validate', fix: true });
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.output).toBeUndefined();
  });
  it('still accepts --json, --strict, and --engine alongside --fix', () => {
    const r = parseArgs(['validate', 'in.dot', '--json', '--strict', '--engine', 'neato']);
    expect(r).toMatchObject({
      command: 'validate',
      json: true,
      strict: true,
      engine: 'neato',
    });
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

describe('parseArgs stats', () => {
  it('parses a stats input', () => {
    expect(parseArgs(['stats', 'g.dot'])).toMatchObject({
      command: 'stats',
      input: 'g.dot',
      json: false,
    });
  });
  it('parses stats --json and stdin', () => {
    expect(parseArgs(['stats', '-', '--json'])).toMatchObject({
      command: 'stats',
      input: '-',
      json: true,
    });
  });
  it('rejects --engine on stats', () => {
    expect(parseArgs(['stats', 'g.dot', '--engine', 'neato'])).toMatchObject({
      error: expect.stringContaining('Unknown flag'),
    });
  });
  it('rejects -o on stats', () => {
    expect(parseArgs(['stats', 'g.dot', '-o', 'x.txt'])).toMatchObject({
      error: expect.stringContaining('Unknown flag'),
    });
  });
  it('errors when input is missing', () => {
    expect(parseArgs(['stats'])).toMatchObject({
      error: expect.stringContaining('Missing input'),
    });
  });
});
