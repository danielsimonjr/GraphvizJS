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
- Dependency-graph tool (`pnpm graph` / `graph:check`) that guards layering, cycles, and IPC wiring in CI

### Platform
- Migrated from Tauri to Electron (v2.0); renderer purity hardened so no Graphviz leaks into the renderer bundle

## Backlog / ideas

Not yet built — rough sketches, not commitments:

- **Graph statistics panel** — node/edge/cluster counts, graph type, and active engine, in a collapsible panel or status bar (parse the rendered SVG + DOT source).
- **Node/edge template snippets** — an "Insert Template" menu of common node/edge/cluster styles (records, HTML labels, arrow styles) inserted at the cursor.
- **Preferences growth** — additional settings sections beyond Appearance (e.g. editor defaults, export defaults) as the dialog was designed to accommodate.

Have an idea? Open an issue or add a design doc under `docs/superpowers/specs`.
