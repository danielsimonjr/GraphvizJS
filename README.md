# GraphvizJS Desktop Client

GraphvizJS is a desktop editor for [Graphviz](https://graphviz.org/) DOT diagrams with real-time preview, syntax highlighting, and SVG/PNG/PDF export. Built with Electron, it pairs a multi-tab, CodeMirror-based authoring experience with a live preview powered by Graphviz WebAssembly, a light/dark theme, a command palette, and zoom controls for both editor and preview. All Graphviz work (render, validation, and export) runs headlessly in a Node-only core in the main process; the same core also ships as a `graphvizjs` CLI.

Based on [MermaidJS Desktop Client](https://github.com/skydiver/mermaidjs-desktop-client) by Martín M.

# Table of Contents

1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Getting Started](#getting-started)
4. [Building](#building)
5. [Command-Line Interface](#command-line-interface)
6. [Tooling](#tooling)
7. [Testing](#testing)
8. [Project Structure](#project-structure)
9. [Acknowledgements](#acknowledgements)

## Features

- **Live editing** – Write DOT with syntax highlighting, autocomplete (keywords, attributes, and value enums), snippets, line wrapping, and tab indentation.
- **Instant preview** – Debounced rendering keeps the preview in sync while typing, with friendly error feedback when diagrams fail to render.
- **Inline linting** – Real-time diagnostics combine Graphviz syntax errors with structural warnings (unbalanced delimiters, unknown attributes), shown in the gutter.
- **Multiple layout engines** – All Graphviz engines (dot, neato, fdp, sfdp, circo, twopi, osage, patchwork), selectable per tab.
- **Multiple tabs** – Edit several diagrams at once; each tab keeps its own file, unsaved state, and layout engine.
- **Session restore** – Open tabs, unsaved edits, and per-tab settings are silently restored on the next launch — no crash-recovery prompt.
- **File workflow** – New, open, save, and save-as via native dialogs; a recent-files menu; and external-change detection that reloads clean tabs (and prompts for dirty ones) when a file changes on disk.
- **Smart exports** – Save diagrams as PNG (1× and 2× scale), SVG, or vector PDF (fit-to-page or Letter/A4, with orientation), all with built-in padding and scaling.
- **Format document** – One-shot reindent and spacing cleanup of DOT source (Shift+Alt+F).
- **Command palette** – Fuzzy-search and run any command with Ctrl/Cmd+Shift+P.
- **Theme** – System, Light, or Dark, switchable from the toolbar, the command palette, or Preferences.
- **Preferences dialog** – Cmd/Ctrl+, opens app settings (Appearance → Theme today, built to grow).
- **Graph statistics** – Node/edge/subgraph/cluster counts, directed/strict flags, roots/leaves/isolated nodes, self-loops, and cycle detection for the current diagram, in a dialog (command palette + View menu) or via `graphvizjs stats`.
- **Built-in examples** – Quick-start templates for directed graphs, undirected graphs, clusters, and more.
- **Native application menu** – Standard File/Edit/View/Help menus wired to the same actions as the toolbar and keyboard.
- **Editor & preview zoom** – Zoom the editor font (Cmd/Ctrl+=/−/0) and the diagram (Ctrl+Scroll or toolbar controls).
- **Help dialog** – Press F1 for app info, keyboard shortcuts, and available examples.
- **Resizable workspace** – Drag the divider to resize editor/preview panes, or double-click to reset.
- **Window persistence** – Window position, size, and maximized state persist between launches via electron-store.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- [pnpm](https://pnpm.io/) (preferred package manager for this repo)

No Rust toolchain or platform-native SDK is required — Electron bundles its own Chromium and Node runtime.

## Getting Started

```bash
# Install dependencies
pnpm install

# Run the desktop app with live reload
pnpm dev
```

`pnpm dev` starts the Vite dev server and launches Electron pointing at `http://localhost:5173`. Changes to the renderer reload automatically; changes to the main process or preload script require restarting the command.

## Building

```bash
# Type-check TypeScript and bundle renderer + main + preload
pnpm build

# Produce the Windows NSIS installer (.exe) in release/ via electron-builder
pnpm package
```

GraphvizJS targets **Windows only**. The `release/` directory contains the generated NSIS `.exe` installer.

## Command-Line Interface

The same headless core also ships as a `graphvizjs` CLI for scripting and CI — no desktop app or browser required. It exposes exactly what the desktop app does, over the same `core/`: rendering, validation, formatting, and graph statistics.

```bash
# Compile the CLI to dist-cli/ (also runs automatically on `npm pack`)
pnpm build:cli

# Render DOT to SVG / PNG / PDF
graphvizjs render diagram.dot -o diagram.svg
graphvizjs render diagram.dot -o diagram.png --format png --scale 2
graphvizjs render diagram.dot -o diagram.pdf --engine neato --pdf-page a4

# Validate DOT — syntax errors + structural warnings
graphvizjs validate diagram.dot                 # human output; exit 0 valid, 1 invalid, 2 usage
graphvizjs validate diagram.dot --json          # machine-readable { valid, syntax, structural[] }
graphvizjs validate diagram.dot --strict        # also fail (exit 1) on structural warnings

# Format (reindent) DOT
graphvizjs format diagram.dot -o pretty.dot     # write to a file
graphvizjs format diagram.dot                   # or print to stdout

# Graph statistics — structural metrics + cycle detection
graphvizjs stats diagram.dot                    # human output
graphvizjs stats diagram.dot --json             # machine-readable

# Read DOT from stdin (any command)
cat diagram.dot | graphvizjs render - -o out.svg

graphvizjs --help
graphvizjs --version
```

Because `validate` and `format` call the very same `core/` functions the renderer reaches over IPC, the CLI doubles as an **oracle** for troubleshooting the desktop app: run a problematic diagram through `graphvizjs validate --json` and, if it reproduces the symptom, the bug is in `core/`; if not, it's in the renderer or the IPC layer.

`bin.graphvizjs` points at the compiled `dist-cli/cli/index.js`, so `npm link` (or a global install of the packed tarball) exposes the `graphvizjs` command on any platform. To run it from source without building, use `pnpm graphvizjs -- render diagram.dot -o out.svg` (via tsx). The native rendering deps (`@resvg/resvg-js`, `canvas`) and WASM Graphviz install as normal dependencies with cross-platform prebuilds.

### Standalone executable

```bash
pnpm build:cli:exe   # → dist-exe/graphvizjs.exe (no Node install required to run it)
```

Bundles the CLI + core + the (inlined-WASM) Graphviz engine into a single executable via
Node's [Single Executable Applications](https://nodejs.org/api/single-executable-applications.html).
It covers the pure/WASM subset — **`format`, `validate`, `stats`, and `render→svg`** — with no
dependencies. `render→png/pdf` still require the full `pnpm build:cli` install, because
their native `.node` binaries (`@resvg/resvg-js`, `canvas`) can't be inlined into one file.

## Tooling

- `pnpm clean` – Remove build artifacts (`dist/`)
- `pnpm lint` – Run [Biome](https://biomejs.dev/) linter and formatter checks
- `pnpm lint:fix` – Automatically apply Biome fixes
- `pnpm typecheck` – Type-check TypeScript without emitting files
- `pnpm graph` – Regenerate the dependency-graph report in `docs/architecture/`
- `pnpm graph:check` – Verify architecture invariants (layer boundaries, no cycles, IPC wiring) **and** that the committed report isn't stale, without writing; exits non-zero on any violation (run in CI)
- `pnpm graph -- --impact <file>` – Print the transitive reverse-dependencies (blast radius) of a source file

The dependency-graph tool enforces the headless-core layering: `core/` is a self-contained leaf, `cli/` depends only on `core/`, the Electron main process may reuse only the pure shared renderer modules (`menu`/`watch`/`platform`), and the renderer (`src/`) may reference `core/` only as the type-only `core/types` contract. A broken boundary — or a stale committed graph — fails `pnpm graph:check` (and CI).

## Testing

The project uses [Vitest](https://vitest.dev/) for unit testing with [happy-dom](https://github.com/nicholasribeiro/happy-dom) for DOM simulation, and [Playwright](https://playwright.dev/) for E2E tests that run against the production `file://` build inside a real Electron window.

```bash
# Run unit tests
pnpm test

# Run unit tests in watch mode
pnpm test:watch

# Run unit tests with coverage report
pnpm test:coverage

# Run E2E tests (requires pnpm build first)
pnpm test:e2e

# Run E2E tests with visible browser
pnpm test:e2e:headed

# Run E2E tests in debug mode
pnpm test:e2e:debug
```

### Coverage

Coverage reports are generated in HTML and LCOV formats in the `coverage/` directory. Current coverage thresholds:
- Lines: 80%
- Functions: 80%
- Branches: 70%
- Statements: 80%

### Test Structure

Tests mirror the source structure:
- `test/core/` – Headless core: render/validate, PNG/PDF/SVG export, normalize-svg, scan-dot, structure-lint, format, dot-vocab, `validateDiagram`
- `test/cli/` – CLI argument parsing, `main()` integration (render/validate/format/stats), and a build-and-subprocess test of the compiled `dist-cli` binary
- `test/editor/` – Editor extensions (language, autocomplete, linting, search, theme, zoom, dot-data)
- `test/preview/` – Preview scheduling and zoom
- `test/toolbar/` – Toolbar actions (file ops, export, menus, format, layout engine, theme button, …)
- `test/tabs/`, `test/session/`, `test/recent/`, `test/watch/` – Multi-tab, session restore, recent files, external-change handling
- `test/menu/`, `test/palette/`, `test/preferences/`, `test/theme/` – Native menu, command palette, preferences, color scheme
- `test/platform/` – Renderer↔main IPC wrapper delegation
- `test/workspace/`, `test/window/`, `test/help/`, `test/utils/` – Pane resize, window state, help dialog, debounce
- `test/architecture/` – Renderer-purity guard (no Graphviz runtime imports leak into `src/`)
- `test/tools/` – Dependency-graph tool (IPC wiring, layering)
- `test/mocks/` – Shared mocks for Electron APIs and Graphviz WASM
- `test/e2e/` – End-to-end tests with Playwright (app, rendering, file ops, export, examples, shortcuts)

## Project Structure

The codebase is split into a Node-only headless core, an Electron main process, a browser renderer, and a CLI. The dependency-graph tool (see [Tooling](#tooling)) enforces the layering: `core/` is a self-contained leaf, `cli/` depends only on `core/`, and the renderer (`src/`) may reference `core/` only as the type-only `core/types` contract — it reaches Graphviz strictly over IPC.

- `core/` – Node-only, DOM-free. All Graphviz work **and** pure DOT language tooling: `render.ts` (DOT→SVG + syntax validation via `@hpcc-js/wasm`), `normalize-svg.ts`, `export-png.ts`/`export-pdf.ts`/`export.ts` (SVG/PNG/PDF), `scan-dot.ts` (literal-aware scanner), `dot-vocab.ts` (keyword/attribute vocabulary), `structure-lint.ts` (structural diagnostics), `format.ts` (`formatDot`), `validate.ts` (`validateDiagram` = syntax + structural), `parse-graph.ts` (DOT source → structural `GraphModel`), `graph-stats.ts` (`graphStats` = node/edge/subgraph/cluster counts, roots/leaves/isolated, self-loops, cycle detection), and `types.ts`. Consumed by both the Electron main process and the CLI.
- `cli/` – The `graphvizjs` binary: `args.ts` (argument parsing) and `index.ts` (`render`/`validate`/`format`/`stats` commands). Compiled to `dist-cli/`.
- `src/` – Renderer (TypeScript/Vite); each subdirectory exports setup functions wired together by `main.ts`:
  - `platform/` – The renderer↔main IPC boundary (`contract.ts` = the `window.graphviz` API, `index.ts` = thin wrappers)
  - `editor/` – CodeMirror extensions: language/highlighting, autocomplete, linting, search, theme, font zoom
  - `preview/` – Debounced live preview (over IPC) and preview zoom
  - `toolbar/` – One module per action (new/open/save/save-as, export + export menu, examples, recent, layout engine, find, format, PDF options, theme button, shortcuts)
  - `tabs/` – Multi-tab management (`manager.ts`, `tab-bar.ts`)
  - `session/` – Silent session capture/restore across launches
  - `recent/` – Recent-files list core
  - `watch/` – External file-change detection
  - `menu/` – Native application menu template + command dispatch
  - `theme/` – System/Light/Dark color scheme controller
  - `palette/` – Command palette (Ctrl/Cmd+Shift+P)
  - `preferences/` – Preferences dialog
  - `stats/` – Graph Statistics dialog (over the `dot:stats` IPC channel)
  - `help/` – Help dialog
  - `workspace/` – Resizable pane divider
  - `window/` – Window position/size persistence
  - `examples/` – Built-in `.dot` templates (Vite glob import)
  - `utils/` – Shared utilities (debounce)
- `electron/` – Electron main process (`main.ts` + IPC handlers), preload script (`preload.ts`), native menu (`app-menu.ts`), and file watcher (`file-watcher.ts`)
- `tools/dependency-graph/` – The architecture/dependency analyzer behind `pnpm graph` / `pnpm graph:check`

## Acknowledgements

Built with [Electron](https://www.electronjs.org/), [Vite 7](https://vitejs.dev/), [CodeMirror 6](https://codemirror.net/6/), [@hpcc-js/wasm](https://github.com/hpcc-systems/hpcc-js-wasm) (Graphviz WebAssembly), [@resvg/resvg-js](https://github.com/yisibl/resvg-js) (PNG export), [jsPDF](https://github.com/parallax/jsPDF) + [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) (vector PDF export), [electron-store](https://github.com/sindresorhus/electron-store), and [Biome](https://biomejs.dev/) for linting/formatting.

Based on [MermaidJS Desktop Client](https://github.com/skydiver/mermaidjs-desktop-client) by Martín M.
