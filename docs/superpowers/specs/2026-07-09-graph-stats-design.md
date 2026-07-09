# Graph Stats (`stats`) — Design

> **Status:** approved 2026-07-09. First Tier-4 "graph intelligence" feature.
> **Authoritative history:** [`CHANGELOG.md`](../../../CHANGELOG.md). Roadmap: [`docs/planning/ROADMAP.md`](../../planning/ROADMAP.md).

## Goal

Add a `stats` capability that analyzes a DOT **source** and reports structural
metrics (counts, directedness, cycle presence, roots/leaves/isolated nodes),
built core-first: a pure `core/` structural model + a `graphvizjs stats --json`
CLI oracle, then a renderer stats **dialog**. Introduces the first structural
DOT parser in the codebase — the reusable foundation for the rest of Tier 4
(outline navigator, cycle detection, path highlighting).

## Non-goals (v1)

- Rendered-SVG analysis (we parse source, not layout output).
- Deep analytics: connected components, degree distribution, graph density,
  longest path. (Reserved for a later `analyze`/richer stats pass.)
- A live, always-visible stats panel; a toolbar button. (Command palette +
  native menu only in v1.)
- `stats` is **not** a validator: it never throws on malformed DOT and does
  not report syntax errors — it degrades to a best-effort count.

## Global Constraints

- **Language/tooling:** TypeScript, Node-only `core/` (no DOM, no Node natives
  — `stats` is pure). Biome style: 2-space indent, single quotes, semicolons,
  trailing commas (ES5), 100-char width, `const` over `let`, no `any`.
- **NodeNext imports:** every relative import within `core/` and `cli/` carries
  an explicit `.js` extension.
- **Renderer purity:** the renderer imports `core/` **only** as type-only
  `core/types`. All runtime access is over IPC. `pnpm graph:check` enforces
  this; it must stay at 0 hard violations.
- **IPC four-point rule:** a new channel must line up at contract → preload →
  main handler → `src/platform` wrapper, or `graph:check` fails.
- **CLI JSON convention:** `--json` emits a stable machine-readable object;
  exit codes `0` success, `1` I/O error, `2` usage error.
- **Zero-throw parsing:** `parseGraph` and `graphStats` never throw on any
  string input (including empty, malformed, or non-DOT).
- **Standalone exe:** `stats` is pure → it must be included in the
  `build:cli:exe` (SEA) covered-command set and documented there.
- **Docs freshness:** regenerate `docs/architecture/` (`pnpm graph`) and update
  README / ROADMAP / CHANGELOG; `docs:check` and `graph:check` are the gate.

## Architecture

Two new pure core modules split *parse* from *analyze* so the parser is
reusable by future Tier-4 features:

```
core/parse-graph.ts   parseGraph(source: string): GraphModel
core/graph-stats.ts   computeStats(model: GraphModel): GraphStats
                      graphStats(source: string): GraphStats   // parse then compute
```

- `parse-graph.ts` depends only on `core/scan-dot.ts` (span scanner) and
  `core/types.ts`. It is the structural foundation.
- `graph-stats.ts` depends only on `core/types.ts` (operates on `GraphModel`).
  `graphStats(source)` is the single call the CLI and IPC handler use.

### Types (in `core/types.ts`)

```ts
export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphSubgraph {
  name?: string;        // undefined for anonymous { ... } blocks
  isCluster: boolean;   // name starts with "cluster"
}

export interface GraphModel {
  directed: boolean;                 // digraph → true, graph → false
  strict: boolean;                   // `strict` keyword present
  nodes: string[];                   // distinct node ids, first-seen order
  edges: GraphEdge[];                // one entry per edge operation
  subgraphs: GraphSubgraph[];
}

export interface GraphStats {
  directed: boolean;
  strict: boolean;
  nodeCount: number;
  edgeCount: number;
  subgraphCount: number;
  clusterCount: number;
  isolated: number;                  // nodes with degree 0 (no incident edges)
  selfLoops: number;                 // count of edges where from === to
  hasCycle: boolean;
  roots?: number;                    // directed only: in-degree 0
  leaves?: number;                   // directed only: out-degree 0
}
```

`roots`/`leaves` are **omitted** (not `0`) for undirected graphs, where
in/out-degree is not meaningful.

## Parsing semantics (Graphviz-faithful)

`parseGraph` walks the `scanDot` span stream. Design rules:

