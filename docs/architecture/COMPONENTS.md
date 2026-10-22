# GraphvizJS — Component Reference

---

## Table of Contents

1. [Overview](#overview)
2. [Core Components](#core-components)
3. [CLI Components](#cli-components)
4. [Electron Components](#electron-components)
5. [Renderer Components](#renderer-components)
6. [Component Dependencies](#component-dependencies)

---

## Overview

GraphvizJS is a layered Electron app with a headless core. File counts per module
(from `docs/architecture/dependency-graph.json`, regenerate with `bun run graph`):

```
┌───────────────────────────────────────────────────────────────┐
│  core/         │  Graphviz + DOT language tooling (18 files)   │
├───────────────────────────────────────────────────────────────┤
│  cli/          │  graphvizjs binary (2 files)                  │
├───────────────────────────────────────────────────────────────┤
│  electron/     │  main process, preload, menu, watcher (4)     │
├───────────────────────────────────────────────────────────────┤
│  src/platform/ │  renderer↔main IPC boundary (2 files)         │
│  src/editor/   │  CodeMirror extensions (6 files)              │
│  src/toolbar/  │  one module per action (15 files)             │
│  src/preview/  │  live preview + zoom (2 files)                │
│  src/tabs/     │  multi-tab management (2 files)               │
│  src/menu/     │  native menu template + dispatch (2 files)    │
│  src/watch/    │  external-change detection (2 files)          │
│  src/{session,recent,theme,palette,preferences,help,stats,     │
│       workspace,window,utils,autosave}/  (1 file each)         │
│  src/main.ts   │  bootstrap() (module 'root')                  │
└───────────────────────────────────────────────────────────────┘
```

**Total** (`src/`, `core/`, `cli/` and `electron/`): 67 TypeScript files · 8,420 LOC · 22 modules · 206 exports · 20 IPC channels.

The whole repository, including tests, scripts and tools, holds 174 source files, 19,421 lines of code, 4 modules and 281 exports (`repo-tools map`). The Verification table at the end of this document records these values.

---

## Core Components

`core/` is Node-only and DOM-free. Consumed by the Electron main process and the CLI;
the renderer may import only `core/types` (type-only).

### render.ts (`core/render.ts`)

**Purpose**: DOT→SVG rendering and syntax validation via the `@hpcc-js/wasm` Graphviz
singleton.

```typescript
async function initGraphviz(): Promise<void>              // load WASM once
function isGraphvizReady(): boolean
async function renderDotToSvg(dotSource: string, engine?: LayoutEngine): Promise<string>
async function validateDot(dotSource: string, engine?: LayoutEngine): Promise<DotValidationError | null>
```

`validateDot` attempts a layout; a thrown error is parsed by `parseErrorLocation`
into `{ message, line?, column? }` (handles `in line N`, `line N:`, `:N:M:` formats).

### validate.ts (`core/validate.ts`)

**Purpose**: the oracle — combines Graphviz syntax validation with pure structural
and semantic analysis.

```typescript
interface DiagramDiagnostics { syntax: DotValidationError | null; structural: StructuralDiagnostic[]; }
async function validateDiagram(source: string, engine?: LayoutEngine): Promise<DiagramDiagnostics>
```

`structural` is `structuralDiagnostics(source)` concatenated with
`semanticDiagnostics(source)`. Consumed by the CLI `validate` command and the
`render:validate` IPC handler.

### structure-lint.ts (`core/structure-lint.ts`)

**Purpose**: pure structural diagnostics — delimiter balance and unknown-attribute
checks over code spans (literals are skipped via the scanner).

```typescript
interface StructuralDiagnostic { from: number; to: number; severity: 'error' | 'warning'; message: string; code?: string; fix?: DiagnosticFix; }
function structuralDiagnostics(source: string): StructuralDiagnostic[]
```

`code` is a stable rule identifier and `fix` an optional `DiagnosticFix` (`{ from, to,
text, label }`) applied by `core/apply-fixes.ts`; both are populated by
`semantic-lint.ts`'s checks (see below).

### scan-dot.ts (`core/scan-dot.ts`)

**Purpose**: literal-aware span scanner — splits DOT source into `code` / `string` /
`html` / `comment` spans so formatting and linting never touch literal content.

```typescript
type SpanKind = 'code' | 'string' | 'html' | 'comment';
interface Span { kind: SpanKind; from: number; to: number; closed: boolean; }
function scanDot(source: string): Span[]
function checkBalance(source: string): { balanced: boolean; error?: { pos: number; message: string } }
```

### dot-vocab.ts (`core/dot-vocab.ts`)

**Purpose**: canonical DOT vocabulary — the single source of truth for highlighting,
autocomplete (via the `dot:vocabulary` IPC), and the structural unknown-attribute check.

```typescript
const DOT_KEYWORDS: readonly string[]     // graph, digraph, subgraph, node, edge, strict
const DOT_ATTRIBUTES: readonly string[]   // shape, label, color, rankdir, …
function buildDotVocabulary(): DotVocabulary
```

The `dot:vocabulary` IPC handler returns `buildDotVocabulary()`. The function pairs these
lists with the enum value domains of `dot-catalog.ts` (`attributeValues`), the
`DOT_COLOR_ATTRIBUTES` of `dot-colors.ts` (`colorAttributes`) and its `DOT_COLORS`
(`colors`). Autocomplete uses the payload to offer value-aware completions and keeps no
list of its own.

### format.ts (`core/format.ts`)

**Purpose**: pure DOT reformatter. The reformatter re-indents by brace depth and normalizes
`->` and `--` spacing in code regions. The reformatter keeps literals verbatim and is
idempotent. The reformatter fails safe: when the delimiters are unbalanced, the reformatter
returns the input unchanged.

```typescript
interface FormatOptions { indent?: string; }
function formatDot(source: string, opts?: FormatOptions): string
```

### dot-catalog.ts (`core/dot-catalog.ts`)

**Purpose**: the DOT attribute catalog. It holds the statement contexts of each attribute
(`graph`, `node`, `edge`, `cluster`, `subgraph`) and the value type. For `enum` attributes
it also holds the value domain. The data comes from the canonical Graphviz attrs table.
Semantic lint and the `attributeValues` of the `dot:vocabulary` IPC share this foundation.

```typescript
type AttrContext = 'graph' | 'node' | 'edge' | 'cluster' | 'subgraph';
interface DotAttributeSpec { name: string; contexts: AttrContext[]; type: AttrType; values?: string[]; default?: string; }
const DOT_ATTRIBUTE_CATALOG: readonly DotAttributeSpec[]
function findAttribute(name: string): DotAttributeSpec | undefined
```

### dot-colors.ts (`core/dot-colors.ts`)

**Purpose**: the named-color domain accepted by color-valued attributes, plus the list
of attributes that are color-typed. The color check and the vocabulary IPC read the
same list.

```typescript
const DOT_COLORS: readonly string[]
const DOT_COLOR_ATTRIBUTES: readonly string[]   // color, bgcolor, fillcolor, fontcolor, labelfontcolor, pencolor
function isColorAttribute(attr: string): boolean
```

### edit-distance.ts (`core/edit-distance.ts`)

**Purpose**: bounded string-similarity helpers powering "did you mean" typo
suggestions (unknown attribute names, invalid enum/color values).

```typescript
function editDistance(a: string, b: string): number   // Levenshtein
function nearest(word: string, candidates: readonly string[], maxDistance?: number): string | undefined
```

### semantic-lint.ts (`core/semantic-lint.ts`)

**Purpose**: semantic diagnostics over the `name=value` entries of an attribute list.
The checks find these defects:

- invalid enum values
- invalid colors
- wrong-context attributes
- duplicate attributes within one list
- `lhead` or `ltail` references to an undefined cluster or subgraph

The scan reads only `code` spans (via `scanDot`). Quoted-string values and HTML-label values
are therefore exempt. The result is a safe false negative and never a false positive on
valid DOT.

```typescript
function semanticDiagnostics(source: string): StructuralDiagnostic[]
```

Folded into `validate.ts`'s `validateDiagram` alongside `structuralDiagnostics`.

### apply-fixes.ts (`core/apply-fixes.ts`)

**Purpose**: applies the `fix` of each diagnostic in a set to source text. `applyFixes`
drops overlapping fixes; the earliest-starting fix wins. `applyFixes` applies the accepted
fixes from right to left, so earlier offsets stay valid. `validate --fix` of the CLI uses
`applyFixes`. The quick-fix code action of the editor applies the single `fix` of its
diagnostic itself (`src/editor/linting.ts`).

```typescript
function applyFixes(source: string, diagnostics: StructuralDiagnostic[]): string
```

### parse-graph.ts (`core/parse-graph.ts`)

**Purpose**: a pure, Graphviz-faithful structural parser. It tokenizes DOT
(literal-aware, via `scanDot`). It walks the token stream into a `GraphModel` of distinct
node ids, edges, and subgraphs or clusters. It handles these forms:

- quoted ids and HTML ids
- ports (`node:port`)
- string concatenation (`+`)
- the `id = id` default-attribute form
- attribute lists (skipped for structure)
- subgraph endpoints
- nested subgraphs, up to a depth of 500 (the parser skips a deeper block)
- `cluster`-prefixed subgraph names
- the `strict` header: a repeated pair of nodes merges into its first edge

In a strict graph, as in Graphviz, one pair of nodes has one edge. The pair is ordered in a digraph and unordered in a graph. A self-loop stays allowed.

The parser never throws and degrades gracefully on malformed input. `parseGraph` is the
structural foundation for `graph-stats.ts`.

```typescript
function tokenizeDot(source: string): Tok[]
function parseGraph(source: string): GraphModel
```

### graph-stats.ts (`core/graph-stats.ts`)

**Purpose**: computes `GraphStats` structural metrics from a `GraphModel`. The metrics are:

- node, edge, subgraph, and cluster counts
- the directed flag and the strict flag
- the isolated-node count and the self-loop count
- cycle detection

Cycle detection uses an iterative 3-color DFS for directed graphs and union-find for
undirected graphs. Both treat a self-loop as a cycle. Union-find also treats a parallel edge as a cycle. A strict graph has no parallel edge, because the parser merged them. Directed graphs also
report `roots` (in-degree 0) and `leaves` (out-degree 0). Undirected graphs omit both.

```typescript
function computeStats(model: GraphModel): GraphStats
function graphStats(source: string): GraphStats   // parseGraph(source) → computeStats
```

`graphStats` is the single entry point for the statistics. The CLI `stats` command uses it.
The `dot:stats` IPC handler uses it. The Graph Statistics dialog of the renderer uses it
through the IPC wrapper.

### export.ts / export-png.ts / export-pdf.ts / normalize-svg.ts

**Purpose**: export pipeline.

```typescript
// core/export.ts — orchestrator
async function exportDiagram(dot: string, engine: LayoutEngine, format: ExportFormat, options?: PdfExportOptions): Promise<ExportResult>
// core/export-png.ts — @resvg/resvg-js rasterization (1× / 2×)
// core/export-pdf.ts — jsPDF + svg2pdf.js in jsdom + node-canvas (fit/Letter/A4)
// core/normalize-svg.ts — pure-string viewBox/padding rewrite (no DOM getBBox)
```

### types.ts (`core/types.ts`)

**Purpose**: shared value types crossing the IPC boundary — `LayoutEngine`,
`ExportFormat`, `DotValidationError`, `StructuralDiagnostic`, `DiagnosticFix`,
`DiagramDiagnostics`, `DotVocabulary`, `PdfExportOptions`, `ExportResult`. **The only
`core/` module the renderer may type-only import.**

```typescript
interface DiagnosticFix { from: number; to: number; text: string; label: string; }
interface DotVocabulary { keywords: string[]; attributes: string[]; attributeValues: Record<string, string[]>; colors: string[]; }
```

---

## CLI Components

### args.ts (`cli/args.ts`)

**Purpose**: pure argument parsing for `render` / `validate` / `format` / `stats`.

```typescript
interface ParsedArgs {
  command: 'render' | 'validate' | 'format' | 'stats' | 'help' | 'version';
  input?: string; output?: string; engine: LayoutEngine;
  format?: 'svg' | 'png' | 'pdf'; scale: 1 | 2; pdf: PdfExportOptions;
  json?: boolean; strict?: boolean; fix?: boolean;   // validate only
}
function parseArgs(argv: string[]): ParsedArgs | ParseError
```

`stats` takes no `--engine`/output flags — just an input (or `-` for stdin) and an
optional `--json`.

### index.ts (`cli/index.ts`)

**Purpose**: command dispatch and the binary entry point.

```typescript
async function main(argv: string[]): Promise<number>   // exit code: 0 ok, 1 fail, 2 usage
function offsetToLineCol(source: string, offset: number): { line: number; column: number }
function formatStats(stats: GraphStats): string        // aligned label: value lines
```

`validate` prints human diagnostics or `--json` (each structural finding including its
`code`/`fix`), deriving line/column via `offsetToLineCol`. `validate --fix` instead
runs the diagnostics through `core/apply-fixes.ts`'s `applyFixes` and writes the
corrected source to `-o <path>` or stdout. `stats` calls `core/graph-stats.ts`'s
`graphStats` and prints `formatStats`'s human table or `--json`'s
`{ input, ...GraphStats }`. See [API.md](./API.md).

---

## Electron Components

### main.ts (`electron/main.ts`)

**Purpose**: create the window, save and restore its bounds and its maximized state, register
the 20 IPC handlers, own persistence and the native menu/watcher.

```typescript
function registerIpc(): void
// render:svg → renderDotToSvg · render:validate → validateDiagram (incl. semantic lint)
// export:render → exportDiagram · dot:format → formatDot · dot:stats → graphStats
// dot:vocabulary → buildDotVocabulary (keywords, attributes, attributeValues, colorAttributes, colors)
// fs:readText/writeText/writeBinary · dialog:openText/save/confirm
// store:get/set/delete · shell:openExternal · app:info
// menu:setRecent/setTheme · watch:setPaths
```

### preload.ts (`electron/preload.ts`)

**Purpose**: expose the typed `GraphvizApi` on `window.graphviz` via `contextBridge` —
the renderer's only door to the main process.

### app-menu.ts / file-watcher.ts

**Purpose**: `app-menu.ts` builds the native application menu (emits `menu:action`
push messages, `setMenuRecentFiles`/`setMenuTheme`); `file-watcher.ts` watches open
files and pushes `file:changed`.

---

## Renderer Components

Each `src/` subdirectory exports setup functions wired together by `main.ts`.

### platform/ (`src/platform/`)

**Purpose**: the renderer↔main IPC boundary. `contract.ts` declares the `GraphvizApi`
interface; `index.ts` provides thin wrappers over `window.graphviz`.

```typescript
// src/platform/index.ts (selected)
function renderSvg(dot: string, engine: LayoutEngine): Promise<string>
function validateDiagram(dot: string, engine: LayoutEngine): Promise<DiagramDiagnostics>
function formatDot(source: string): Promise<string>
function dotVocabulary(): Promise<DotVocabulary>
function graphStats(source: string): Promise<GraphStats>
function exportRender(dot, engine, format, options?): Promise<Uint8Array>
const store: { get; set; delete }
// + dialogs, fs, confirm, openExternal, appInfo, watch, menu, onFileChanged, onMenuAction
```

### editor/ (`src/editor/`)

**Purpose**: CodeMirror 6 extensions, parameterized on the injected `DotVocabulary`.

```typescript
function createDotLanguage(vocab: DotVocabulary): Extension        // language.ts (highlighting)
function makeDotCompletionSource(vocab: DotVocabulary): CompletionSource  // autocomplete.ts
function createDotAutocomplete(vocab: DotVocabulary): Extension
function createDotLinter(opts: { getEngine: () => LayoutEngine; validate: (dot, engine) => Promise<DiagramDiagnostics>; delay?: number }): Extension  // linting.ts
function createSearch(): Extension                                  // search.ts (find/replace)
// theme.ts (editor theme) · zoom.ts (font zoom) · dot-data.ts (attr value enums + colors)
```

`linting.ts` maps both `syntax` (line/column) and `structural` (character offsets)
from one `validateDiagram` call into CodeMirror `Diagnostic`s. A structural finding
with a `fix` gets a CodeMirror quick-fix `action` that dispatches the fix's
`from`/`to`/`text` replacement — the same `DiagnosticFix` shape `core/apply-fixes.ts`
consumes for `validate --fix`.

### preview/ (`src/preview/`)

**Purpose**: debounced live preview + preview zoom.

```typescript
type PreviewScheduler = (doc: string) => void
function createPreview(previewEl: HTMLElement, delay: number, options: PreviewOptions): PreviewScheduler  // render.ts
// sends DOT + active-tab engine over render:svg; stale-token check cancels superseded renders
// zoom.ts — createZoomController + wheel/control zoom
```

### toolbar/ (`src/toolbar/`)

**Purpose**: one module per user action; orchestrated by `actions.ts`.

- File: `new-diagram`, `open-diagram`, `save-diagram`, `save-as`
- Export: `export-diagram` (calls `export:render`), `export-menu`, `pdf-options-dialog`
- Content: `examples-menu`, `recent-menu`, `layout-engine`, `find`, `format` (calls `dot:format`)
- Shell: `theme-button`, `shortcuts`

Each exports a `setup*` function receiving its button(s) + callbacks. `format.ts`'s
`formatView` is async (awaits the IPC formatter); the Shift+Alt+F keymap fires the
format and returns `true` synchronously.

### tabs/ (`src/tabs/`)

**Purpose**: multi-tab management. `manager.ts` exposes the `TabManager` class and
`TabState` interface (pure state container, `MAX_TABS = 10`); `tab-bar.ts` renders the
bar with event delegation.

### session/ · recent/ · watch/

- **session/** — `captureSession`/`loadSession`/`persistSession`; silent restore of
  tabs, unsaved edits, and per-tab engine across launches (the `session` store key).
- **recent/** — pure recent-files list core (`addRecent`, `loadRecent`, `saveRecent`).
- **watch/** — `watch-plan.ts` (pure decision core) + renderer reaction to the
  `file:changed` push (reload clean tabs, prompt dirty ones).

### menu/ · theme/ · palette/ · preferences/

- **menu/** — `buildMenuTemplate` (pure) + `menu:action` dispatch (`commands.ts`).
- **theme/** — `createColorSchemeController` owns the live System/Light/Dark
  preference atop pure helpers (`resolveDark`, `nextScheme`, `applyScheme`); persisted
  under `colorScheme`.
- **palette/** — `createCommandPalette(commands)` + subsequence `fuzzyScore`
  (Ctrl/Cmd+Shift+P).
- **preferences/** — `createPreferencesDialog` (Cmd/Ctrl+,, Appearance → Theme).

### stats/ (`src/stats/`)

**Purpose**: the Graph Statistics modal dialog. `createStatsDialog` lazily builds a
`<dialog class="stats-dialog">`. It fetches `GraphStats` for the source of the current tab
over the `dot:stats` IPC (via the injected `graphStats` callback). It renders the result as
a `label: value` definition list in this order: Directed, Strict, Nodes, Edges, Subgraphs,
and Clusters. Roots and Leaves follow when the graph is directed. Isolated, Self-loops, and
Cyclic come last. The command palette ("Show Graph Statistics") and the View menu
("Graph Statistics…") open the dialog. The dialog has no toolbar button.

```typescript
interface StatsDialogOptions { getSource: () => string; graphStats: (source: string) => Promise<GraphStats>; }
function createStatsDialog(opts: StatsDialogOptions): { open(): Promise<void> }
```

### help/ · workspace/ · window/ · utils/ · autosave/

- **help/** — help dialog (shortcuts + app info).
- **workspace/** — horizontal resizable pane divider.
- **window/** — editor zoom persistence via `electron-store`. The main process owns the window bounds.
- **utils/** — `debounce`.
- **autosave/** — legacy constants only; superseded by `session/`.

### root — `src/main.ts`

**Purpose**: `bootstrap()` is the single composition root. `bootstrap()` does these main tasks
in order:

1. Create the color scheme controller from the saved scheme. The early start avoids a flash of
   the wrong theme.
2. Create the preferences dialog and the preview zoom controller.
3. Create the `TabManager`.
4. Load the saved editor zoom, and fetch the DOT vocabulary once.
5. Wire the tab bar, and restore the previous session.
6. Wire the external-file watch, the toolbar actions, the shortcuts, and the layout-engine
   selector.
7. Start the session persistence timer, and create the command palette.

---

## Component Dependencies

Module-level dependency edges (from `bun run graph`; the renderer never imports `core/`
at runtime — its `core/types` reference is type-only):

```
root ──► (everything in src/) + core (type-only)
│
├── platform ──► core (type-only)
├── editor   ──► core (type-only)
├── preview  ──► core (type-only), utils
├── toolbar  ──► core (type-only), platform, theme
├── tabs     ──► core (type-only)
├── stats    ──► core (type-only)
├── session  ──► autosave, core (type-only), platform
├── theme    ──► platform
├── preferences ──► theme
├── menu     ──► platform, theme
├── recent / watch / window / help ──► platform
│
electron ──► core, menu, platform, theme, watch   (runtime — main may reuse pure shared renderer modules)
cli      ──► core
```

**Shared boundaries**:
- `platform/` is the single door from the renderer to `core/` (over IPC).
- `core/types` is the one `core/` module the renderer may reference (type-only).
- The Electron main process may reuse only the pure shared renderer modules
  (`menu`, `watch`, `platform`) at runtime.

## Verification

Generated by `repo-tools map`.
Regenerate: `repo-tools map <repo> --out=<dir>` · Check: `repo-tools check <repo> --docs=docs/architecture`

The values cover every source file of the repository. The counts of `tools/dependency-graph` in the text cover `src/`, `core/`, `cli/` and `electron/` only. Write the output of `repo-tools map` outside `docs/architecture/`. `tools/dependency-graph` already writes a `dependency-graph.json` of its own in that folder.

| Claim | Value | Source |
|---|---|---|
| totalSourceFiles | 174 | repo-tools map: dependency-graph.json |
| totalLinesOfCode | 19421 | repo-tools map: dependency-graph.json |
| totalModules | 4 | repo-tools map: dependency-graph.json |
| totalExports | 281 | repo-tools map: dependency-graph.json |
