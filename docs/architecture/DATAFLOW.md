# GraphvizJS — Data Flow Documentation

**Version**: 2.6.0
**Last Updated**: 2026-07-08

Every arrow that crosses from the renderer (`src/`) into Graphviz passes through the
IPC boundary — the renderer holds no Graphviz. The CLI reaches the same `core/`
functions in-process. These flows show both.

---

## Table of Contents

1. [Overview](#overview)
2. [IPC Round-Trip Anatomy](#ipc-round-trip-anatomy)
3. [Live Preview (Render) Flow](#live-preview-render-flow)
4. [Validation / Linting Flow](#validation--linting-flow)
5. [Format Flow](#format-flow)
6. [Graph Statistics Flow](#graph-statistics-flow)
7. [Export Flow](#export-flow)
8. [Vocabulary Bootstrap Flow](#vocabulary-bootstrap-flow)
9. [Session Restore Flow](#session-restore-flow)
10. [External-Change Flow](#external-change-flow)
11. [The Oracle Path (CLI ↔ UI)](#the-oracle-path-cli--ui)
12. [Error Handling](#error-handling)

---

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer (src/)  — CodeMirror editor, tabs, preview, toolbar   │
└─────────────────────────────┬───────────────────────────────────┘
                              │ window.graphviz.<method>()  (src/platform)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Electron preload  →  ipcRenderer.invoke('<channel>', …)        │
└─────────────────────────────┬───────────────────────────────────┘
                              │ IPC
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Electron main  —  ipcMain.handle('<channel>', …) → core.fn()   │
└─────────────────────────────┬───────────────────────────────────┘
                              │ in-process call
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  core/  —  renderDotToSvg / validateDiagram / exportDiagram /    │
│            formatDot / graphStats / dot vocabulary               │
└─────────────────────────────────────────────────────────────────┘

  cli/  ── imports core/ directly (no IPC) ──► core/
```

---

## IPC Round-Trip Anatomy

Every renderer→core call has the same four-point shape (guarded by `graph:check`):

```
src/platform/index.ts   renderSvg(dot, engine)
        │  window.graphviz.renderSvg(dot, engine)
        ▼
electron/preload.ts     renderSvg: (dot, engine) => ipcRenderer.invoke('render:svg', dot, engine)
        │  'render:svg'
        ▼
electron/main.ts        ipcMain.handle('render:svg', (_e, dot, engine) => renderDotToSvg(dot, engine))
        │  in-process
        ▼
core/render.ts          renderDotToSvg(dot, engine)  →  SVG string
        │  resolves back up the same path
        ▼
src/platform  ──►  Promise<string> to the caller
```

The 20 channels: `render:svg`, `render:validate`, `export:render`, `dot:format`,
`dot:stats`, `dot:vocabulary`, `fs:readText`/`writeText`/`writeBinary`,
`dialog:openText`/`save`/`confirm`, `store:get`/`set`/`delete`, `shell:openExternal`,
`app:info`, `menu:setRecent`/`setTheme`, `watch:setPaths` (+ `menu:action` /
`file:changed` push channels main→renderer).

---

## Live Preview (Render) Flow

```
Editor document changes
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. DEBOUNCE (RENDER_DELAY = 300 ms)                          │
│    createPreview().schedulePreviewRender(doc)               │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. CAPTURE TOKEN + ENGINE                                    │
│    token = ++current; engine = getEngine()  (active tab)    │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. IPC RENDER                                                │
│    svg = await renderSvg(doc, engine)   // render:svg       │
│    → core.renderDotToSvg → @hpcc-js/wasm layout(dot,'svg',E)│
│    → normalize-svg (pure viewBox/padding rewrite)           │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. STALE-TOKEN CHECK                                         │
│    if (token !== current) DROP  // a newer render superseded │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. INJECT SVG into the preview host element                  │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
   Preview updated (or a Graphviz error is surfaced in status)
```

---

## Validation / Linting Flow

One IPC call returns **both** syntax and structural diagnostics; the renderer maps
them to CodeMirror.

```
Editor idle (500 ms lint debounce)
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. LINT SOURCE                                               │
│    doc = view.state.doc; engine = getEngine()               │
│    { syntax, structural } = await validateDiagram(doc, E)   │  // render:validate
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. core.validateDiagram (main process)                       │
│    ├── syntax     = await validateDot(doc, engine)          │
│    │               (Graphviz layout; throw → {message,line?,col?})│
│    └── structural = structuralDiagnostics(doc)              │
│               (pure: balance + unknown-attribute over code spans)│
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. MAP TO DIAGNOSTICS (src/editor/linting.ts)               │
│    ├── syntax  → error at (line, column)                    │
│    └── structural[] → severity at (from, to) offsets        │
│         (offsets clamped to current doc length)             │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
   Gutter markers + squiggles rendered in the editor
```

---

## Format Flow

```
Shift+Alt+F  (or the Format toolbar button)
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. formatView(view)  — async                                │
│    current = view.state.doc.toString()                      │
│    next = await formatDot(current)      // dot:format        │
│    → core.formatDot: reindent by brace depth,               │
│      normalize ->/-- spacing, literals preserved, idempotent │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. APPLY (only if changed)                                   │
│    if (next !== current) dispatch replace-all transaction    │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
   Editor reformatted. (Keymap run() returns true synchronously;
   the reformat lands on the next tick when the IPC resolves.)
```

---

## Graph Statistics Flow

```
Command palette "Graph Statistics"  (or View menu → Show Graph Statistics)
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. statsDialog.open()                                        │
│    source = opts.getSource()   // active tab's DOT source    │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. stats = await graphStats(source)      // dot:stats        │
│    → core.parseGraph(source) → GraphModel (nodes/edges/      │
│      subgraphs) → core.computeStats(model) → GraphStats      │
│      (counts, directed/strict, roots/leaves/isolated,        │
│      self-loops, cycle detection)                            │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. RENDER                                                    │
│    dialog.innerHTML = label/value rows; dialog.showModal()  │
└─────────────────────────────────────────────────────────────┘
```

The same `graphStats` core function backs `graphvizjs stats [--json]` in-process (no
IPC) — see [The Oracle Path](#the-oracle-path-cli--ui).

---

## Export Flow

```
Export menu → format chosen
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. RESOLVE OPTIONS                                           │
│    format ∈ {svg, png, pngx2, pdf}                           │
│    (PDF: PdfOptions dialog → {mode, pageSize, orientation}) │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. IPC EXPORT                                                │
│    bytes = await exportRender(dot, engine, format, opts)    │  // export:render
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. core.exportDiagram — dispatch by format                   │
│    ├── svg   → normalized SVG string → bytes                 │
│    ├── png/pngx2 → @resvg/resvg-js rasterize (1× / 2×)       │
│    └── pdf   → jsPDF + svg2pdf.js in jsdom + node-canvas     │
│               (fit-to-page or Letter/A4, orientation)        │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. SAVE                                                      │
│    path = await pickSavePath(...)   // dialog:save           │
│    await writeBinaryFile(path, bytes)  // fs:writeBinary     │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
   File written to disk
```

---

## Vocabulary Bootstrap Flow

The DOT vocabulary (highlighting + autocomplete) is core-owned and fetched **once** at
startup, before the editor is built.

```
bootstrap()  (src/main.ts)
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ vocab = await dotVocabulary()          // dot:vocabulary     │
│    → main returns { keywords: [...DOT_KEYWORDS],             │
│                     attributes: [...DOT_ATTRIBUTES] }        │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ createDotLanguage(vocab)      // highlighting                │
│ createDotAutocomplete(vocab)  // completions                 │
│    → injected into every tab's CodeMirror editor            │
└─────────────────────────────────────────────────────────────┘
```

---

## Session Restore Flow

```
App launch → bootstrap()
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. LOAD SESSION                                              │
│    session = await loadSession(store)   // 'session' key    │
│    (tabs: path, unsaved doc, layout engine)                 │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. REBUILD TABS                                              │
│    for each saved tab → TabManager.createTab(...)           │
│    restore editor content + per-tab engine; only active     │
│    tab's editor is visible (others display:none)            │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. PERSIST ON CHANGE                                         │
│    document edits / tab changes → captureSession →          │
│    persistSession(store, data)                              │
└─────────────────────────────────────────────────────────────┘

No crash-recovery prompt — restore is silent.
```

---

## External-Change Flow

```
A file open in a tab changes on disk
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. WATCHER (main)                                           │
│    file-watcher.ts detects change → pushes 'file:changed'   │
└─────────────────────────────────────────────────────────────┘
      │  onFileChanged(path)
      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. DECIDE (watch-plan.ts — pure)                            │
│    tab clean?  → reload from disk                            │
│    tab dirty?  → prompt: keep mine / reload theirs          │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
   Tab reconciled with disk
```

The set of watched paths is pushed to the main process via `watch:setPaths` whenever
open files change.

---

## The Oracle Path (CLI ↔ UI)

Because the CLI and the renderer call the **same** `core/` functions, the CLI is a
troubleshooting oracle:

```
             ┌──────────────────────────┐        ┌──────────────────────────┐
 bug.dot ──► │ UI: render:validate IPC  │        │ CLI: graphvizjs validate │
             │  → validateDiagram       │        │  → validateDiagram       │
             └────────────┬─────────────┘        └────────────┬─────────────┘
                          ▼                                    ▼
                    diagnostics A                        diagnostics B
                          └───────────────┬────────────────────┘
                                          ▼
                    A == B  →  the bug is in core/  (reproduced headlessly)
                    A != B  →  the bug is in the renderer or the IPC seam
```

`graphvizjs validate bug.dot --json` emits `{ input, engine, valid, syntax,
structural[] }` for exact comparison; `graphvizjs format` vs the Format button does the
same for formatting, and `graphvizjs stats --json` (`{ input, ...GraphStats }`) vs the
Graph Statistics dialog does the same for structural metrics.

---

## Error Handling

### Render / validate
- A Graphviz layout failure throws inside `core`; `validateDot` catches it and returns
  a structured `DotValidationError` (`parseErrorLocation` extracts line/column). The
  preview surfaces the message; the linter marks the line.
- `formatDot` **fails safe** — on unbalanced delimiters it returns the input unchanged
  rather than risk corrupting the document.

### CLI exit codes
| Situation | Exit |
|-----------|------|
| valid / success | `0` |
| invalid DOT (syntax error, or `--strict` + structural warnings) | `1` |
| usage error (bad flags / missing input) | `2` |

### IPC
- Handlers return rejected promises on failure; the renderer wrapper propagates them to
  the calling action, which shows user-facing feedback. Missing/malformed channels
  are caught at build time by `graph:check` (IPC integrity), not at runtime.

---

**Document Version**: 2.6.0 · **Last Updated**: 2026-07-08 · **Maintained By**: Daniel Simon Jr.
