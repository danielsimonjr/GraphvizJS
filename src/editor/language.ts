import type { StringStream } from '@codemirror/language';
import { StreamLanguage } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

const DOT_KEYWORDS = ['graph', 'digraph', 'subgraph', 'node', 'edge', 'strict'] as const;

export type DotKeyword = (typeof DOT_KEYWORDS)[number];

const DOT_ATTRIBUTES = [
  'label',
  'color',
  'bgcolor',
  'fillcolor',
  'fontcolor',
  'fontname',
  'fontsize',
  'shape',
  'style',
  'width',
  'height',
  'rank',
  'rankdir',
  'size',
  'ratio',
  'margin',
  'pad',
  'splines',
  'overlap',
  'concentrate',
  'compound',
  'arrowhead',
  'arrowtail',
  'dir',
  'headlabel',
  'taillabel',
  'penwidth',
  'pos',
  'xlabel',
  'tooltip',
  'URL',
  'href',
] as const;

const ARROW_TOKENS = ['->', '--'];

export function createDotLanguage(): Extension {
  const keywordSet = new Set(DOT_KEYWORDS.map((word: DotKeyword) => word.toLowerCase()));
  const attributeSet = new Set(DOT_ATTRIBUTES.map((attr) => attr.toLowerCase()));

  return StreamLanguage.define({
    token(stream: StringStream) {
      if (stream.eatSpace()) return null;

      // Single-line comment
      if (stream.match('//')) {
        stream.skipToEnd();
        return 'comment';
      }

      // Multi-line comment start
      if (stream.match('/*')) {
        while (!stream.eol()) {
          if (stream.match('*/')) break;
          stream.next();
        }
        return 'comment';
      }

      // C-style preprocessor (sometimes used)
      if (stream.match('#')) {
        stream.skipToEnd();
        return 'comment';
      }

      const next = stream.peek();
      if (next === '"') {
        stream.next();
        readQuoted(stream, '"');
        return 'string';
      }

      // HTML-like labels <>
      if (next === '<') {
        stream.next();
        let depth = 1;
        while (!stream.eol() && depth > 0) {
          const ch = stream.next();
          if (ch === '<') depth++;
          else if (ch === '>') depth--;
        }
        return 'string';
      }

      // Arrow operators
      if (matchArrowToken(stream)) {
        return 'operator';
      }

      // Brackets and punctuation
      if (stream.match(/[{}\[\]();,=]/)) {
        return 'punctuation';
      }

      // Numbers
      if (stream.match(/-?\d+(\.\d+)?/)) {
        return 'number';
      }

      // Identifiers (keywords, attributes, or node names)
      if (stream.match(/[A-Za-z_][A-Za-z0-9_]*/)) {
        const word = stream.current().toLowerCase();
        if (keywordSet.has(word)) return 'keyword';
        if (attributeSet.has(word)) return 'attributeName';
        return 'variableName';
      }

      // Colon for port syntax
      if (stream.match(':')) {
        return 'operator';
      }

      stream.next();
      return null;
    },
    languageData: {
      commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
      closeBrackets: { brackets: '()[]{}"' },
    },
  });
}

function matchArrowToken(stream: StringStream): boolean {
  for (const token of ARROW_TOKENS) {
    if (stream.match(token)) {
      return true;
    }
  }
  return false;
}

function readQuoted(stream: StringStream, quote: string): void {
  let escaped = false;
  while (!stream.eol()) {
    const ch = stream.next();
    if (!ch) return;
    if (ch === quote && !escaped) return;
    escaped = !escaped && ch === '\\';
  }
}
