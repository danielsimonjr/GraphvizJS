import { describe, expect, it } from 'vitest';
import { tokenizeDot } from '../../core/parse-graph';

const kinds = (src: string) => tokenizeDot(src).map((t) => `${t.kind}:${t.value}`);

describe('tokenizeDot', () => {
  it('tokenizes a simple directed edge', () => {
    expect(kinds('digraph { a -> b }')).toEqual([
      'id:digraph',
      'lbrace:{',
      'id:a',
      'edgeop:->',
      'id:b',
      'rbrace:}',
    ]);
  });

  it('treats -- as one edge op', () => {
    expect(kinds('graph { a -- b }')).toContain('edgeop:--');
  });

  it('unquotes string ids and concatenates with +', () => {
    expect(kinds('digraph { "a b" -> "c" + "d" }')).toEqual([
      'id:digraph',
      'lbrace:{',
      'id:a b',
      'edgeop:->',
      'id:cd',
      'rbrace:}',
    ]);
  });

  it('collapses ports and compass points to the head id', () => {
    expect(kinds('digraph { a:p:sw -> b:e }')).toEqual([
      'id:digraph',
      'lbrace:{',
      'id:a',
      'edgeop:->',
      'id:b',
      'rbrace:}',
    ]);
  });

  it('keeps an HTML label span as a single id token', () => {
    const t = tokenizeDot('digraph { a [label=<<b>x</b>>] }');
    expect(t.some((x) => x.kind === 'id' && x.value.startsWith('<') && x.value.endsWith('>'))).toBe(
      true
    );
  });

  it('skips comments and never throws on garbage', () => {
    expect(() => tokenizeDot('digraph { a // c\n -> b } /* x')).not.toThrow();
    expect(kinds('digraph { a // hi\n -> b }')).toEqual([
      'id:digraph',
      'lbrace:{',
      'id:a',
      'edgeop:->',
      'id:b',
      'rbrace:}',
    ]);
  });

  it('emits eq for attribute assignments', () => {
    expect(kinds('digraph { rankdir = LR }')).toEqual([
      'id:digraph',
      'lbrace:{',
      'id:rankdir',
      'eq:=',
      'id:LR',
      'rbrace:}',
    ]);
  });
});
