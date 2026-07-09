# Graph Stats (`stats`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `stats` capability that analyzes DOT **source** and reports structural metrics (counts, directed?/strict?, cycle presence, roots/leaves/isolated), built core-first with a `graphvizjs stats --json` CLI oracle and a renderer stats dialog.

**Architecture:** A new pure structural DOT parser (`core/parse-graph.ts`: `tokenizeDot` → `parseGraph`) turns source into a `GraphModel`; `core/graph-stats.ts` computes a `GraphStats` from it (incl. cycle detection). The CLI (`stats`), a `dot:stats` IPC channel, and a `src/stats/` dialog all consume the same `graphStats(source)` function. No render/WASM involved — `stats` is fully pure.

**Tech Stack:** TypeScript, Node-only `core/`, Biome, Vitest (+ happy-dom), Playwright, Electron IPC, CodeMirror (source read only).

## Global Constraints

- Biome style: 2-space indent, single quotes, semicolons, trailing commas (ES5), 100-char width, `const` over `let`, no `var`, no `any`.
- NodeNext: every relative import within `core/` and `cli/` carries an explicit `.js` extension. (Renderer `src/` imports do **not** use extensions — follow the existing files.)
- Renderer imports `core/` **only** as type-only `core/types`; all runtime core access is over IPC. `pnpm graph:check` must stay at 0 hard violations.
- IPC four-point rule: a new channel lines up at contract → preload → main handler → `src/platform` wrapper, or `graph:check` fails.
- CLI `--json` emits a stable object; exit codes: `0` success, `1` I/O error, `2` usage error.
- Zero-throw parsing: `tokenizeDot`, `parseGraph`, `computeStats`, `graphStats` never throw on any string input (empty, malformed, non-DOT).
- `stats` takes **no** `--engine` (structure is layout-independent).
- Standalone exe: `stats` is pure → include it in the `build:cli:exe` self-check and its "supports:" listing.
- Docs: regenerate `docs/architecture/` (`pnpm graph`); update README / ROADMAP / CHANGELOG. `docs:check` + `graph:check` are the gate.
- Commit trailers on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01KEuTefgG3KQrAquUcRSSj8
  ```

## File Structure

- **Create** `core/parse-graph.ts` — `tokenizeDot(source): Tok[]` (literal-aware token stream weaving `scanDot` spans, resolving ports + string concat) and `parseGraph(source): GraphModel` (statement parser). Depends on `core/scan-dot.ts` + `core/types.ts`.
- **Create** `core/graph-stats.ts` — `computeStats(model): GraphStats` + `graphStats(source): GraphStats` (parse then compute; cycle detection). Depends on `core/types.ts` + `core/parse-graph.ts`.
- **Modify** `core/types.ts` — add `GraphEdge`, `GraphSubgraph`, `GraphModel`, `GraphStats`.
- **Modify** `cli/args.ts` — `'stats'` command + `parseStats`.
- **Modify** `cli/index.ts` — `stats` execution (human + `--json`), USAGE.
- **Modify** `src/platform/contract.ts`, `electron/preload.ts`, `electron/main.ts`, `src/platform/index.ts` — `dot:stats` / `graphStats` four-point wiring.
- **Create** `src/stats/stats-dialog.ts` — `createStatsDialog(opts): { open(): void }` (self-contained `<dialog>`, mirrors `src/help/dialog.ts`).
- **Modify** `src/styles.css` — `.stats-dialog` styles.
- **Modify** `src/menu/menu-template.ts`, `src/menu/commands.ts`, `src/main.ts` — menu item + palette command + dialog wiring.
- **Modify** `scripts/build-cli-exe.mjs`, `README.md`, `docs/planning/ROADMAP.md`, `CHANGELOG.md`, `docs/architecture/*` — exe coverage + docs.
- **Create** tests: `test/core/parse-graph.test.ts`, `test/core/graph-stats.test.ts`, `test/stats/stats-dialog.test.ts`, `test/e2e/stats.spec.ts`. **Extend**: `test/cli/dist.integration.test.ts`, `test/menu/commands.test.ts`, `test/menu/menu-template.test.ts`, `test/platform/index.test.ts`, and add `test/cli/args` coverage for `parseStats` (see Task 4).

---

### Task 1: `tokenizeDot` — literal-aware token stream

**Files:**
- Create: `core/parse-graph.ts`
- Test: `test/core/parse-graph.test.ts`

**Interfaces:**
- Consumes: `scanDot(source): Span[]` from `core/scan-dot.js` (`Span.kind` ∈ `code|string|html|comment`).
- Produces: `export type TokKind` and `export interface Tok { kind: TokKind; value: string }`; `export function tokenizeDot(source: string): Tok[]`. Ids are final: string literals unquoted, `"a" + "b"` concatenated, ports (`a:p:c`) collapsed to head id. Edge ops `->`/`--` are single `edgeop` tokens. `[ ... ]` bounds are `lbracket`/`rbracket`; `{ }` are `lbrace`/`rbrace`; `;`→`semi`, `,`→`comma`, `=`→`eq`. `:`/`+` never appear in the output (resolved away).

- [ ] **Step 1: Write the failing tests**

```ts
// test/core/parse-graph.test.ts
import { describe, expect, it } from 'vitest';
import { tokenizeDot } from '../../core/parse-graph';

const kinds = (src: string) => tokenizeDot(src).map((t) => `${t.kind}:${t.value}`);

describe('tokenizeDot', () => {
  it('tokenizes a simple directed edge', () => {
    expect(kinds('digraph { a -> b }')).toEqual([
      'id:digraph', 'lbrace:{', 'id:a', 'edgeop:->', 'id:b', 'rbrace:}',
    ]);
  });

  it('treats -- as one edge op', () => {
    expect(kinds('graph { a -- b }')).toContain('edgeop:--');
  });

  it('unquotes string ids and concatenates with +', () => {
    expect(kinds('digraph { "a b" -> "c" + "d" }')).toEqual([
      'id:digraph', 'lbrace:{', 'id:a b', 'edgeop:->', 'id:cd', 'rbrace:}',
    ]);
  });

  it('collapses ports and compass points to the head id', () => {
    expect(kinds('digraph { a:p:sw -> b:e }')).toEqual([
      'id:digraph', 'lbrace:{', 'id:a', 'edgeop:->', 'id:b', 'rbrace:}',
    ]);
  });

  it('keeps an HTML label span as a single id token', () => {
    const t = tokenizeDot('digraph { a [label=<<b>x</b>>] }');
    expect(t.some((x) => x.kind === 'id' && x.value.startsWith('<') && x.value.endsWith('>'))).toBe(true);
  });

  it('skips comments and never throws on garbage', () => {
    expect(() => tokenizeDot('digraph { a // c\n -> b } /* x')).not.toThrow();
    expect(kinds('digraph { a // hi\n -> b }')).toEqual([
      'id:digraph', 'lbrace:{', 'id:a', 'edgeop:->', 'id:b', 'rbrace:}',
    ]);
  });

  it('emits eq for attribute assignments', () => {
    expect(kinds('digraph { rankdir = LR }')).toEqual([
      'id:digraph', 'lbrace:{', 'id:rankdir', 'eq:=', 'id:LR', 'rbrace:}',
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/core/parse-graph.test.ts`
Expected: FAIL — `tokenizeDot` is not exported / module missing.

- [ ] **Step 3: Implement `tokenizeDot`**

```ts
// core/parse-graph.ts
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
```

> Implementation note: `colon`/`plus` are internal raw kinds not part of the public `TokKind` union (they never survive `tokenizeDot`), hence the `as TokKind` casts. This keeps the exported type clean while allowing the two-phase resolve.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/core/parse-graph.test.ts`
Expected: PASS (all `tokenizeDot` tests).

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add core/parse-graph.ts test/core/parse-graph.test.ts
git commit  # message: "feat(core): tokenizeDot — literal-aware DOT token stream"
```

---

### Task 2: `parseGraph` — DOT source → GraphModel

**Files:**
- Modify: `core/parse-graph.ts` (add `parseGraph`)
- Modify: `core/types.ts` (add `GraphEdge`, `GraphSubgraph`, `GraphModel`)
- Test: `test/core/parse-graph.test.ts` (add `parseGraph` cases)

**Interfaces:**
- Consumes: `tokenizeDot` (Task 1).
- Produces: `GraphModel { directed: boolean; strict: boolean; nodes: string[]; edges: GraphEdge[]; subgraphs: GraphSubgraph[] }` where `GraphEdge = { from: string; to: string }` and `GraphSubgraph = { name?: string; isCluster: boolean }`; `export function parseGraph(source: string): GraphModel`. `nodes` are distinct, first-seen order. Implicit node creation on edge reference. `node`/`edge`/`graph` followed by `[…]` and `id = id` assignments add no node. `{ a b } -> c` expands to the cross product. Never throws.

- [ ] **Step 1: Add the model types to `core/types.ts`**

```ts
// core/types.ts — append
/** A directed/undirected edge between two node ids (structural, pre-layout). */
export interface GraphEdge {
  from: string;
  to: string;
}

