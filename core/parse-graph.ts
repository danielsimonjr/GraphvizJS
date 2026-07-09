import { scanDot } from './scan-dot.js';

export type TokKind =
  | 'id'
  | 'edgeop'
  | 'lbrace'
  | 'rbrace'
  | 'lbracket'
  | 'rbracket'
  | 'semi'
  | 'comma'
  | 'eq';

export interface Tok {
  kind: TokKind;
  value: string;
}

const PUNCT: Record<string, TokKind> = {
  '{': 'lbrace',
  '}': 'rbrace',
  '[': 'lbracket',
  ']': 'rbracket',
  ';': 'semi',
  ',': 'comma',
  '=': 'eq',
};

/** Unquote a DOT string literal (including its surrounding quotes). */
function unquote(literal: string): string {
  const inner = literal.slice(1, literal.length - (literal.endsWith('"') ? 1 : 0));
  // `\<newline>` is a line continuation (removed); `\"` is a literal quote.
  return inner.replace(/\\\n/g, '').replace(/\\"/g, '"');
}

/** Is `c` the start of an edge operator (`->` or `--`) at index `i` of `text`? */
function isEdgeOp(text: string, i: number): boolean {
  return text[i] === '-' && (text[i + 1] === '>' || text[i + 1] === '-');
}

/**
 * Raw pass: emit tokens including `:` (colon) and `+` (plus) so the resolve
 * pass can collapse ports and string concatenation. String/HTML spans become
 * one `id` token each; comments are dropped.
 */
function rawTokens(source: string): Tok[] {
  const out: Tok[] = [];
  for (const span of scanDot(source)) {
    const text = source.slice(span.from, span.to);
    if (span.kind === 'comment') continue;
    if (span.kind === 'string') {
      out.push({ kind: 'id', value: unquote(text) });
      continue;
    }
    if (span.kind === 'html') {
      out.push({ kind: 'id', value: text });
      continue;
    }
    let i = 0;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (isEdgeOp(text, i)) {
        out.push({ kind: 'edgeop', value: text.slice(i, i + 2) });
        i += 2;
        continue;
      }
      if (c === ':') {
        out.push({ kind: 'colon' as TokKind, value: ':' });
        i++;
        continue;
      }
      if (c === '+') {
        out.push({ kind: 'plus' as TokKind, value: '+' });
        i++;
        continue;
      }
      const p = PUNCT[c];
      if (p) {
        out.push({ kind: p, value: c });
        i++;
        continue;
      }
      let j = i;
      while (
        j < n &&
        !/\s/.test(text[j]) &&
        !(text[j] in PUNCT) &&
        text[j] !== ':' &&
        text[j] !== '+' &&
        !isEdgeOp(text, j)
      ) {
        j++;
      }
      if (j === i) {
        i++; // unknown single char — skip defensively
        continue;
      }
      out.push({ kind: 'id', value: text.slice(i, j) });
      i = j;
    }
  }
  return out;
}

/** Resolve string concatenation (`id + id`) and ports (`id : id`) into final ids. */
export function tokenizeDot(source: string): Tok[] {
  const raw = rawTokens(source);
  const out: Tok[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (t.kind === 'id') {
      let value = t.value;
      // string concatenation: id (+ id)*
      while (raw[i + 1]?.kind === ('plus' as TokKind) && raw[i + 2]?.kind === 'id') {
        value += raw[i + 2].value;
        i += 2;
      }
      // port + compass: id (: id)*  → keep the head id only
      while (raw[i + 1]?.kind === ('colon' as TokKind) && raw[i + 2]?.kind === 'id') {
        i += 2;
      }
      out.push({ kind: 'id', value });
      continue;
    }
    if (t.kind === ('colon' as TokKind) || t.kind === ('plus' as TokKind)) continue; // stray
    out.push(t);
  }
  return out;
}
