# GraphvizJS — Project Overview

A cross-platform **Electron desktop editor for Graphviz DOT diagrams** with live
preview, syntax highlighting, inline linting, and SVG/PNG/PDF export. All Graphviz
work — DOT→SVG render, validation, and export — plus the pure DOT language tooling
(scanner, vocabulary, structural lint, formatter) runs headlessly in a Node-only
`core/`; the renderer holds zero Graphviz and drives everything over IPC. The same
`core/` also ships as a headless **`graphvizjs` CLI**. Based on
[MermaidJS Desktop Client](https://github.com/skydiver/mermaidjs-desktop-client).

## Key capabilities

| Area | Description |
|---|---|
| Live editing | CodeMirror 6 editor: DOT highlighting, autocomplete (keywords / attributes / value enums) + snippets, line wrapping, tab indent |
| Live preview | Debounced (300 ms) DOT→SVG render over the `render:svg` IPC, with stale-token cancellation |
| Inline linting | One lint pass combining Graphviz **syntax** errors and **structural** warnings (delimiter balance, unknown attributes) via `render:validate` |
| Layout engines | All Graphviz engines — `dot`, `neato`, `fdp`, `sfdp`, `circo`, `twopi`, `osage`, `patchwork` — selectable per tab |
| Multi-tab | Independent tabs; each holds its own file, dirty state, editor, zoom, and layout engine (`TabManager` / `TabState`) |
| Session restore | Silent capture/restore of tabs, unsaved edits, and per-tab settings across launches (no crash-recovery prompt) |
| File workflow | New / open / save / save-as via native dialogs; recent-files menu; external-change detection (reload clean, prompt dirty) |
| Export | SVG, PNG (1× / 2×), and vector PDF (fit-to-page or Letter/A4, orientation) — `exportDiagram` orchestrator |
| Format | `formatDot` — reindent + `->`/`--` spacing normalization, literal-safe, idempotent (Shift+Alt+F, or `dot:format` IPC) |
| Graph statistics | `graphStats` — node/edge/subgraph/cluster counts, directed/strict, roots/leaves/isolated, self-loops, cycle detection, over `dot:stats` IPC or `graphvizjs stats` |
| Theme | System / Light / Dark color-scheme controller, applied early in bootstrap to avoid flash |
| Command palette | Fuzzy-search-and-run any command (Ctrl/Cmd+Shift+P) via subsequence `fuzzyScore` |
| Preferences | Preferences dialog (Cmd/Ctrl+,) — Appearance → Theme, built to grow |
| Headless core | `core/` (Node-only, no DOM) owns all Graphviz + pure DOT language work; consumed by the Electron main process **and** the CLI |
| CLI | `graphvizjs render` / `validate` / `format` / `stats` — the same `core/` headlessly, `validate --json` as a UI-troubleshooting **oracle** |
| Architecture guard | `pnpm graph:check` fails the build on layer violations, runtime cycles, IPC-integrity gaps, and stale generated docs |

## Quick architecture overview

One headless `core/`; two subjects consume it — the **CLI** (fused, in-process) and
the **renderer** (bridged over IPC by the Electron main process).

```
┌──────────────────────────────────────────────────────────────┐
│                   User (desktop app / terminal)             │
└───────────────┬───────────────────────────┬──────────────────┘
                │ GUI                        │ command line
┌───────────────┴────────────┐   ┌───────────┴──────────────────┐
│  Electron main process     │   │  cli/  (graphvizjs binary)   │
│  (electron/) — hosts core, │   │  args.ts + index.ts          │
│  registers IPC handlers    │   │  render / validate / format  │
└───────────────┬────────────┘   └───────────┬──────────────────┘
        IPC     │  window.graphviz            │ direct import
   (preload +   │                             │ (same process)
    contract)   ▼                             ▼
┌────────────────────────────┐   ┌──────────────────────────────┐
│  Renderer (src/)           │   │                              │
│  CodeMirror editor, tabs,  │   │                              │
│  preview, toolbar, menus,  │   │                              │
│  theme, palette — ZERO     │   │                              │
│  Graphviz; type-only ref   │   │                              │
│  to core/types             │   │                              │
└───────────────┬────────────┘   └───────────┬──────────────────┘
                └───────────────┬─────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────┐
│  core/  (Node-only, no DOM) — the substance                  │
│  Graphviz:  render.ts (DOT→SVG + validateDot, @hpcc-js/wasm) │
│             export-png.ts (@resvg/resvg-js) · export-pdf.ts  │
│             (jsPDF + svg2pdf.js + jsdom) · export.ts · normalize-svg.ts │
│  Language:  scan-dot.ts · dot-vocab.ts · structure-lint.ts   │
│             format.ts · validate.ts (validateDiagram) · types.ts │
│  Analysis:  parse-graph.ts (GraphModel) · graph-stats.ts (graphStats) │
└──────────────────────────────────────────────────────────────┘
```

The **layer policy** is enforced by `pnpm graph:check`: `core/` is a leaf (imports
nothing); `cli/` and the Electron main process may import `core/`; the renderer
(`src/`) may reference `core/` **only** as the type-only `core/types` contract.

## Data model

GraphvizJS has no persistent database — its "data model" is the in-memory
document/tab state plus the render/export value types in `core/types.ts`.

### Tab (document) — `src/tabs/manager.ts`

```typescript
interface TabState {
  readonly id: string;        // 'tab-1', 'tab-2', …
  filePath: string | null;    // backing file, or null for untitled
  isDirty: boolean;           // unsaved changes
  lastCommittedDoc: string;   // last saved/opened baseline
  lastSavedAt: Date | null;
  editorView: EditorView | null;  // CodeMirror instance (only active tab visible)
  editorZoomLevel: number;
  layoutEngine: LayoutEngine;     // per-tab Graphviz engine
}
```

### Core value types — `core/types.ts`

```typescript
type LayoutEngine = 'dot' | 'neato' | 'fdp' | 'sfdp' | 'circo' | 'twopi' | 'osage' | 'patchwork';
type ExportFormat = 'png' | 'pngx2' | 'svg' | 'pdf';

interface DotValidationError { message: string; line?: number; column?: number; }
interface StructuralDiagnostic { from: number; to: number; severity: 'error' | 'warning'; message: string; }
interface DiagramDiagnostics { syntax: DotValidationError | null; structural: StructuralDiagnostic[]; }
interface DotVocabulary { keywords: string[]; attributes: string[]; }
interface PdfExportOptions { mode: 'fit' | 'standard'; pageSize: 'letter' | 'a4'; orientation: 'auto' | 'portrait' | 'landscape'; }
interface ExportResult { bytes: Uint8Array; ext: string; mime: string; }
```

## Directory structure

```
core/            # Node-only, no DOM — all Graphviz + pure DOT language tooling
├── render.ts        # DOT→SVG + validateDot (@hpcc-js/wasm singleton)
├── normalize-svg.ts # pure-string viewBox/padding rewrite (no DOM getBBox)
├── export-png.ts    # @resvg/resvg-js
├── export-pdf.ts    # jsPDF + svg2pdf.js in jsdom + node-canvas
├── export.ts        # exportDiagram orchestrator (format → bytes)
├── scan-dot.ts      # literal-aware span scanner
├── dot-vocab.ts     # DOT_KEYWORDS / DOT_ATTRIBUTES
├── structure-lint.ts# structuralDiagnostics
├── format.ts        # formatDot
├── validate.ts      # validateDiagram (syntax + structural — the oracle)
├── parse-graph.ts   # DOT source → structural GraphModel
├── graph-stats.ts   # graphStats — structural metrics + cycle detection
└── types.ts         # shared value types (renderer may type-only import THIS)

cli/             # the graphvizjs binary (compiled to dist-cli/)
├── args.ts          # parse render / validate / format / stats
└── index.ts         # command dispatch + offsetToLineCol

electron/        # Electron main process
├── main.ts          # window + IPC handler registration
├── preload.ts       # exposes window.graphviz (the GraphvizApi contract)
├── app-menu.ts      # native application menu
└── file-watcher.ts  # external-change watch

src/             # renderer (Vite) — setup functions wired by main.ts
├── platform/        # renderer↔main IPC boundary (contract.ts + index.ts)
├── editor/          # language, autocomplete, linting, search, theme, zoom
├── preview/         # debounced preview + preview zoom
├── toolbar/         # one module per action (15)
├── tabs/            # TabManager + tab bar
├── session/  recent/  watch/       # session restore, recent files, watch reactions
├── menu/  theme/  palette/  preferences/  help/  stats/   # app shell (stats = Graph Statistics dialog)
├── workspace/  window/  utils/  examples/         # panes, window state, debounce, templates
└── main.ts          # bootstrap()

tools/dependency-graph/   # the architecture analyzer (pnpm graph / graph:check)
tools/docs-check/         # freshness guard: hand-authored docs ↔ dependency graph
```

The autogenerated module breakdown lives in
[DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md).

## Key design principles

1. **One headless core, two subjects.** `core/` is the substance; the CLI is fused to it (in-process), the renderer is bridged to it over IPC. Neither duplicates Graphviz logic.
2. **Renderer purity.** The renderer imports `core/` only as the type-only `core/types` contract — enforced by `graph:check` and `test/architecture/renderer-purity.test.ts`. This keeps native/WASM deps out of the browser bundle.
3. **CLI as oracle.** `render`/`validate`/`format` call the exact `core/` functions the renderer reaches over IPC, so the CLI reproduces what the UI shows — a bug that repros in the CLI is in `core/`, one that doesn't is in the renderer/IPC.
4. **Core → CLI → IPC → UI.** New capability lands in `core/`, gets a CLI surface with `--json`, is tested headlessly, then is surfaced in the UI over a new IPC channel.
5. **Guarded architecture.** `pnpm graph:check` fails the build on layer breaks, runtime cycles, IPC-integrity gaps, and stale generated docs; a docs freshness guard keeps these hand-authored docs in sync.
6. **Callback wiring, no global bus.** Each `src/` subdirectory exports setup functions that receive DOM elements + callbacks from `main.ts`; there is no shared global state or event bus.

## Performance characteristics

- **Debounced render/lint**: preview at `RENDER_DELAY = 300 ms`, linting at 500 ms, each independently; stale-token checks cancel superseded renders.
- **WASM singleton**: `@hpcc-js/wasm` Graphviz is loaded once and reused (`initGraphviz`); warmed eagerly in the main process on app ready.
- **Lazy native loads**: `@resvg/resvg-js` (PNG) and jsPDF/svg2pdf.js + jsdom (PDF) load on first use of that export format.
- **Pure-string SVG normalization**: `normalize-svg.ts` rewrites viewBox/padding without a DOM `getBBox`, so it runs headlessly in the CLI.

## Getting started

```bash
pnpm install
pnpm dev          # frontend-only dev server (http://localhost:5173)
pnpm package      # build the Windows NSIS installer
pnpm build:cli    # compile the graphvizjs CLI to dist-cli/
```

```bash
# CLI
graphvizjs render diagram.dot -o diagram.svg
graphvizjs validate diagram.dot --json
graphvizjs format diagram.dot -o pretty.dot
graphvizjs stats diagram.dot --json
```

## Related documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — in-depth technical architecture
- [COMPONENTS.md](./COMPONENTS.md) — module-by-module breakdown
- [DATAFLOW.md](./DATAFLOW.md) — render / validate / export / IPC flows
- [API.md](./API.md) — CLI, IPC contract, and core public API
- [DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md) — autogenerated dependency analysis
- Project guide: [CLAUDE.md](../../.claude/CLAUDE.md) · release history: [CHANGELOG.md](../../CHANGELOG.md)
