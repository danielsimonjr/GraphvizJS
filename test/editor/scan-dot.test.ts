import { describe, expect, it } from 'vitest';
import { checkBalance, scanDot } from '../../src/editor/scan-dot';

const kinds = (src: string) => scanDot(src).map((s) => `${s.kind}:${src.slice(s.from, s.to)}`);

describe('scanDot', () => {
  it('separates code from a double-quoted string', () => {
    expect(kinds('a="x{y}"')).toEqual(['code:a=', 'string:"x{y}"']);
  });

  it('treats <...> as an HTML label (depth-counted)', () => {
    expect(kinds('l=<a<b>c>')).toEqual(['code:l=', 'html:<a<b>c>']);
  });

  it('captures // and # and /* */ comments', () => {
    expect(kinds('a // c\n')).toEqual(['code:a ', 'comment:// c', 'code:\n']);
    expect(kinds('x /* c */ y')).toEqual(['code:x ', 'comment:/* c */', 'code: y']);
    expect(kinds('# c\n')).toEqual(['comment:# c', 'code:\n']);
  });

  it('marks an unterminated string as not closed', () => {
    const spans = scanDot('a="oops');
    const str = spans.find((s) => s.kind === 'string');
    expect(str?.closed).toBe(false);
  });

  it('honors escaped quotes inside strings', () => {
    expect(kinds('"a\\"b"')).toEqual(['string:"a\\"b"']);
  });
});

describe('checkBalance', () => {
  it('accepts balanced braces and brackets', () => {
    expect(checkBalance('digraph { a [shape=box]; }').balanced).toBe(true);
  });

  it('ignores braces inside strings and comments', () => {
    expect(checkBalance('a="{"; // }\n').balanced).toBe(true);
  });

  it('reports an unclosed brace', () => {
    const r = checkBalance('digraph { a');
    expect(r.balanced).toBe(false);
    expect(r.error?.message).toMatch(/Unclosed/);
  });

  it('reports a mismatched closer', () => {
    expect(checkBalance('a[ }').balanced).toBe(false);
  });

  it('reports an unterminated string', () => {
    const r = checkBalance('a="oops');
    expect(r.balanced).toBe(false);
    expect(r.error?.message).toMatch(/Unterminated string/);
  });
});