1. **Header:** leading `strict` sets `strict: true`; `digraph` → `directed:
   true`, `graph` → `directed: false`. Case-insensitive keywords.
2. **Identifier tokens weave across spans.** A node id may be a bare word
   (code span), a quoted string (string span — value is the unquoted content,
   with `\"` unescaped and `\<newline>` line-continuations removed), or an HTML
   string (`<...>` html span — the whole span, delimiters included, is the id).
   The tokenizer emits **one** IDENT token per such id regardless of span
   boundaries. Two string literals joined by `+` (`"a" + "b"`) concatenate into
   one id (DOT string concatenation).
3. **Ports stripped:** `node:port:compass` and `node:port` → id is the text
   before the first unquoted `:`. (A quoted id keeps internal colons.)
4. **Node identity:** the resolved id string. `nodes` holds distinct ids in
   first-seen order. A node is added when it appears as a node statement target
   **or** as an edge endpoint (implicit creation).
5. **Default-attribute statements are not nodes:** a bare `node`, `edge`, or
   `graph` keyword in statement position followed by `[ ... ]` (or standing
   alone) sets defaults and adds **no** node. But `node` used as an edge
   endpoint (`node -> x`) *is* a node named "node" (matches Graphviz).
6. **Attribute lists `[ ... ]` are skipped** for structure — their contents are
   never nodes/edges. (Reuse the `scanDot` code-span + bracket logic; an
   attribute value that is a string/html span is inside the `[...]` region.)
7. **Edge chains:** `a -> b -> c` yields edges `a→b`, `b→c` (2 edges).
   Operators: `->` (directed docs) and `--` (undirected docs). Mixed operators
   are tolerated (we count edges regardless; directedness comes from the
   header).
8. **Subgraph blocks:** `subgraph NAME { ... }` and `subgraph { ... }` and bare
   `{ ... }` each add a `GraphSubgraph`. `isCluster` = name present and
   lowercased name starts with `cluster`. Nesting supported (each block counts).
9. **Subgraph as edge endpoint:** `{ a b } -> c` connects every node in the
   left subgraph to every node on the right → edges `a→c`, `b→c`. Chains of
   subgraph endpoints expand as the cross-product between adjacent groups. A
   single-node endpoint is the degenerate group `{ x }`.
10. **Separators:** `;` and newlines end statements; whitespace and `,` separate
    tokens. Comments/strings/html are already isolated by `scanDot`.
11. **Malformed input:** unbalanced braces, unterminated strings, or garbage →
    parse what is unambiguous, ignore the rest, never throw. Counts are
    best-effort on invalid DOT (documented).

### Metric computation (`graph-stats.ts`)

- `nodeCount` = `model.nodes.length`; `edgeCount` = `model.edges.length`;
  `subgraphCount` = `model.subgraphs.length`; `clusterCount` = subgraphs with
  `isCluster`.
- `selfLoops` = edges with `from === to`.
- Build adjacency from `model.edges` over `model.nodes`.
- `isolated` = nodes with no incident edge (in or out).
- Directed only: `roots` = in-degree 0; `leaves` = out-degree 0.
- `hasCycle`:
  - **Directed** graph: DFS 3-color (white/gray/black). An edge to a **gray**
    node is a back-edge → cycle. A self-loop is a cycle. Handles disconnected
    components (iterate all nodes).
  - **Undirected** graph: DFS tracking the parent edge. A visited neighbor that
    is not the parent → cycle. Self-loops and parallel edges (`a--b` twice) are
    cycles. (Track parent by node, and treat a second parallel edge to the
    parent as a cycle.)

## CLI — `graphvizjs stats <input|-> [--json]`

- Add `'stats'` to `ParsedArgs.command` and a `parseStats(rest)` in
  `cli/args.ts`. Accepts a single input (file path or `-` for stdin) and
  `--json`. **No** `--engine`, `--output`, `--strict`, or `--fix` (rejected as
  unknown flags). No `-o`.
- `cli/index.ts`: read input, call `graphStats(source)`, then:
  - **default (human):** aligned key/value lines, e.g.
    ```
    directed:      yes
    strict:        no
    nodes:         6
    edges:         7
    subgraphs:     2
    clusters:      1
    roots:         1
    leaves:        2
    isolated:      0
    self-loops:    0
    cycles:        yes
    ```
    (`roots`/`leaves` lines omitted for undirected graphs.)
  - **`--json`:** `{ input, ...GraphStats }` (undirected omits `roots`/`leaves`).