/** A subgraph or anonymous block; `isCluster` when its name starts with "cluster". */
export interface GraphSubgraph {
  name?: string;
  isCluster: boolean;
}

/** A structural model of a DOT source: distinct nodes, edges, subgraphs, kind. */
export interface GraphModel {
  directed: boolean;
  strict: boolean;
  nodes: string[];
  edges: GraphEdge[];
  subgraphs: GraphSubgraph[];
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// test/core/parse-graph.test.ts — add
import { parseGraph } from '../../core/parse-graph';

describe('parseGraph', () => {
  it('reads directed/strict from the header', () => {
    expect(parseGraph('strict digraph G { }')).toMatchObject({ directed: true, strict: true });
    expect(parseGraph('graph { }')).toMatchObject({ directed: false, strict: false });
  });

  it('collects distinct nodes in first-seen order (implicit on edges)', () => {
    const m = parseGraph('digraph { a -> b -> c; a }');
    expect(m.nodes).toEqual(['a', 'b', 'c']);
    expect(m.edges).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
  });

  it('does not count attribute-list contents or default-attr statements as nodes', () => {
    const m = parseGraph('digraph { node [shape=box]; edge [color=red]; a [label="x"] -> b }');
    expect(m.nodes).toEqual(['a', 'b']);
    expect(m.edges).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('treats a bare id=id as a graph attribute, not a node', () => {
    const m = parseGraph('digraph { rankdir=LR; bgcolor="white"; a -> b }');
    expect(m.nodes).toEqual(['a', 'b']);
  });

  it('counts a node literally named node when used as an endpoint', () => {
    const m = parseGraph('digraph { node -> x }');
    expect(m.nodes).toEqual(['node', 'x']);
  });

  it('records subgraphs and detects clusters by name prefix', () => {
    const m = parseGraph('digraph { subgraph cluster_0 { a; b } subgraph s1 { c } }');
    expect(m.subgraphs).toEqual([
      { name: 'cluster_0', isCluster: true },
      { name: 's1', isCluster: false },
    ]);
    expect(m.nodes).toEqual(['a', 'b', 'c']);
  });

  it('expands a subgraph endpoint to the cross product', () => {
    const m = parseGraph('digraph { {a b} -> c }');
    expect(m.edges).toEqual([
      { from: 'a', to: 'c' },
      { from: 'b', to: 'c' },
    ]);
    expect(m.nodes).toEqual(['a', 'b', 'c']);
    expect(m.subgraphs).toEqual([{ name: undefined, isCluster: false }]);
  });

  it('never throws on malformed input', () => {
    expect(() => parseGraph('digraph { a -> ')).not.toThrow();
    expect(() => parseGraph('')).not.toThrow();
    expect(() => parseGraph('not dot at all')).not.toThrow();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/core/parse-graph.test.ts`
Expected: FAIL — `parseGraph` not exported.

- [ ] **Step 4: Implement `parseGraph`**

```ts
// core/parse-graph.ts — add imports at top:
//   import type { GraphEdge, GraphModel, GraphSubgraph } from './types.js';
// then append:

export function parseGraph(source: string): GraphModel {
  const toks = tokenizeDot(source);
  const nodesSet = new Set<string>();
  const nodeOrder: string[] = [];
  const edges: GraphEdge[] = [];
  const subgraphs: GraphSubgraph[] = [];
  let directed = false;
  let strict = false;
  let pos = 0;

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

  // Parse a block body (lbrace already consumed); record the subgraph and
  // return every node id declared anywhere inside (for endpoint expansion).
  const parseBlock = (name: string | undefined): string[] => {
    subgraphs.push({ name, isCluster: name !== undefined && name.toLowerCase().startsWith('cluster') });
    const members: string[] = [];
    while (pos < toks.length && at()!.kind !== 'rbrace') {
      for (const id of parseStatement()) members.push(id);
    }
    if (at()?.kind === 'rbrace') pos++;
    return members;
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
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/core/parse-graph.test.ts`
Expected: PASS (tokenizer + parser).

- [ ] **Step 6: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add core/parse-graph.ts core/types.ts test/core/parse-graph.test.ts
git commit  # "feat(core): parseGraph — DOT source to structural GraphModel"
```

---

### Task 3: `graph-stats.ts` — metrics + cycle detection

**Files:**
- Create: `core/graph-stats.ts`
- Modify: `core/types.ts` (add `GraphStats`)
- Test: `test/core/graph-stats.test.ts`

**Interfaces:**
- Consumes: `parseGraph` (Task 2), `GraphModel`/`GraphEdge` (Task 2).
- Produces: `GraphStats { directed; strict; nodeCount; edgeCount; subgraphCount; clusterCount; isolated; selfLoops; hasCycle; roots?; leaves? }` (all numbers except the two booleans; `roots`/`leaves` present **only** when `directed`). `export function computeStats(model: GraphModel): GraphStats` and `export function graphStats(source: string): GraphStats`.

- [ ] **Step 1: Add `GraphStats` to `core/types.ts`**

```ts
// core/types.ts — append
/** Structural metrics for a DOT source (see core/graph-stats.ts). */
export interface GraphStats {
  directed: boolean;
  strict: boolean;
  nodeCount: number;
  edgeCount: number;
  subgraphCount: number;
  clusterCount: number;
  isolated: number;
  selfLoops: number;
  hasCycle: boolean;
  /** Directed graphs only: nodes with in-degree 0. Omitted for undirected. */
  roots?: number;
  /** Directed graphs only: nodes with out-degree 0. Omitted for undirected. */
  leaves?: number;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// test/core/graph-stats.test.ts
import { describe, expect, it } from 'vitest';
import { graphStats } from '../../core/graph-stats';

describe('graphStats', () => {
  it('counts nodes, edges, subgraphs, clusters', () => {
    const s = graphStats('digraph { subgraph cluster_a { x } a -> b -> c }');
    expect(s).toMatchObject({
      nodeCount: 4,
      edgeCount: 2,
      subgraphCount: 1,
      clusterCount: 1,
      directed: true,
      strict: false,
    });
  });

  it('reports roots/leaves/isolated for a directed DAG', () => {
    const s = graphStats('digraph { a -> b; a -> c; d }');
    expect(s.roots).toBe(2); // a, d
    expect(s.leaves).toBe(3); // b, c, d
    expect(s.isolated).toBe(1); // d
    expect(s.hasCycle).toBe(false);
  });

  it('detects a directed cycle', () => {
    expect(graphStats('digraph { a -> b -> c -> a }').hasCycle).toBe(true);
  });

  it('detects a self-loop as a cycle and counts it', () => {
    const s = graphStats('digraph { a -> a }');
    expect(s.selfLoops).toBe(1);
    expect(s.hasCycle).toBe(true);
  });

  it('omits roots/leaves for an undirected graph', () => {
    const s = graphStats('graph { a -- b -- c }');
    expect(s.roots).toBeUndefined();
    expect(s.leaves).toBeUndefined();
    expect(s.hasCycle).toBe(false); // a path/tree is acyclic
  });

  it('detects an undirected cycle', () => {
    expect(graphStats('graph { a -- b -- c -- a }').hasCycle).toBe(true);
  });

  it('detects a parallel undirected edge as a cycle', () => {
    expect(graphStats('graph { a -- b; a -- b }').hasCycle).toBe(true);
  });

  it('handles empty/malformed input without throwing', () => {
    expect(graphStats('').nodeCount).toBe(0);
    expect(() => graphStats('digraph { a ->')).not.toThrow();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/core/graph-stats.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `graph-stats.ts`**

```ts
// core/graph-stats.ts
import { parseGraph } from './parse-graph.js';
import type { GraphEdge, GraphModel, GraphStats } from './types.js';

/** Iterative 3-color DFS: true if the directed graph has a back-edge (or self-loop). */
function hasDirectedCycle(nodes: string[], adj: Map<string, string[]>): boolean {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n, WHITE);
  for (const start of nodes) {
    if (color.get(start) !== WHITE) continue;
    color.set(start, GRAY);
    const stack: { node: string; i: number }[] = [{ node: start, i: 0 }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const neighbors = adj.get(top.node) ?? [];
      if (top.i < neighbors.length) {
        const next = neighbors[top.i++];
        const c = color.get(next);
        if (c === GRAY) return true; // back-edge (self-loop: next === node, already GRAY)
        if (c === WHITE) {
          color.set(next, GRAY);
          stack.push({ node: next, i: 0 });
        }
      } else {
        color.set(top.node, BLACK);
        stack.pop();
      }
    }
  }
  return false;
}

/** Union-find: true if the undirected graph has a cycle (incl. self-loop / parallel edge). */
function hasUndirectedCycle(nodes: string[], edges: GraphEdge[]): boolean {
  const parent = new Map<string, string>();
  const ensure = (x: string): void => {
    if (!parent.has(x)) parent.set(x, x);
  };
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const nxt = parent.get(cur)!;
      parent.set(cur, root);
      cur = nxt;
    }
    return root;
  };
  for (const n of nodes) ensure(n);
  for (const { from, to } of edges) {
    if (from === to) return true; // self-loop
    ensure(from);
    ensure(to);
    const rf = find(from);
    const rt = find(to);
    if (rf === rt) return true; // closes a cycle (a parallel edge does too)
    parent.set(rf, rt);
  }
  return false;
}

export function computeStats(model: GraphModel): GraphStats {
  const { directed, strict, nodes, edges, subgraphs } = model;
  const outAdj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  const outdeg = new Map<string, number>();
  const incident = new Set<string>();
  for (const id of nodes) {
    outAdj.set(id, []);
    indeg.set(id, 0);
    outdeg.set(id, 0);
  }
  for (const { from, to } of edges) {
    if (!outAdj.has(from)) outAdj.set(from, []);
    outAdj.get(from)!.push(to);
    outdeg.set(from, (outdeg.get(from) ?? 0) + 1);
    indeg.set(to, (indeg.get(to) ?? 0) + 1);
    incident.add(from);
    incident.add(to);
  }

  const stats: GraphStats = {
    directed,
    strict,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    subgraphCount: subgraphs.length,
    clusterCount: subgraphs.filter((s) => s.isCluster).length,
    isolated: nodes.filter((id) => !incident.has(id)).length,
    selfLoops: edges.filter((e) => e.from === e.to).length,
    hasCycle: directed
      ? hasDirectedCycle(nodes, outAdj)
      : hasUndirectedCycle(nodes, edges),
  };
  if (directed) {
    stats.roots = nodes.filter((id) => (indeg.get(id) ?? 0) === 0).length;
    stats.leaves = nodes.filter((id) => (outdeg.get(id) ?? 0) === 0).length;
  }
  return stats;
}

export function graphStats(source: string): GraphStats {
  return computeStats(parseGraph(source));
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/core/graph-stats.test.ts`
Expected: PASS.

- [ ] **Step 6: Lint + typecheck + full core suite**

Run: `pnpm lint && pnpm typecheck && npx vitest run test/core`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add core/graph-stats.ts core/types.ts test/core/graph-stats.test.ts
git commit  # "feat(core): graphStats — structural metrics + cycle detection"
```

---

### Task 4: CLI arg parsing for `stats`

**Files:**
- Modify: `cli/args.ts`
- Test: `test/cli/args.test.ts` (create if absent; otherwise add to the existing arg test)

**Interfaces:**
- Consumes: existing `parseArgs`/`ParsedArgs`/`ParseError`.
- Produces: `ParsedArgs.command` gains `'stats'`; a new `parseStats(rest)` accepting a single input (path or `-`) and `--json`; rejects any other flag (`--engine`, `-o`, etc.) as "Unknown flag".

- [ ] **Step 1: Check for an existing args test**

Run: `ls test/cli`
If `args.test.ts` exists, add to it; otherwise create it with the import block below.

- [ ] **Step 2: Write the failing tests**

```ts
// test/cli/args.test.ts  (create or extend)
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../cli/args';

describe('parseArgs stats', () => {
  it('parses a stats input', () => {
    expect(parseArgs(['stats', 'g.dot'])).toMatchObject({ command: 'stats', input: 'g.dot', json: false });
  });
  it('parses stats --json and stdin', () => {
    expect(parseArgs(['stats', '-', '--json'])).toMatchObject({ command: 'stats', input: '-', json: true });
  });
  it('rejects --engine on stats', () => {
    expect(parseArgs(['stats', 'g.dot', '--engine', 'neato'])).toMatchObject({ error: expect.stringContaining('Unknown flag') });
  });
  it('rejects -o on stats', () => {
    expect(parseArgs(['stats', 'g.dot', '-o', 'x.txt'])).toMatchObject({ error: expect.stringContaining('Unknown flag') });
  });
  it('errors when input is missing', () => {
    expect(parseArgs(['stats'])).toMatchObject({ error: expect.stringContaining('Missing input') });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/cli/args.test.ts`
Expected: FAIL — `command` is not `'stats'` (currently "Unknown command: stats").

- [ ] **Step 4: Implement**

In `cli/args.ts`, change the command union and add the dispatch + parser:

```ts
// 1) update the command union on ParsedArgs:
  command: 'render' | 'validate' | 'format' | 'stats' | 'help' | 'version';

// 2) in parseArgs, add before the `if (first !== 'render')` guard:
  if (first === 'stats') return parseStats(argv.slice(1));

// 3) add this function (mirrors parseFormat, adds --json, no -o):
/** Parse `stats <input|-> [--json]` (no engine, no output). */
function parseStats(rest: string[]): ParsedArgs | ParseError {
  let input: string | undefined;
  let json = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg !== '-' && arg.startsWith('-')) return { error: `Unknown flag: ${arg}` };
    if (input === undefined) input = arg;
    else return { error: `Unexpected argument: ${arg}` };
  }
  if (input === undefined) {
    return { error: 'Missing input. Expected a .dot file path or "-" for stdin.' };
  }
  return { command: 'stats', input, engine: 'dot', scale: 1, pdf: DEFAULT_PDF, json };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/cli/args.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/args.ts test/cli/args.test.ts
git commit  # "feat(cli): parse the stats command (input + --json)"
```

---

### Task 5: CLI `stats` execution (human + `--json`)

**Files:**
- Modify: `cli/index.ts`
- Test: `test/cli/dist.integration.test.ts` (extend)

**Interfaces:**
- Consumes: `parseStats` result (Task 4), `graphStats` (Task 3).
- Produces: `graphvizjs stats` writes human key/value lines; `--json` writes `{ input, ...GraphStats }`. Exit 0 success, 1 I/O error.

- [ ] **Step 1: Extend the distributable integration test**

```ts
// test/cli/dist.integration.test.ts — add inside the describe block
  it('reports stats as JSON', () => {
    const g = join(dir, 'stats.dot');
    writeFileSync(g, 'digraph { a -> b -> c -> a }', 'utf-8');
    const parsed = JSON.parse(run(['stats', g, '--json']));
    expect(parsed).toMatchObject({
      directed: true,
      nodeCount: 3,
      edgeCount: 3,
      hasCycle: true,
    });
    expect(parsed.input).toContain('stats.dot');
  }, 30000);

  it('reports stats as human text from stdin', () => {
    const out = run(['stats', '-'], 'digraph { a -> b }');
    expect(out).toContain('nodes:');
    expect(out).toContain('cycles:');
  }, 30000);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/cli/dist.integration.test.ts`
Expected: FAIL — the compiled CLI rejects `stats` (Unknown command) until Step 3 + rebuild.

- [ ] **Step 3: Implement the `stats` branch in `cli/index.ts`**

Add the import and a human formatter, then the command branch:

```ts
// add to imports:
import { graphStats } from '../core/graph-stats.js';
import type { ExportFormat, GraphStats } from '../core/types.js';

// add a formatter near offsetToLineCol:
/** Render stats as aligned `label: value` lines (roots/leaves only when directed). */
export function formatStats(stats: GraphStats): string {
  const yn = (b: boolean): string => (b ? 'yes' : 'no');
  const rows: [string, string][] = [
    ['directed', yn(stats.directed)],
    ['strict', yn(stats.strict)],
    ['nodes', String(stats.nodeCount)],
    ['edges', String(stats.edgeCount)],
    ['subgraphs', String(stats.subgraphCount)],
    ['clusters', String(stats.clusterCount)],
  ];
  if (stats.directed) {
    rows.push(['roots', String(stats.roots)], ['leaves', String(stats.leaves)]);
  }
  rows.push(
    ['isolated', String(stats.isolated)],
    ['self-loops', String(stats.selfLoops)],
    ['cycles', yn(stats.hasCycle)]
  );
  const width = Math.max(...rows.map(([label]) => label.length)) + 1; // +1 for the colon
  return rows.map(([label, value]) => `${`${label}:`.padEnd(width + 1)} ${value}`).join('\n');
}

// add the command branch (place before `// render`):
  if (parsed.command === 'stats') {
    try {
      const dot = await readInput(parsed.input!);
      const stats = graphStats(dot);
      const name = parsed.input === '-' ? '<stdin>' : parsed.input!;
      if (parsed.json) {
        process.stdout.write(`${JSON.stringify({ input: name, ...stats })}\n`);
      } else {
        process.stdout.write(`${formatStats(stats)}\n`);
      }
      return 0;
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  }
```

Also update `USAGE` to add the line:

```
graphvizjs stats <input.dot|-> [--json]
```

(insert between the `format` and `--help` lines).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/cli/dist.integration.test.ts`
Expected: PASS (the test rebuilds `dist-cli` in `beforeAll`).

- [ ] **Step 5: Manual oracle check + lint/typecheck**

Run:
```bash
echo 'digraph { a -> b -> a }' | pnpm graphvizjs -- stats - --json
pnpm lint && pnpm typecheck
```
Expected: JSON with `"hasCycle":true`, no lint/type errors.

- [ ] **Step 6: Commit**

```bash
git add cli/index.ts test/cli/dist.integration.test.ts
git commit  # "feat(cli): stats command — human + --json output"
```

---

### Task 6: `dot:stats` IPC channel (four-point wiring)

**Files:**
- Modify: `src/platform/contract.ts`, `electron/preload.ts`, `electron/main.ts`, `src/platform/index.ts`
- Test: `test/platform/index.test.ts` (extend)

**Interfaces:**
- Consumes: `graphStats` (Task 3), `GraphStats` type (Task 3).
- Produces: `window.graphviz.graphStats(source)` over channel `dot:stats`; renderer wrapper `graphStats(source): Promise<GraphStats>` exported from `src/platform`.

- [ ] **Step 1: Extend the platform wrapper test**

Inspect `test/platform/index.test.ts` for its `window.graphviz` mock pattern, then add:

```ts
  it('graphStats forwards to window.graphviz.graphStats', async () => {
    const fake = { directed: true, strict: false, nodeCount: 1, edgeCount: 0, subgraphCount: 0, clusterCount: 0, isolated: 1, selfLoops: 0, hasCycle: false };
    const spy = vi.fn().mockResolvedValue(fake);
    // extend the existing window.graphviz mock with graphStats: spy
    (window as unknown as { graphviz: Record<string, unknown> }).graphviz.graphStats = spy;
    const { graphStats } = await import('../../src/platform');
    await expect(graphStats('digraph { a }')).resolves.toEqual(fake);
    expect(spy).toHaveBeenCalledWith('digraph { a }');
  });
```

> Match the file's existing mock/import idiom — if it builds a full `window.graphviz` object once, add `graphStats` there instead of mutating it.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/platform/index.test.ts`
Expected: FAIL — `graphStats` not exported from `src/platform`.

- [ ] **Step 3: Wire all four points**

`src/platform/contract.ts` — add the import and method:
```ts
// in the type import list from '../../core/types', add: GraphStats
  graphStats(source: string): Promise<GraphStats>;
```

`electron/preload.ts` — add to the `api` object (near `formatDot`):
```ts
  graphStats: (source) => ipcRenderer.invoke('dot:stats', source),
```

`electron/main.ts` — add the import and the handler (beside `dot:format`):
```ts
import { graphStats } from '../core/graph-stats';
// ...
  ipcMain.handle('dot:stats', (_e, source: string) => graphStats(source));
```

`src/platform/index.ts` — add the import and wrapper (near `formatDot`):
```ts
// add GraphStats to the type import from '../../core/types'
export function graphStats(source: string): Promise<GraphStats> {
  return window.graphviz.graphStats(source);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/platform/index.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Verify IPC integrity**

Run: `pnpm graph:check`
Expected: IPC ✅ 20 / ⚠️contract 0 / ⚠️handler 0; layer violations 0.

- [ ] **Step 6: Commit**

```bash
git add src/platform/contract.ts electron/preload.ts electron/main.ts src/platform/index.ts test/platform/index.test.ts
git commit  # "feat(ipc): dot:stats channel exposing graphStats to the renderer"
```

---

### Task 7: Stats dialog module

**Files:**
- Create: `src/stats/stats-dialog.ts`
- Modify: `src/styles.css`
- Test: `test/stats/stats-dialog.test.ts`

**Interfaces:**
- Consumes: `GraphStats` type (`core/types`), an injected `graphStats(source): Promise<GraphStats>` and `getSource(): string`.
- Produces: `export interface StatsDialogOptions { getSource: () => string; graphStats: (source: string) => Promise<GraphStats>; }` and `export function createStatsDialog(opts: StatsDialogOptions): { open(): Promise<void> }`. Self-contained `<dialog>` (mirrors `src/help/dialog.ts`): created lazily, body re-rendered on each `open()` from fresh stats.

- [ ] **Step 1: Write the failing test**

```ts
// test/stats/stats-dialog.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createStatsDialog } from '../../src/stats/stats-dialog';

const STATS = {
  directed: true, strict: false, nodeCount: 3, edgeCount: 3,
  subgraphCount: 1, clusterCount: 1, isolated: 0, selfLoops: 0,
  hasCycle: true, roots: 1, leaves: 1,
};

describe('createStatsDialog', () => {
  it('renders current stats into a table on open', async () => {
    // happy-dom lacks HTMLDialogElement.showModal in some versions — stub it.
    HTMLDialogElement.prototype.showModal = vi.fn();
    const graphStats = vi.fn().mockResolvedValue(STATS);
    const dialog = createStatsDialog({ getSource: () => 'digraph { a -> b -> c -> a }', graphStats });
    await dialog.open();
    expect(graphStats).toHaveBeenCalledWith('digraph { a -> b -> c -> a }');
    const el = document.querySelector('.stats-dialog');
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain('Nodes');
    expect(el!.textContent).toContain('3');
    expect(el!.textContent).toContain('Cyclic'); // hasCycle true
  });

  it('recomputes on each open', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    const graphStats = vi.fn().mockResolvedValue({ ...STATS, nodeCount: 9 });
    const dialog = createStatsDialog({ getSource: () => 'digraph { }', graphStats });
    await dialog.open();
    await dialog.open();
    expect(graphStats).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/stats/stats-dialog.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the dialog**

```ts
// src/stats/stats-dialog.ts
import type { GraphStats } from '../../core/types';

export interface StatsDialogOptions {
  getSource: () => string;
  graphStats: (source: string) => Promise<GraphStats>;
}

export interface StatsDialog {
  open(): Promise<void>;
}

function rows(stats: GraphStats): [string, string][] {
  const yn = (b: boolean): string => (b ? 'yes' : 'no');
  const out: [string, string][] = [
    ['Directed', yn(stats.directed)],
    ['Strict', yn(stats.strict)],
    ['Nodes', String(stats.nodeCount)],
    ['Edges', String(stats.edgeCount)],
    ['Subgraphs', String(stats.subgraphCount)],
    ['Clusters', String(stats.clusterCount)],
  ];
  if (stats.directed) {
    out.push(['Roots', String(stats.roots)], ['Leaves', String(stats.leaves)]);
  }
  out.push(
    ['Isolated', String(stats.isolated)],
    ['Self-loops', String(stats.selfLoops)],
    ['Cyclic', yn(stats.hasCycle)]
  );
  return out;
}

export function createStatsDialog(opts: StatsDialogOptions): StatsDialog {
  let el: HTMLDialogElement | null = null;

  const ensure = (): HTMLDialogElement => {
    if (el) return el;
    el = document.createElement('dialog');
    el.className = 'stats-dialog';
    el.addEventListener('click', (event) => {
      if (event.target === el) el?.close();
    });
    document.body.appendChild(el);
    return el;
  };

  const render = (dialog: HTMLDialogElement, stats: GraphStats): void => {
    const body = rows(stats)
      .map(
        ([label, value]) =>
          `<div class="stats-row"><dt>${label}</dt><dd>${value}</dd></div>`
      )
      .join('');
    dialog.innerHTML = `
      <div class="stats-dialog-content">
        <header class="stats-dialog-header">
          <h2>Graph Statistics</h2>
          <button type="button" class="stats-dialog-close" aria-label="Close">
            <i class="ri-close-line" aria-hidden="true"></i>
          </button>
        </header>
        <dl class="stats-dialog-body">${body}</dl>
      </div>`;
    dialog.querySelector('.stats-dialog-close')?.addEventListener('click', () => dialog.close());
  };

  return {
    async open(): Promise<void> {
      const dialog = ensure();
      const stats = await opts.graphStats(opts.getSource());
      render(dialog, stats);
      dialog.showModal();
    },
  };
}
```

- [ ] **Step 4: Add styles to `src/styles.css`**

Append (mirroring `.help-dialog` conventions already in the file):

```css
.stats-dialog {
  border: none;
  border-radius: 8px;
  padding: 0;
  max-width: 360px;
  width: 90vw;
  color: inherit;
  background: var(--bg, #fff);
}
.stats-dialog::backdrop {
  background: rgba(0, 0, 0, 0.4);
}
.stats-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #ddd);
}
.stats-dialog-header h2 {
  margin: 0;
  font-size: 1rem;
}
.stats-dialog-close {
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  font-size: 1.1rem;
}
.stats-dialog-body {
  margin: 0;
  padding: 8px 16px 16px;
}
.stats-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}
.stats-row dt {
  color: var(--muted, #666);
}
.stats-row dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
```

> Confirm the actual variable names by reading the existing `.help-dialog` block in `src/styles.css`; reuse whatever custom properties it uses for background/border/muted so light+dark both work.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/stats/stats-dialog.test.ts && pnpm lint && pnpm typecheck`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/stats/stats-dialog.ts src/styles.css test/stats/stats-dialog.test.ts
git commit  # "feat(ui): graph statistics dialog"
```

---

### Task 8: Wire the dialog into the menu + command palette

**Files:**
- Modify: `src/menu/menu-template.ts`, `src/menu/commands.ts`, `src/main.ts`
- Test: `test/menu/commands.test.ts`, `test/menu/menu-template.test.ts`

**Interfaces:**
- Consumes: `createStatsDialog` (Task 7), `graphStats` renderer wrapper (Task 6), `MenuCommandHandlers`/`dispatchMenuAction` (existing).
- Produces: `MenuActionId` gains `'stats'`; `MenuCommandHandlers` gains `stats: () => void`; a View-menu item and a palette command both invoke `statsDialog.open()`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/menu/commands.test.ts — add
  it('routes the stats action to the stats handler', () => {
    const handlers = makeHandlers(); // reuse the file's handler factory/spies
    dispatchMenuAction(handlers, 'stats');
    expect(handlers.stats).toHaveBeenCalledTimes(1);
  });
```

```ts
// test/menu/menu-template.test.ts — add
  it('includes a Graph Statistics item that fires the stats action', () => {
    const actions: string[] = [];
    const template = buildMenuTemplate({
      ...baseOptions, // reuse the file's option factory
      onAction: (a) => actions.push(a),
    });
    // find the item labelled "Graph Statistics…" and click it
    const click = findMenuItem(template, 'Graph Statistics…')?.click as (() => void) | undefined;
    click?.();
    expect(actions).toContain('stats');
  });
```

> Reuse each test file's existing helpers (`makeHandlers`, `baseOptions`, any `findMenuItem`); if `findMenuItem` doesn't exist, walk `submenu` arrays inline to find the label.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/menu`
Expected: FAIL — no `stats` action/handler yet.

- [ ] **Step 3: Add `'stats'` to the menu template**

In `src/menu/menu-template.ts`: add `| 'stats'` to the `MenuActionId` union, and add an item to the View menu submenu (after the `command-palette` item, before its following separator):

```ts
    {
      id: 'stats',
      label: 'Graph Statistics…',
      click: () => opts.onAction('stats'),
    },
```

- [ ] **Step 4: Add the handler to the dispatcher**

In `src/menu/commands.ts`: add `stats: () => void;` to `MenuCommandHandlers` (after `help`), and a case to `dispatchMenuAction`:

```ts
    case 'stats':
      return handlers.stats();
```

- [ ] **Step 5: Run to verify menu tests pass**

Run: `npx vitest run test/menu && pnpm typecheck`
Expected: PASS. (`typecheck` also proves `main.ts` must now supply `stats` — do Step 6 before it fully passes.)

- [ ] **Step 6: Wire the dialog in `src/main.ts`**

Add the imports:
```ts
import { createStatsDialog } from './stats/stats-dialog';
import { graphStats } from './platform';
```

Create the dialog (near the other dialog setups, before the `menuHandlers` object):
```ts
  const statsDialog = createStatsDialog({
    getSource: () => tabManager.getActiveTab()?.editorView?.state.doc.toString() ?? '',
    graphStats,
  });
```

Add to the `menuHandlers` object (after `help`):
```ts
    stats: () => void statsDialog.open(),
```

Add a palette command to the `paletteCommands` array (in the `View` group — place beside the command-palette-adjacent entries):
```ts
    { id: 'stats', label: 'Show Graph Statistics', group: 'View', run: menuHandlers.stats },
```

- [ ] **Step 7: Run to verify everything passes**

Run: `npx vitest run test/menu && pnpm lint && pnpm typecheck`
Expected: PASS, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/menu/menu-template.ts src/menu/commands.ts src/main.ts test/menu/commands.test.ts test/menu/menu-template.test.ts
git commit  # "feat(ui): wire graph stats into menu + command palette"
```

---

### Task 9: E2E — stats dialog end to end

**Files:**
- Create: `test/e2e/stats.spec.ts`

**Interfaces:**
- Consumes: `test/e2e/helpers.ts` (`launchApp`, `activeEditorContent`).

- [ ] **Step 1: Write the E2E test**

```ts
// test/e2e/stats.spec.ts
import { expect, test } from '@playwright/test';
import { activeEditorContent, launchApp } from './helpers';

test('shows graph statistics for the current diagram', async () => {
  const { app, page } = await launchApp();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();

  // Replace the editor content with a known cyclic 3-node graph.
  const content = activeEditorContent(page);
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('digraph { a -> b -> c -> a }');

  // Open the command palette and run the stats command.
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await page.keyboard.type('graph stat');
  await page.keyboard.press('Enter');

  const dialog = page.locator('.stats-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Nodes');
  await expect(dialog).toContainText('3');
  await expect(dialog).toContainText('Cyclic');
  await expect(dialog).toContainText('yes');
  await app.close();
});
```

> If `launchApp()` needs an explicit initial file/env, mirror the setup in `test/e2e/rendering.spec.ts`. Confirm the palette shortcut and selectors against `test/e2e/helpers.ts` before finalizing.

- [ ] **Step 2: Run it**

Run: `npx playwright test test/e2e/stats.spec.ts`
Expected: PASS (globalSetup builds the app first).

- [ ] **Step 3: Commit**

```bash
git add test/e2e/stats.spec.ts
git commit  # "test(e2e): graph statistics dialog end to end"
```

---

### Task 10: Standalone exe coverage + docs + final gate

**Files:**
- Modify: `scripts/build-cli-exe.mjs`, `README.md`, `docs/planning/ROADMAP.md`, `CHANGELOG.md`
- Regenerate: `docs/architecture/*` (via `pnpm graph`)

**Interfaces:** none new — this task documents and verifies the whole feature.

- [ ] **Step 1: Add a `stats` self-check to the exe build**

In `scripts/build-cli-exe.mjs`, inside `verify(exe)` (after the `validate` check), add:

```js
  const stats = JSON.parse(call(['stats', '-', '--json'], 'digraph { a -> b -> a }'));
  assert(stats.hasCycle === true && stats.nodeCount === 2, 'stats --json wrong');
```

And update the two "supports:" console lines in `run()` to include `stats`:
```js
  console.log('   supports: format · validate · stats · render→svg · --help/--version');
```

- [ ] **Step 2: Build and self-verify the exe**

Run: `pnpm build:cli:exe`
Expected: ends with `✅ standalone CLI: …` and no `exe self-check failed`.

- [ ] **Step 3: Update README, ROADMAP, CHANGELOG**

- `README.md`: add `stats` to the CLI command list/table and mention "graph statistics" in features. (Match the file's existing CLI section format — read it first.)
- `docs/planning/ROADMAP.md`: in the **Shipped** → *Headless core & CLI* list, extend the `graphvizjs` CLI line to include `stats`; in **Tier 4 — engineer analysis value**, change "a stats panel (…)" to note it has shipped and narrow the remaining bullet to the outline navigator / cycle-in-panel / path highlighting / visual diff that are still pending.
- `CHANGELOG.md`: under `## [Unreleased]` add:
  ```markdown
  ### Added
  - Graph statistics — a `stats` capability that analyses DOT structure (node/edge/subgraph/cluster counts, directed?/strict?, roots/leaves/isolated, self-loops, and cycle detection). Available as `graphvizjs stats [--json]`, over the `dot:stats` IPC channel, and as a **Graph Statistics** dialog (command palette + View menu). Built on a new pure structural DOT parser (`core/parse-graph.ts`).
  ```

- [ ] **Step 4: Regenerate architecture docs**

Run: `pnpm graph`
Expected: `docs/architecture/*` updated (new `stats` module + `dot:stats` channel + `parse-graph`/`graph-stats` files).

- [ ] **Step 5: Full verification gate**

Run:
```bash
pnpm lint && pnpm typecheck
npx vitest run --no-file-parallelism
pnpm graph:check
pnpm docs:check
npx playwright test test/e2e/stats.spec.ts
```
Expected: all green; `graph:check` reports IPC ✅ 20 / layer violations 0; `docs:check` passes.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-cli-exe.mjs README.md docs/planning/ROADMAP.md CHANGELOG.md docs/architecture
git commit  # "docs: ship graph stats — exe coverage, README/ROADMAP/CHANGELOG, arch docs"
```

---

## Self-Review

**Spec coverage:**
- Two pure modules (parse/analyze) → Tasks 1–3. ✓
- Graphviz-faithful parsing (quoted/HTML ids, ports, concat, default-attr, `id=id`, attr-list skip, subgraph endpoints, nesting, clusters, no-throw) → Tasks 1–2 tests. ✓
- Standard metric set + cycle detection (directed/undirected/self-loop/parallel) → Task 3. ✓
- CLI `stats [--json]`, no `--engine`, exit codes → Tasks 4–5. ✓
- `dot:stats` four-point IPC → Task 6. ✓
- Modal dialog, palette + menu, no toolbar button → Tasks 7–8. ✓
- Tests incl. E2E → Tasks 1–3,5,6,7,9. ✓
- Exe coverage + docs + gate → Task 10. ✓

**Type consistency:** `GraphModel`/`GraphEdge`/`GraphSubgraph` (Task 2) and `GraphStats` (Task 3) are defined in `core/types.ts` and consumed with identical names/shapes in Tasks 3,5,6,7. `graphStats(source)` (Task 3) is the single entry used by CLI (5), IPC (6), and dialog (via wrapper, 6→8). Channel `dot:stats` + method `graphStats` consistent across Task 6's four files. `MenuActionId 'stats'` + `MenuCommandHandlers.stats` consistent across Task 8.

**Placeholder scan:** no TBD/TODO; every code step carries complete code; test files carry real assertions. Where a task must match an existing file's local idiom (test factories, CSS variables, README format), that is flagged as a read-first note, not left as a blank.

**Scope:** one cohesive feature (parse → analyze → CLI → IPC → UI → docs), semantic-lint-sized. No decomposition needed.
