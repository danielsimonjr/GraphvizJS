import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { buildDotVocabulary } from '../../core/dot-vocab';
import type { DotVocabulary } from '../../core/types';
import { createDotLanguage } from '../../src/editor/language';

const VOCAB = buildDotVocabulary();

/** One highlighted piece of a document: the token type that the syntax tree names, and its text. */
interface Token {
  type: string;
  text: string;
}

/** Read every token of a document from the syntax tree that the given extensions build. */
function tokensOf(doc: string, extensions: Extension[]): Token[] {
  const state = EditorState.create({ doc, extensions });
  const tokens: Token[] = [];
  ensureSyntaxTree(state, state.doc.length, 1000)?.iterate({
    enter(node) {
      if (node.name === 'Document') return;
      tokens.push({ type: node.name, text: state.doc.sliceString(node.from, node.to) });
    },
  });
  return tokens;
}

/** The tokens of a document under the DOT language that the given vocabulary builds. */
function highlight(doc: string, vocab: DotVocabulary = VOCAB): Token[] {
  return tokensOf(doc, [createDotLanguage(vocab)]);
}

/** The type of the first token that has exactly this text, or undefined when no token has it. */
function typeOf(tokens: Token[], text: string): string | undefined {
  return tokens.find((token) => token.text === text)?.type;
}

