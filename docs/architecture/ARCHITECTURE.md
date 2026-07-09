# GraphvizJS — System Architecture

**Version**: 2.6.0 (CLI `validate`/`format` + pure DOT language tooling relocated into the shared `core/`)
**Last Updated**: 2026-07-08

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Principles](#architecture-principles)
3. [System Context](#system-context)
4. [Component Architecture](#component-architecture)
5. [Data Model](#data-model)
6. [Key Design Decisions](#key-design-decisions)
7. [Rendering & Export Architecture](#rendering--export-architecture)
8. [Performance Considerations](#performance-considerations)
9. [Security Architecture](#security-architecture)
10. [Testing Strategy](#testing-strategy)

---

## System Overview

GraphvizJS is an Electron desktop editor for Graphviz DOT diagrams, structured as
**one headless core with two consumers**:

- **`core/`** — Node-only, DOM-free. Owns every Graphviz operation (DOT→SVG render,
  validation, SVG/PNG/PDF export) and all pure DOT language tooling (scanner,
  vocabulary, structural lint, formatter, combined validator).
- **`cli/`** — the `graphvizjs` binary, fused to `core/` in-process.
- **Electron main process (`electron/`)** — embeds `core/` and re-publishes it to the
  renderer as IPC channels.
- **Renderer (`src/`)** — the CodeMirror-based UI; contains zero Graphviz and reaches
  `core/` only over IPC.

### Key Statistics (v2.6.0)

Numbers are extracted from the authoritative `docs/architecture/dependency-graph.json`
produced by `tools/dependency-graph`. Regenerate with `pnpm graph`.

| Metric | Value |
|--------|-------|
| Source files | 67 TypeScript files |
| Lines of code | 7,759 |
| Modules | 22 |
| Internal edges | 129 |
| Exports | 204 |
| Layer violations | 0 |
| Runtime circular dependencies | 0 |
| IPC channels (fully wired) | 20 |

### Module Distribution

| Module | Location | Key Exports |
|--------|----------|-------------|
| `core` | repo root | `renderDotToSvg`, `validateDot`, `validateDiagram`, `exportDiagram`, `formatDot`, `structuralDiagnostics`, `scanDot`, `DOT_KEYWORDS`/`DOT_ATTRIBUTES`, `normalizeSvg`, `parseGraph`, `graphStats`, `types` |
| `cli` | repo root | `main`, `parseArgs`, `offsetToLineCol`, `formatStats` |
| `electron` | repo root | `main.ts` (IPC handlers), `preload.ts` (`window.graphviz`), `app-menu.ts`, `file-watcher.ts` |
| `platform` | `src/` | `GraphvizApi` contract + renderer wrappers (`renderSvg`, `validateDiagram`, `exportRender`, `formatDot`, `dotVocabulary`, `graphStats`, `store`, dialogs, …) |
| `editor` | `src/` | `createDotLanguage`, `makeDotCompletionSource`/`createDotAutocomplete`, `createDotLinter`, `createSearch`, editor theme, font zoom, `dot-data` completion data |
| `preview` | `src/` | `createPreview` (debounced render), preview zoom controller |
| `toolbar` | `src/` | 15 action modules (new/open/save/save-as, export + menu, examples, recent, layout-engine, find, format, pdf-options, theme-button, shortcuts) + `actions` |
| `tabs` | `src/` | `TabManager`, `TabState` |
| `stats` | `src/` | `createStatsDialog` (Graph Statistics dialog, over `dot:stats`) |
| `session` | `src/` | `captureSession`, `loadSession`, `persistSession` |
| `recent` | `src/` | recent-files list core |
| `watch` | `src/` | `watch-plan` (pure) + renderer-side reaction |
| `menu` | `src/` | `buildMenuTemplate`, `menu:action` dispatch |
| `theme` | `src/` | `createColorSchemeController` + pure helpers |
| `palette` | `src/` | `createCommandPalette`, `fuzzyScore` |
| `preferences` | `src/` | `createPreferencesDialog` |
| `help` | `src/` | help dialog |
| `workspace` | `src/` | resizable pane divider |
| `window` | `src/` | window state persistence |
| `utils` | `src/` | `debounce` |
| `autosave` | `src/` | legacy constants (superseded by `session`) |
| `root` | `src/` | `main.ts` bootstrap |

---

## Architecture Principles

### 1. Layering (enforced)
- **`core/` is a leaf** — imports nothing from the app; pure Node + WASM/native.
- **`cli/` and `electron/` depend on `core/`**; the renderer may reference `core/`
  **only** as the type-only `core/types` contract.
- Encoded in `tools/dependency-graph/rules.ts`; any breach is a build-failing
  `graph:check` violation.

### 2. Renderer purity
- No `src/` file imports `@hpcc-js/wasm` or a runtime value from a `core/`
  render/export module. Guarded by both `graph:check` and
  `test/architecture/renderer-purity.test.ts`. Keeps native `.node`/WASM deps out
  of the Vite renderer bundle.

### 3. Single source of truth
- Every DOT language operation exists once, in `core/`, and is consumed by both the
  CLI (direct) and the renderer (over IPC). No duplicated scanner/vocabulary/lint.

### 4. IPC integrity
- Each channel must line up across `contract.ts` → `preload.ts` → main-process
  handler → `platform/index.ts`. `graph:check` fails on any orphan handler, missing
  handler, or missing-contract mismatch.

### 5. Testability
- `core/` is unit-tested headlessly; the renderer injects its dependencies
  (`validate`, `getEngine`, vocab) as callbacks, so no module reaches for globals.

---

## System Context

```
┌─────────────────────────────────────────────────────────────────┐
│                 User (desktop app  ·  terminal)                │
└───────────────────────┬─────────────────────────┬───────────────┘
                        │ GUI                      │ CLI
┌───────────────────────┴─────────┐   ┌────────────┴──────────────┐
│  Electron Main Process          │   │  cli/  (graphvizjs)       │
│  ┌───────────────────────────┐  │   │  args.ts → index.ts       │
│  │ registerIpc(): 20 handlers│  │   │  render/validate/format/  │
│  │                            │  │   │  stats                    │
│  │ render:svg · render:validate  │   └────────────┬──────────────┘
│  │ export:render · dot:format    │                │ import (in-process)
│  │ dot:stats · dot:vocabulary    │                │
│  │ fs:* · …                      │                │
│  └─────────────┬─────────────┘  │                │
│  preload.ts → window.graphviz   │                │
└────────────────┼────────────────┘                │
                 │ IPC (contextBridge)              │
┌────────────────┴────────────────┐                │
│  Renderer (src/)                │                │
│  ┌───────────────────────────┐  │                │
│  │ main.ts bootstrap()       │  │                │
│  │  TabManager · editor ·    │  │                │
│  │  preview · toolbar · menu │  │                │
│  │  theme · palette · prefs  │  │                │
│  │ platform/ wraps IPC       │  │                │
│  └─────────────┬─────────────┘  │                │
└────────────────┼────────────────┘                │
                 └───────────────┬──────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  core/  (Node-only, no DOM)                                     │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐ │
│  │ Graphviz            │  │ DOT language                     │ │
│  │ render.ts (WASM)    │  │ scan-dot · dot-vocab             │ │
│  │ export-png (resvg)  │  │ structure-lint · format          │ │
│  │ export-pdf (jsPDF)  │  │ validate (validateDiagram)       │ │
│  │ export · normalize  │  │ parse-graph · graph-stats        │ │
│  │                     │  │ types                            │ │
│  └─────────────────────┘  └──────────────────────────────────┘ │
└────────────────────────────────┬────────────────────────────────┘
                                 │ node_modules at runtime
                    ┌────────────┴────────────┐
                    │ @hpcc-js/wasm (Graphviz)│
                    │ @resvg/resvg-js (PNG)   │
                    │ jsPDF + svg2pdf + jsdom │
                    │ + node-canvas (PDF)     │
                    └─────────────────────────┘
```

### External Actors

1. **Desktop user** — drives the Electron UI.
2. **CLI user / CI** — scripts `graphvizjs` for headless render/validate/format.
3. **File system** — `.dot`/`.gv` documents and exported artifacts.
4. **Native/WASM deps** — Graphviz WASM, resvg, jsPDF stack; installed as ordinary
   dependencies with cross-platform prebuilds, `asarUnpack`'d in the installer.

---

## Component Architecture

### Layer 1: `core/` (the substance)

**Responsibility**: all Graphviz work + pure DOT language tooling. No DOM, no Electron.

```typescript
// core/render.ts — WASM singleton
async function initGraphviz(): Promise<void>
async function renderDotToSvg(dotSource: string, engine?: LayoutEngine): Promise<string>
async function validateDot(dotSource: string, engine?: LayoutEngine): Promise<DotValidationError | null>

// core/validate.ts — the oracle (syntax + structural)
async function validateDiagram(source: string, engine?: LayoutEngine): Promise<DiagramDiagnostics>

// core/format.ts — pure, idempotent
function formatDot(source: string, opts?: { indent?: string }): string

// core/structure-lint.ts — pure
function structuralDiagnostics(source: string): StructuralDiagnostic[]

// core/export.ts — orchestrator
async function exportDiagram(dot: string, engine: LayoutEngine, format: ExportFormat, options?: PdfExportOptions): Promise<ExportResult>

// core/parse-graph.ts — pure, Graphviz-faithful structural parser
function parseGraph(source: string): GraphModel

// core/graph-stats.ts — pure, built on parseGraph
function graphStats(source: string): GraphStats
```

### Layer 2a: Electron main process (`electron/`)

**Responsibility**: host `core/`, register IPC handlers, own the native window/menu.

```typescript
// electron/main.ts
function registerIpc(): void   // 20 ipcMain.handle(...) registrations
// render:svg → renderDotToSvg · render:validate → validateDiagram
// export:render → exportDiagram · dot:format → formatDot · dot:stats → graphStats
// dot:vocabulary → {keywords, attributes} · plus fs/dialog/store/menu/watch/shell channels

// electron/preload.ts — exposes the typed contract on window.graphviz
contextBridge.exposeInMainWorld('graphviz', api /*: GraphvizApi */)
```

### Layer 2b: CLI (`cli/`)

**Responsibility**: a thin, headless mouth for `core/`.

```typescript
// cli/index.ts
async function main(argv: string[]): Promise<number>   // exit code
export function offsetToLineCol(source: string, offset: number): { line: number; column: number }
// cli/args.ts
function parseArgs(argv: string[]): ParsedArgs | ParseError
```

### Layer 3: Renderer (`src/`)

**Responsibility**: the UI. Reaches `core/` only through `src/platform/`.

```typescript
// src/platform/contract.ts — the boundary interface
interface GraphvizApi {
  renderSvg(dot: string, engine: LayoutEngine): Promise<string>;
  validateDiagram(dot: string, engine: LayoutEngine): Promise<DiagramDiagnostics>;
  formatDot(source: string): Promise<string>;
  dotVocabulary(): Promise<DotVocabulary>;
  graphStats(source: string): Promise<GraphStats>;
  exportRender(dot: string, engine: LayoutEngine, format: ExportFormat, options?: PdfExportOptions): Promise<Uint8Array>;
  // + file dialogs, fs, electron-store, confirm, external links, app info,
  //   watch, menu recent/theme, and onFileChanged/onMenuAction push channels
}
```

`main.ts` `bootstrap()` composes the app: load window state + settings → apply color
scheme early → fetch the DOT vocabulary once (`dotVocabulary()`) → create the
`TabManager` and editors → restore the previous session → wire the tab bar, toolbar,
shortcuts, layout-engine selector, command palette, preferences, and session
persistence. See [COMPONENTS.md](./COMPONENTS.md).

---

## Data Model

See [OVERVIEW.md](./OVERVIEW.md#data-model) for the full type listing. In brief:

- **`TabState`** (`src/tabs/manager.ts`) — the in-memory document unit: id, file path,
  dirty flag, committed baseline, editor instance, zoom, and per-tab layout engine.
- **`core/types.ts`** — the render/export value types shared across the IPC boundary:
  `LayoutEngine`, `ExportFormat`, `DotValidationError`, `StructuralDiagnostic`,
  `DiagramDiagnostics`, `DotVocabulary`, `PdfExportOptions`, `ExportResult`. This is
  the **only** `core/` module the renderer may (type-only) import.

There is no persistent database; documents live on disk as `.dot`/`.gv` files, and
session state persists via `electron-store` under the `session` key.

---

## Key Design Decisions

### 1. Why a headless `core/` + IPC boundary?

**Decision**: All Graphviz work lives in a Node-only `core/`; the renderer reaches it
only over IPC.

**Rationale**:
- Electron's security model sandboxes the renderer (`contextIsolation`, no
  `nodeIntegration`) — it cannot load native `.node` binaries or WASM safely.
- Vite/rollup cannot bundle a native `.node` binary into the renderer.
- A headless core is independently testable and reusable by the CLI.

**Trade-offs**: preview/lint/export become asynchronous IPC round-trips; the renderer
must marshal DOT in and SVG/bytes out.

### 2. Why does the CLI mirror `core/` (the oracle)?

**Decision**: `graphvizjs validate`/`format` call the same `core/` functions the
renderer uses over IPC.

**Rationale**: gives a headless reproduction of exactly what the UI shows. If
`graphvizjs validate bug.dot --json` repros a symptom, the bug is in `core/`; if not,
it's in the renderer or the IPC seam. Also proves `core/` is free of DOM/Electron
coupling (it runs under plain Node).

### 3. Why relocate DOT language tooling into `core/` (v2.6.0)?

**Decision**: the scanner, vocabulary, structural lint, and formatter moved from
`src/editor/` into `core/`.

**Rationale**: the CLI and renderer were about to need two copies. The layer rule
forbids the renderer importing `core/` at runtime *and* forbids `core/` importing the
renderer — so a single shared copy can only live in `core/`, consumed by the renderer
over IPC (`render:validate` returns combined `{ syntax, structural }`; `dot:format`
and `dot:vocabulary` back the Format action and highlighting).

**Trade-offs**: live linting became asynchronous/IPC; editor construction now awaits a
one-time `dotVocabulary()` fetch at bootstrap.

### 4. Why a dependency-graph tool + `graph:check`?

**Decision**: `tools/dependency-graph` computes the module graph and audits it; CI
runs `pnpm graph:check`.

**Rationale**: the layering, cycle-freedom, and IPC integrity that make the headless
architecture work are invisible in code review. The tool makes them build-failing
invariants — and it also fails on stale committed reports, so the generated docs can't
drift.

### 5. Why silent session restore over autosave/recovery?

**Decision**: capture/restore tabs + unsaved edits silently on launch, instead of a
crash-recovery prompt.

**Rationale**: a diagram editor is a low-stakes, frequently-relaunched tool; silently
restoring the previous working set is less friction than a recovery dialog. The old
`autosave/` draft manager was replaced by `session/`.

---

## Rendering & Export Architecture

### Render (preview)
`renderDotToSvg(dot, engine)` calls the `@hpcc-js/wasm` Graphviz singleton
(`layout(dot, 'svg', engine)`). `normalize-svg.ts` rewrites the viewBox/padding as a
pure string transform (no DOM `getBBox`), so it runs identically in the renderer host
and headlessly in the CLI.

### Validate
`validateDiagram(source, engine)` = `validateDot` (Graphviz attempts a layout; a throw
is parsed into `{ message, line?, column? }`) **plus** `structuralDiagnostics(source)`
(pure delimiter-balance + unknown-attribute checks). The two are independent —
structural warnings surface even when syntax is valid.

### Export
`exportDiagram(dot, engine, format, options)` dispatches by `ExportFormat`:
- `svg` — normalized SVG string → bytes.
- `png` / `pngx2` — `@resvg/resvg-js` rasterization (1× / 2×).
- `pdf` — vector PDF via jsPDF + svg2pdf.js inside a jsdom + node-canvas environment,
  honoring `PdfExportOptions` (fit-to-page vs Letter/A4, orientation).

Native/WASM deps are ordinary `dependencies`, resolved from `node_modules` at runtime
(prebuilds install cross-platform); electron-builder `asarUnpack`s the natives.

---

## Performance Considerations

| Concern | Strategy |
|---------|----------|
| Preview latency | 300 ms debounce (`RENDER_DELAY`) + stale-token cancellation of superseded renders |
| Lint latency | 500 ms debounce, independent of preview; one IPC round-trip returns syntax + structural |
| WASM startup | Graphviz WASM loaded once (`initGraphviz` singleton), warmed eagerly in main on app-ready |
| Native export cost | resvg (PNG) and jsPDF/jsdom (PDF) load lazily on first use of that format |
| Editor construction | vocabulary fetched once at bootstrap and injected into the language + autocomplete |
| Headless SVG normalize | pure-string viewBox rewrite — no DOM, so identical in CLI |

---

## Security Architecture

GraphvizJS follows Electron's recommended hardening (`electron/main.ts`):

- **Context isolation on, node integration off, sandbox on** — the renderer runs with
  no direct Node access; all privileged operations go through the typed `preload`
  bridge.
- **Preload allow-list** — `window.graphviz` exposes only the `GraphvizApi` methods;
  no raw `ipcRenderer` is surfaced.
- **Navigation locked down** — `setWindowOpenHandler(() => ({ action: 'deny' }))` and a
  `will-navigate` `preventDefault` keep the SPA from navigating or spawning windows;
  external links go through `shell.openExternal` (http/https only).
- **No renderer Graphviz** — native/WASM code never enters the renderer bundle
  (renderer-purity guard), shrinking the attack surface of the sandboxed process.
- **File access via main** — reads/writes go through `fs:*` IPC handlers in the main
  process, not the renderer.

---

## Testing Strategy

### Test Pyramid

```
            /\
           /  \        E2E (Playwright, real file:// Electron window)
          /____\
         /      \      Integration (CLI subprocess of the compiled dist-cli binary)
        /________\
       /          \    Unit (Vitest + happy-dom — core, renderer modules, IPC wrappers)
      /____________\
     /              \  Architecture guards (renderer purity · graph:check · docs-check)
    /________________\
```

### Test Organization

| Directory | Purpose |
|-----------|---------|
| `test/core/` | render/validate, PNG/PDF/SVG export, normalize-svg, scan-dot, structure-lint, format, dot-vocab, `validateDiagram`, `parseGraph`, `graphStats` |
| `test/cli/` | arg parsing (incl. `stats`), `main()` integration, and a build-and-subprocess test of `dist-cli` |
| `test/editor/`, `test/preview/`, `test/toolbar/` | editor extensions, preview, toolbar actions |
| `test/tabs/`, `test/session/`, `test/recent/`, `test/watch/` | documents, session restore, recent, external-change |
| `test/menu/`, `test/palette/`, `test/preferences/`, `test/theme/` | app shell |
| `test/platform/` | IPC wrapper delegation |
| `test/architecture/` | renderer-purity guard |
| `test/tools/` | dependency-graph tool (IPC wiring, layering) |
| `test/e2e/` | Playwright end-to-end |

Coverage thresholds: 80% lines/functions/statements, 70% branches (`src/main.ts`
excluded). See [TEST_COVERAGE section of DEPENDENCY_GRAPH.md](./DEPENDENCY_GRAPH.md).

```bash
pnpm test            # unit
pnpm test:e2e        # Playwright (requires build)
pnpm graph:check     # architecture invariants + generated-doc freshness
pnpm docs:check      # hand-authored docs ↔ dependency graph
```

---

## Conclusion

GraphvizJS prioritizes:
- **One source of truth** — a headless `core/` shared by the CLI and the desktop UI.
- **Guarded architecture** — layering, cycles, IPC integrity, and doc freshness are
  build-failing invariants, not conventions.
- **Testability** — headless core, injected renderer dependencies, subprocess CLI tests.
- **Security** — a sandboxed renderer that holds zero Graphviz.

**Document Version**: 2.6.0 · **Last Updated**: 2026-07-08 · **Maintained By**: Daniel Simon Jr.
