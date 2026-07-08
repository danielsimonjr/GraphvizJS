# GraphvizJS — Component Reference

**Version**: 2.6.0
**Last Updated**: 2026-07-08

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
(from `docs/architecture/dependency-graph.json`, regenerate with `pnpm graph`):

```
┌───────────────────────────────────────────────────────────────┐
│  core/         │  Graphviz + DOT language tooling (11 files)   │
├───────────────────────────────────────────────────────────────┤
│  cli/          │  graphvizjs binary (2 files)                  │
├───────────────────────────────────────────────────────────────┤
│  electron/     │  main process, preload, menu, watcher (4)     │
├───────────────────────────────────────────────────────────────┤
│  src/platform/ │  renderer↔main IPC boundary (2 files)         │
│  src/editor/   │  CodeMirror extensions (7 files)              │
│  src/toolbar/  │  one module per action (15 files)             │
│  src/preview/  │  live preview + zoom (2 files)                │
│  src/tabs/     │  multi-tab management (2 files)               │
│  src/menu/     │  native menu template + dispatch (2 files)    │
│  src/watch/    │  external-change detection (2 files)          │
│  src/{session,recent,theme,palette,preferences,help,           │
│       workspace,window,utils,autosave}/  (1 file each)         │
│  src/main.ts   │  bootstrap() (module 'root')                  │
└───────────────────────────────────────────────────────────────┘
```

**Total:** 60 TypeScript files · 6,346 LOC · 21 modules · 180 exports · 19 IPC channels.

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
analysis.

```typescript
interface DiagramDiagnostics { syntax: DotValidationError | null; structural: StructuralDiagnostic[]; }
async function validateDiagram(source: string, engine?: LayoutEngine): Promise<DiagramDiagnostics>
```

Consumed by the CLI `validate` command and the `render:validate` IPC handler.

### structure-lint.ts (`core/structure-lint.ts`)

**Purpose**: pure structural diagnostics — delimiter balance and unknown-attribute
checks over code spans (literals are skipped via the scanner).

```typescript
interface StructuralDiagnostic { from: number; to: number; severity: 'error' | 'warning'; message: string; }
function structuralDiagnostics(source: string): StructuralDiagnostic[]
```

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
```

### format.ts (`core/format.ts`)

**Purpose**: pure DOT reformatter — reindent by brace depth and normalize `->`/`--`
spacing in code regions; literals preserved verbatim; idempotent; fails safe (returns
input unchanged on unbalanced delimiters).

```typescript
interface FormatOptions { indent?: string; }
function formatDot(source: string, opts?: FormatOptions): string
```

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
`ExportFormat`, `DotValidationError`, `StructuralDiagnostic`, `DiagramDiagnostics`,
`DotVocabulary`, `PdfExportOptions`, `ExportResult`. **The only `core/` module the
renderer may type-only import.**

---

## CLI Components

### args.ts (`cli/args.ts`)

**Purpose**: pure argument parsing for `render` / `validate` / `format`.

```typescript
interface ParsedArgs {
  command: 'render' | 'validate' | 'format' | 'help' | 'version';
  input?: string; output?: string; engine: LayoutEngine;
  format?: 'svg' | 'png' | 'pdf'; scale: 1 | 2; pdf: PdfExportOptions;
  json?: boolean; strict?: boolean;   // validate only
}
function parseArgs(argv: string[]): ParsedArgs | ParseError
```

### index.ts (`cli/index.ts`)

**Purpose**: command dispatch and the binary entry point.

```typescript
async function main(argv: string[]): Promise<number>   // exit code: 0 ok, 1 fail, 2 usage
function offsetToLineCol(source: string, offset: number): { line: number; column: number }
```

`validate` prints human diagnostics or `--json`, deriving line/column for structural
findings via `offsetToLineCol`. See [API.md](./API.md).

---

## Electron Components

### main.ts (`electron/main.ts`)

**Purpose**: create the window, register the 19 IPC handlers, own persistence and the
native menu/watcher.

```typescript
function registerIpc(): void
// render:svg → renderDotToSvg · render:validate → validateDiagram
// export:render → exportDiagram · dot:format → formatDot · dot:vocabulary → vocab
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
from one `validateDiagram` call into CodeMirror `Diagnostic`s.

### preview/ (`src/preview/`)

**Purpose**: debounced live preview + preview zoom.

```typescript
function createPreview(opts): { schedulePreviewRender(doc: string): void }  // render.ts
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

### help/ · workspace/ · window/ · utils/ · autosave/

- **help/** — help dialog (shortcuts + app info).
- **workspace/** — horizontal resizable pane divider.
- **window/** — window position/size persistence via `electron-store`.
- **utils/** — `debounce`.
- **autosave/** — legacy constants only; superseded by `session/`.

### root — `src/main.ts`

**Purpose**: `bootstrap()` — the single composition root. Loads window state +
settings, applies the color scheme early, fetches the DOT vocabulary once, builds the
`TabManager` + editors, restores the previous session, and wires the tab bar, toolbar,
shortcuts, layout-engine selector, command palette, preferences, and session
persistence.

---

## Component Dependencies

Module-level dependency edges (from `pnpm graph`; the renderer never imports `core/`
at runtime — its `core/types` reference is type-only):

```
root ──► (everything in src/) + core (type-only)
│
├── platform ──► core (type-only)
├── editor   ──► core (type-only)
├── preview  ──► core (type-only), utils
├── toolbar  ──► core (type-only), platform, theme
├── tabs     ──► core (type-only)
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

---

**Document Version**: 2.6.0 · **Last Updated**: 2026-07-08 · **Maintained By**: Daniel Simon Jr.