describe('language', () => {
  describe('createDotLanguage(VOCAB)', () => {
    it('returns Extension', () => {
      const extension = createDotLanguage(VOCAB);
      expect(extension).toBeDefined();
    });

    it('parses the whole document when it is used with EditorState', () => {
      const doc = 'digraph { a -> b }';
      const state = EditorState.create({ doc, extensions: [createDotLanguage(VOCAB)] });
      expect(ensureSyntaxTree(state, doc.length, 1000)?.length).toBe(doc.length);
    });
  });

  describe('Keywords', () => {
    it.each([
      ['digraph', 'digraph G {}'],
      ['graph', 'graph G {}'],
      ['subgraph', 'digraph { subgraph cluster_0 {} }'],
      ['node', 'digraph { node [shape=box] }'],
      ['edge', 'digraph { edge [color=red] }'],
      ['strict', 'strict digraph {}'],
    ])('marks %s as a keyword', (word, doc) => {
      expect(typeOf(highlight(doc), word)).toBe('keyword');
    });

    it('ignores the case of a keyword', () => {
      expect(typeOf(highlight('DiGraph G {}'), 'DiGraph')).toBe('keyword');
    });

    it('does not mark a node name as a keyword', () => {
      expect(typeOf(highlight('digraph { foo -> bar }'), 'foo')).toBe('variableName');
    });
  });

  describe('Punctuation', () => {
    it.each(['{', '}', '[', ']', '(', ')', ';', ',', '='])('marks %s as punctuation', (mark) => {
      expect(typeOf(highlight(`a ${mark} b`), mark)).toBe('punctuation');
    });

    it('skips a character that no token matches and goes on with the next token', () => {
      expect(typeOf(highlight('digraph { a @ b }'), 'b')).toBe('variableName');
    });
  });

  describe('Operators', () => {
    it('marks -> as an operator', () => {
      expect(typeOf(highlight('digraph { a -> b }'), '->')).toBe('operator');
    });

    it('marks -- as an operator', () => {
      expect(typeOf(highlight('graph { a -- b }'), '--')).toBe('operator');
    });

    it('marks the colon of a port as an operator', () => {
      expect(typeOf(highlight('digraph { a:p -> b }'), ':')).toBe('operator');
    });
  });

  describe('Comments', () => {
    it('marks a // comment up to the end of the line', () => {
      const tokens = highlight('digraph { // comment\n a -> b }');
      expect(typeOf(tokens, '// comment')).toBe('comment');
      expect(typeOf(tokens, 'a')).toBe('variableName');
    });

    it('marks a /* */ comment and ends it at the closing mark', () => {
      const tokens = highlight('digraph { /* comment */ a -> b }');
      expect(typeOf(tokens, '/* comment */')).toBe('comment');
      expect(typeOf(tokens, 'a')).toBe('variableName');
    });

    it('marks a # line as a comment', () => {
      expect(typeOf(highlight('# preprocessor\ndigraph {}'), '# preprocessor')).toBe('comment');
    });
  });

  describe('Strings', () => {
    it('marks a double-quoted string as one string', () => {
      const tokens = highlight('digraph { a [label="Hello World"] }');
      expect(typeOf(tokens, '"Hello World"')).toBe('string');
    });

    it('keeps an escaped quote inside the string', () => {
      const tokens = highlight('digraph { a [label="say \\"hi\\" now"] }');
      expect(typeOf(tokens, '"say \\"hi\\" now"')).toBe('string');
    });

    it('ends the string at a quote that follows an escaped backslash', () => {
      const tokens = highlight('digraph { a [label="C:\\\\"] }');
      expect(typeOf(tokens, '"C:\\\\"')).toBe('string');
    });

    it('marks an HTML label with nested tags as one string', () => {
      const label = '<<table><tr><td>cell</td></tr></table>>';
      const tokens = highlight(`digraph { a [label=${label}] }`);
      expect(typeOf(tokens, label)).toBe('string');
    });
  });

  describe('Attributes', () => {
    it.each(['label', 'color', 'shape'])('marks %s as an attribute name', (name) => {
      expect(typeOf(highlight(`digraph { a [${name}=test] }`), name)).toBe('attributeName');
    });

    it('ignores the case of an attribute name', () => {
      expect(typeOf(highlight('digraph { a [LABEL=test] }'), 'LABEL')).toBe('attributeName');
    });

    it('marks an attribute that the vocabulary lists in capitals', () => {
      expect(VOCAB.attributes).toContain('URL');
      expect(typeOf(highlight('digraph { a [URL="x"] }'), 'URL')).toBe('attributeName');
    });

    it('does not mark an unknown name as an attribute name', () => {
      expect(typeOf(highlight('digraph { a [banana=test] }'), 'banana')).toBe('variableName');
    });
  });

  describe('Numbers', () => {
    it('marks an integer as a number', () => {
      expect(typeOf(highlight('digraph { a [width=42] }'), '42')).toBe('number');
    });

    it('marks a decimal as one number', () => {
      expect(typeOf(highlight('digraph { a [width=3.14] }'), '3.14')).toBe('number');
    });

    it('marks a negative number as one number', () => {
      expect(typeOf(highlight('digraph { a [width=-1] }'), '-1')).toBe('number');
    });
  });

  describe('Token types', () => {
    it('gives a keyword, an attribute name and a string three distinct types', () => {
      const tokens = highlight('digraph G { a [label="x"] }');
      const types = [typeOf(tokens, 'digraph'), typeOf(tokens, 'label'), typeOf(tokens, '"x"')];

      expect(types).toEqual(['keyword', 'attributeName', 'string']);
    });

    it('takes the keywords and attribute names from the vocabulary, in any case', () => {
      const vocab: DotVocabulary = { ...VOCAB, keywords: ['Frobnicate'], attributes: ['Zork'] };
      const tokens = highlight('frobnicate zork digraph', vocab);

      expect(typeOf(tokens, 'frobnicate')).toBe('keyword');
      expect(typeOf(tokens, 'zork')).toBe('attributeName');
      expect(typeOf(tokens, 'digraph')).toBe('variableName');
    });

    it('builds no tokens when the language is not installed', () => {
      // Control: without the grammar the token tests above have nothing to read, so they fail.
      const doc = 'digraph G { a -> b }';

      expect(tokensOf(doc, [])).toEqual([]);
      expect(highlight(doc).length).toBeGreaterThan(0);
    });
  });
});