- Exit `0` on success (even for a cyclic or invalid-DOT graph — stats always
  succeeds if it can read input), `1` on I/O read failure, `2` on usage error.
- Update `--help` text and the version/help command listing to include `stats`.

## IPC — `dot:stats`

Four-point wiring (grouped with `dot:format`/`dot:vocabulary`):

1. `src/platform/contract.ts`: `graphStats(source: string): Promise<GraphStats>`
   on `GraphvizApi` (import `GraphStats` type from `core/types`).
2. `electron/preload.ts`: `graphStats: (source) => ipcRenderer.invoke('dot:stats', source)`.
3. `electron/main.ts`: `ipcMain.handle('dot:stats', (_e, source: string) => graphStats(source))`.
4. `src/platform/index.ts`: thin wrapper `graphStats(source)` calling
   `window.graphviz.graphStats(source)`.

## UI — stats dialog

- New module `src/stats/stats-dialog.ts`: `createStatsDialog(opts)` returning
  `{ open() }`, presentation-only. On `open()`, it reads the **active tab's**
  editor content (via a `getSource: () => string` callback passed from
  `main.ts`), calls `platform.graphStats(source)`, and renders a metrics table
  in a modal overlay (same overlay/escape/focus conventions as
  `help/dialog.ts` and `preferences/preferences-dialog.ts`).
- Markup: add a hidden `<dialog>`/overlay container to `src/index.html`
  mirroring the existing dialogs; the module populates a `<table>` of
  metric label → value. Directed-only rows (roots/leaves) hidden for undirected.
- Wiring in `bootstrap()` (`src/main.ts`):
  - A **command-palette** entry: `{ id: 'graph.stats', label: 'Show Graph
    Statistics', group: 'View', run: () => statsDialog.open() }`.
  - A **native menu** item routed through the shared `menuHandlers` dispatch
    (add to `menu-template.ts` + `menu/commands.ts`) so palette, menu, and any
    keybinding share one path.
- No toolbar button, no keyboard shortcut in v1 (YAGNI; palette + menu suffice).

## Testing

- `test/core/parse-graph.test.ts` — bare/quoted/HTML ids; string concatenation;
  ports; node vs default-attr statement; edge chains; `->`/`--`; named/anonymous
  subgraphs; cluster detection; nesting; subgraph-as-endpoint expansion;
  malformed input (no throw); directed/strict header parsing.
- `test/core/graph-stats.test.ts` — every metric; cycle detection for directed
  (acyclic DAG, back-edge cycle, self-loop, disconnected), undirected (tree =
  acyclic, cycle, self-loop, parallel edge); roots/leaves omitted when
  undirected; isolated nodes.
- `test/cli/` — extend `dist.integration.test.ts` to subprocess-run
  `graphvizjs stats` (human) and `stats --json` against a fixture, asserting the
  parsed JSON. Add arg-parsing unit coverage for `parseStats` (rejects
  `--engine`, `-o`; accepts `--json`; stdin `-`).
- `test/e2e/stats.spec.ts` — launch app, open an example with a known structure,
  trigger the palette command, assert the dialog shows the expected counts and
  the cycle flag.
- Coverage thresholds (80/80/80/70) must hold; new pure modules are highly
  testable.

## Verification gate (closing)

- `pnpm test` (serial, `--no-file-parallelism` for the native-export flake),
  `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`.
- `pnpm build:cli` then run the compiled `graphvizjs stats --json` on a fixture;
  `pnpm build:cli:exe` and confirm `stats` works from the exe (pure/WASM subset).
- `pnpm graph` (regenerate architecture docs) + `pnpm graph:check` (0 hard
  violations, IPC 20/20) + `pnpm docs:check`.
- Update README (CLI command table + features), ROADMAP (move stats from Tier 4
  backlog to Shipped), CHANGELOG (`[Unreleased]` → version entry at release).

## Open risks

- **Subgraph-as-endpoint cross-product** is the highest-complexity parser case;
  it is in scope for faithful edge counts. If it proves to balloon on nested
  groups, cap expansion and `log`/document the limitation rather than silently
  truncating.
- **Quoted/HTML id weaving** across spans is the correctness lynchpin — covered
  by dedicated parse tests.
