import { scanDot } from './scan-dot.js';
import type { GraphEdge, GraphModel, GraphSubgraph } from './types.js';

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

export function parseGraph(source: string): GraphModel {
  const toks = tokenizeDot(source);
  const nodesSet = new Set<string>();
  const nodeOrder: string[] = [];
  const edges: GraphEdge[] = [];
  const subgraphs: GraphSubgraph[] = [];
  let directed = false;
  let strict = false;
  let pos = 0;
  // Guards against RangeError (stack overflow) on pathologically deep nesting:
  // the parseBlock/parseStatement/parseEndpoint chain is mutually recursive, one
  // stack frame per nesting level. 500 is far beyond any realistic DOT graph but
  // comfortably under the stack limit, so normal-depth results are unaffected.
  const MAX_DEPTH = 500;
  let depth = 0;

  const at = (k = 0): Tok | undefined => toks[pos + k];
  const isKw = (t: Tok | undefined, kw: string): boolean =>
    t?.kind === 'id' && t.value.toLowerCase() === kw;
  const addNode = (id: string): void => {
    if (!nodesSet.has(id)) {
      nodesSet.add(id);
      nodeOrder.push(id);
    }
  };

  const skipAttrList = (): void => {
    if (at()?.kind !== 'lbracket') return;
    let depth = 0;
    while (pos < toks.length) {
      const k = at()!.kind;
      pos++;
      if (k === 'lbracket') depth++;
      else if (k === 'rbracket') {
        depth--;
        if (depth === 0) return;
      }
    }
  };

  // Consume a block body (lbrace already consumed) without recursing, by
  // brace-matching over the flat token stream until the balancing rbrace.
  // Used once nesting passes MAX_DEPTH so we still terminate deterministically
  // instead of growing the call stack further.
  const skipBlockBody = (): void => {
    let braceDepth = 1;
    while (pos < toks.length && braceDepth > 0) {
      const k = at()!.kind;
      pos++;
      if (k === 'lbrace') braceDepth++;
      else if (k === 'rbrace') braceDepth--;
    }
  };

  // Parse a block body (lbrace already consumed); record the subgraph and
  // return every node id declared anywhere inside (for endpoint expansion).
  // Beyond MAX_DEPTH nesting, skip the block iteratively instead of recursing
  // further — its contents are simply not counted (honest degradation on
  // pathological input, preserving the zero-throw invariant).
  const parseBlock = (name: string | undefined): string[] => {
    if (depth >= MAX_DEPTH) {
      skipBlockBody();
      return [];
    }
    depth++;
    try {
      subgraphs.push({
        name,
        isCluster: name !== undefined && name.toLowerCase().startsWith('cluster'),
      });
      const members: string[] = [];
      while (pos < toks.length && at()!.kind !== 'rbrace') {
        for (const id of parseStatement()) members.push(id);
      }
      if (at()?.kind === 'rbrace') pos++;
      return members;
    } finally {
      depth--;
    }
  };

  // Parse an edge endpoint: `{ … }`, `subgraph [name] { … }`, or a single id.
  const parseEndpoint = (): string[] => {
    const t = at();
    if (!t) return [];
    if (t.kind === 'lbrace') {
      pos++;
      return parseBlock(undefined);
    }
    if (isKw(t, 'subgraph')) {
      pos++;
      let name: string | undefined;
      if (at()?.kind === 'id') {
        name = at()!.value;
        pos++;
      }
      if (at()?.kind === 'lbrace') {
        pos++;
        return parseBlock(name);
      }
      return [];
    }
    if (t.kind === 'id') {
      pos++;
      addNode(t.value);
      return [t.value];
    }
    return [];
  };

  // Parse `(edgeop endpoint)*` after a left group; add edges; return all ids seen
  // (empty when there was no edge operator).
  const parseEdgeRhs = (left: string[]): string[] => {
    if (at()?.kind !== 'edgeop') return [];
    const all = [...left];
    let current = left;
    while (at()?.kind === 'edgeop') {
      pos++;
      const right = parseEndpoint();
      for (const a of current) for (const b of right) edges.push({ from: a, to: b });
      for (const id of right) all.push(id);
      current = right;
    }
    skipAttrList();
    return all;
  };

  // Parse one statement; return node ids it introduced.
  function parseStatement(): string[] {
    const t = at();
    if (!t) return [];
    if (t.kind === 'semi' || t.kind === 'comma') {
      pos++;
      return [];
    }
    // node|edge|graph [ … ]  → attribute defaults, no node
    if ((isKw(t, 'node') || isKw(t, 'edge') || isKw(t, 'graph')) && at(1)?.kind === 'lbracket') {
      pos++;
      skipAttrList();
      return [];
    }
    // subgraph / anonymous block, possibly as an edge endpoint
    if (t.kind === 'lbrace' || isKw(t, 'subgraph')) {
      const left = parseEndpoint();
      parseEdgeRhs(left);
      return left;
    }
    if (t.kind === 'id') {
      // id = id  → graph attribute assignment, no node
      if (at(1)?.kind === 'eq') {
        pos += 2;
        if (at()?.kind === 'id') pos++;
        return [];
      }
      pos++;
      addNode(t.value);
      const chained = parseEdgeRhs([t.value]);
      if (chained.length > 0) return chained;
      skipAttrList();
      return [t.value];
    }
    pos++; // unknown token — skip defensively
    return [];
  }

  // header: [strict] (graph|digraph) [name] {
  if (isKw(at(), 'strict')) {
    strict = true;
    pos++;
  }
  if (isKw(at(), 'digraph')) {
    directed = true;
    pos++;
  } else if (isKw(at(), 'graph')) {
    directed = false;
    pos++;
  }
  if (at()?.kind === 'id') pos++; // optional graph name
  if (at()?.kind === 'lbrace') {
    pos++;
    while (pos < toks.length && at()!.kind !== 'rbrace') parseStatement();
  }

  return { directed, strict, nodes: nodeOrder, edges, subgraphs };
}
