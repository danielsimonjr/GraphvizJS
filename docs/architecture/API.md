# GraphvizJS — API Reference

**Version**: 2.6.0
**Last Updated**: 2026-07-08

GraphvizJS exposes three public surfaces, all backed by the same `core/`:

1. The **`graphvizjs` CLI** — headless render / validate / format.
2. The **`GraphvizApi` IPC contract** — `window.graphviz` in the renderer.
3. The **`core/` module functions** — consumed by the CLI and the Electron main process.

---

## Table of Contents

1. [CLI](#cli)
2. [IPC Contract (`GraphvizApi`)](#ipc-contract-graphvizapi)
3. [Core Functions](#core-functions)
4. [Value Types](#value-types)

---

## CLI

Binary: `graphvizjs` → `dist-cli/cli/index.js`. Build with `pnpm build:cli`; run from
source with `pnpm graphvizjs -- <args>` (tsx). Input `-` reads from stdin.

```
graphvizjs render   <input.dot|-> -o <output> [--engine E] [--format svg|png|pdf]
                     [--scale 1|2] [--pdf-page fit|letter|a4] [--pdf-orientation auto|portrait|landscape]
graphvizjs validate <input.dot|-> [--engine E] [--json] [--strict]
graphvizjs format   <input.dot|-> [-o <output>]
graphvizjs --help | --version
```

### `render`

Renders DOT to a file. Format is inferred from the `-o` extension unless `--format` is
given.

```bash
graphvizjs render g.dot -o g.svg
graphvizjs render g.dot -o g.png --format png --scale 2
graphvizjs render g.dot -o g.pdf --engine neato --pdf-page a4 --pdf-orientation landscape
cat g.dot | graphvizjs render - -o g.svg
```

| Flag | Values | Default |
|------|--------|---------|
| `-o`, `--output` | path (required) | — |
| `--engine` | `dot`/`neato`/`fdp`/`sfdp`/`circo`/`twopi`/`osage`/`patchwork` | `dot` |
| `--format` | `svg`/`png`/`pdf` | inferred from `-o`, else `svg` |
| `--scale` | `1`/`2` (PNG only; `2` → `pngx2`) | `1` |
| `--pdf-page` | `fit`/`letter`/`a4` | `fit` |
| `--pdf-orientation` | `auto`/`portrait`/`landscape` | `auto` |

### `validate` — the oracle

Validates DOT for **syntax** errors (Graphviz) and **structural** warnings (delimiter
balance, unknown attributes).

```bash
graphvizjs validate g.dot                # human output on stderr; "<name>: ok" when valid
graphvizjs validate g.dot --json         # machine-readable (see below)
graphvizjs validate g.dot --strict       # exit 1 if any structural warnings
graphvizjs validate g.dot --engine neato
```

**`--json` output:**

```json
{
  "input": "g.dot",
  "engine": "dot",
  "valid": true,
  "syntax": null,
  "structural": [
    { "severity": "warning", "message": "Unknown attribute 'shp'", "line": 1, "column": 14 }
  ]
}
```

`valid` is `false` when there is a syntax error, or when `--strict` and any structural
warning is present. Structural findings' character offsets are converted to 1-based
`line`/`column` via `offsetToLineCol`.

### `format`

Reformats DOT (reindent + `->`/`--` spacing; literals preserved; idempotent). Writes to
`-o <path>` or stdout.

```bash
graphvizjs format g.dot -o pretty.dot
graphvizjs format g.dot                  # to stdout
cat g.dot | graphvizjs format -
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | success / valid |
| `1` | invalid DOT (syntax error, or `--strict` with warnings), or an I/O error |
| `2` | usage error (unknown flag, missing input/output) |

---

## IPC Contract (`GraphvizApi`)

Declared in `src/platform/contract.ts`, exposed on `window.graphviz` by
`electron/preload.ts`, and wrapped for renderer use in `src/platform/index.ts`. Every
method maps to one IPC channel; `graph:check` enforces that all four sides line up.

```typescript
interface GraphvizApi {
  // Files & dialogs
  openTextFile(filters: DiagramFilter[]): Promise<OpenedFile | null>;   // dialog:openText
  pickSavePath(opts: { defaultPath: string; filters: DiagramFilter[] }): Promise<string | null>; // dialog:save
  readTextFile(path: string): Promise<string | null>;                   // fs:readText
  writeTextFile(path: string, content: string): Promise<void>;          // fs:writeText
  writeBinaryFile(path: string, bytes: Uint8Array): Promise<void>;      // fs:writeBinary
  confirm(message: string, opts?: ConfirmOptions): Promise<boolean>;    // dialog:confirm

  // Persistence (electron-store)
  storeGet<T>(key: string): Promise<T | undefined>;                     // store:get
  storeSet(key: string, value: unknown): Promise<void>;                 // store:set
  storeDelete(key: string): Promise<void>;                              // store:delete

  // Shell & app
  openExternal(url: string): Promise<void>;                             // shell:openExternal
  appInfo(): Promise<{ name: string; version: string }>;                // app:info

  // Watch & native menu
  setWatchedPaths(paths: string[]): Promise<void>;                      // watch:setPaths
  setMenuRecent(paths: string[]): Promise<void>;                        // menu:setRecent
  setMenuTheme(scheme: string): Promise<void>;                          // menu:setTheme
  onFileChanged(cb: (path: string) => void): () => void;                // file:changed (push)
  onMenuAction(cb: (action: string, payload?: string) => void): () => void; // menu:action (push)

  // Graphviz + DOT language (the core surface)
  renderSvg(dot: string, engine: LayoutEngine): Promise<string>;                    // render:svg
  validateDiagram(dot: string, engine: LayoutEngine): Promise<DiagramDiagnostics>;  // render:validate
  formatDot(source: string): Promise<string>;                                       // dot:format
  dotVocabulary(): Promise<DotVocabulary>;                                          // dot:vocabulary
  exportRender(dot: string, engine: LayoutEngine, format: ExportFormat, options?: PdfExportOptions): Promise<Uint8Array>; // export:render
}
```

The renderer imports thin wrappers (same names) from `src/platform` rather than
touching `window.graphviz` directly — e.g. `renderSvg`, `validateDiagram`, `formatDot`,
`dotVocabulary`, `exportRender`, and a `store` object.

---

## Core Functions

`core/` is Node-only. Import paths carry explicit `.js` extensions (NodeNext) within
`core/`/`cli/`; the renderer must **not** import these at runtime (type-only
`core/types` is the sole exception).

```typescript
// core/render.ts
function initGraphviz(): Promise<void>
function isGraphvizReady(): boolean
function renderDotToSvg(dotSource: string, engine?: LayoutEngine): Promise<string>
function validateDot(dotSource: string, engine?: LayoutEngine): Promise<DotValidationError | null>

// core/validate.ts
function validateDiagram(source: string, engine?: LayoutEngine): Promise<DiagramDiagnostics>

// core/format.ts
function formatDot(source: string, opts?: { indent?: string }): string

// core/structure-lint.ts
function structuralDiagnostics(source: string): StructuralDiagnostic[]

// core/scan-dot.ts
function scanDot(source: string): Span[]
function checkBalance(source: string): { balanced: boolean; error?: { pos: number; message: string } }

// core/dot-vocab.ts
const DOT_KEYWORDS: readonly string[]
const DOT_ATTRIBUTES: readonly string[]

// core/export.ts
function exportDiagram(dot: string, engine: LayoutEngine, format: ExportFormat, options?: PdfExportOptions): Promise<ExportResult>

// core/normalize-svg.ts
function normalizeSvg(svg: string): string   // pure viewBox/padding rewrite
```

---

## Value Types

Declared in `core/types.ts` — the shared vocabulary across the IPC boundary and the
only `core/` module the renderer may (type-only) import.

```typescript
type LayoutEngine = 'dot' | 'neato' | 'fdp' | 'sfdp' | 'circo' | 'twopi' | 'osage' | 'patchwork';
type ExportFormat = 'png' | 'pngx2' | 'svg' | 'pdf';
type PdfPageMode = 'fit' | 'standard';
type PdfPageSize = 'letter' | 'a4';
type PdfOrientation = 'auto' | 'portrait' | 'landscape';

interface DotValidationError { message: string; line?: number; column?: number; }
interface StructuralDiagnostic { from: number; to: number; severity: 'error' | 'warning'; message: string; }
interface DiagramDiagnostics { syntax: DotValidationError | null; structural: StructuralDiagnostic[]; }
interface DotVocabulary { keywords: string[]; attributes: string[]; }
interface PdfExportOptions { mode: PdfPageMode; pageSize: PdfPageSize; orientation: PdfOrientation; }
interface ExportResult { bytes: Uint8Array; ext: string; mime: string; }
```

Renderer-side contract helper types (`src/platform/contract.ts`): `DiagramFilter`,
`OpenedFile`, `ConfirmOptions`.

---

**Document Version**: 2.6.0 · **Last Updated**: 2026-07-08 · **Maintained By**: Daniel Simon Jr.
