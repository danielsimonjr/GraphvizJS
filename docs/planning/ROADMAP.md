# GraphvizJS Desktop Roadmap

> **Authoritative history lives in [`CHANGELOG.md`](../../CHANGELOG.md).** This file is a
> high-level map of what's shipped and what's on the backlog. Per-feature design docs are in
> [`docs/superpowers/specs`](../superpowers/specs); the frozen per-sprint TODO JSONs in this
> folder are historical build logs, not a live plan.

## Shipped

The desktop app and its headless `graphvizjs` CLI share one Node-only `core/` (enforced by the
dependency-graph tool). Delivered so far:

### Editing & preview
- Graphviz WebAssembly rendering with a debounced live preview and friendly error feedback
- DOT syntax highlighting, autocomplete (keywords, attributes, value enums) and snippets
- Inline linting — Graphviz syntax errors **and** structural warnings (delimiter balance, unknown attributes)
- Format Document (reindent + spacing) — Shift+Alt+F
- All Graphviz layout engines, selectable per tab
- Editor font zoom and preview zoom; resizable editor/preview panes

### Documents & session
- New / open / save / save-as via native dialogs; recent-files menu
- Multiple tabs, each with its own file, unsaved state, and layout engine
- Silent session restore across launches (tabs, unsaved edits, per-tab settings)
- External file-change detection (reloads clean tabs, prompts for dirty ones)
- Window position/size/maximized persistence

### Export
- SVG, PNG (1× / 2×), and vector PDF (fit-to-page or Letter/A4, with orientation)

### App shell
- System / Light / Dark theme (toolbar, command palette, or Preferences)
- Command palette (Ctrl/Cmd+Shift+P)
- Preferences dialog (Cmd/Ctrl+,) — Appearance → Theme, built to grow
- Native application menu; help dialog (F1); on-brand application icon

### Headless core & CLI
- `core/` owns all Graphviz work and pure DOT language tooling (scanner, vocabulary, structural lint, formatter, validator)
- `graphvizjs` CLI: `render` (SVG/PNG/PDF), `validate` (syntax + structural, `--json`, `--strict`), `format`
- The CLI is an oracle for the desktop app — same core, reachable headlessly
- Standalone executable (`pnpm build:cli:exe`, Node SEA): a single `graphvizjs.exe` an advanced user runs with no Node install. Covers the pure/WASM subset (`format`, `validate`, `render→svg`); `render→png/pdf` still need the native install (`pnpm build:cli`), since native `.node` binaries can't be inlined into one file
- Dependency-graph tool (`pnpm graph` / `graph:check`) that guards layering, cycles, and IPC wiring in CI

### Platform
- Migrated from Tauri to Electron (v2.0); renderer purity hardened so no Graphviz leaks into the renderer bundle

## Backlog — making GraphvizJS the best DOT editor

Not yet built — sketches, not commitments. The editor fundamentals (highlighting,
folding, multi-cursor, comment toggle, bracket matching, find/replace) already ship via
CodeMirror's `basicSetup`; the gap from *good* to *best* is **interaction and
intelligence**, not more text features. Ranked by leverage.

Each item is split by the **logic-vs-presentation seam** (see
[`.claude/CLAUDE.md` → Adding Features](../../.claude/CLAUDE.md)): the *logic* part is
built core-first with a CLI surface and tests; the *presentation* part is renderer-only.
Sequencing preference: build the pure-logic items first (semantic lint, graph
intelligence — ~100% core, perfect workflow fit), then the node↔source map as the shared
foundation for the hybrid features.

### Tier 1 — the differentiators
- **Source ↔ preview sync** — click a rendered node → jump to its source line; cursor on a
  node → highlight it in the preview. *Core:* a `mapNodesToSource(dot, svg)` map (Graphviz
  SVG tags nodes with `<title>`), exposed via a CLI `map --json`. *UI:* click→scroll,
  highlight. The shared foundation for most of the hybrids below.
- **Preview navigation** — drag-to-**pan**, **fit-to-window**, zoom-to-cursor,
  **find-a-node-in-the-graph** (search + center/highlight), and a **minimap** for large
  diagrams. (Today's zoom is centered CSS scale only.) *Core:* the fit-transform math;
  everything else is presentation.
- **Context-aware IntelliSense** — complete existing **node IDs** in edges; scope attribute
  completions to node/edge/graph/cluster context; **hover docs** (attribute → purpose,
  valid values, default, contexts). *Core:* an attribute catalog + context-at-offset,
  exposed via CLI `complete --at N` / `attr-info`. *UI:* the popup/tooltip.

### Tier 2 — correctness & confidence
- **Semantic lint + quick fixes** — invalid attribute *values*, wrong-context attributes,
  deprecated attrs, "did you mean `shape`?" typo fixes, duplicate/undefined node & cluster
  checks, color validation. ~100% core — a new `validate` verb on the existing oracle.

### Tier 3 — lowering the barrier (for non-experts)
- **Attribute inspector / property panel** — select a node → a form (shape dropdown, inline
  **color picker**, style toggles) that writes DOT back. *Core:* DOT edit transforms
  (`setNodeAttribute`) + the catalog, via CLI `set-attr`. *UI:* the form.
- **Snippet & template library** — records, HTML-table labels, rank groups, and ready-made
  scaffolds (state machine, ERD, flowchart, class diagram); plus **user-defined snippets**.

### Tier 4 — engineer analysis value (~100% core)
- **Graph intelligence** — a stats panel (node/edge/cluster counts, directed?, cycles?), a
  structure/outline navigator (nodes/subgraphs/clusters tree), cycle detection, path
  highlighting, and visual diff between two versions. CLI `stats` / `analyze` / `outline`.

### Tier 5 — scale & output ergonomics
- **Large-graph handling** — a manual/deferred render toggle for huge graphs (300 ms
  auto-render lags past a point) and incremental render.
- **Output ergonomics** — copy rendered SVG/PNG to clipboard, print, export current
  view/selection.

Have an idea? Open an issue or add a design doc under `docs/superpowers/specs`.
