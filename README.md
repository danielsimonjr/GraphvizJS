# GraphvizJS Desktop Client

GraphvizJS is a desktop editor for [Graphviz](https://graphviz.org/) DOT diagrams with real-time preview, syntax highlighting, and SVG/PNG export. Built with Electron, it pairs a CodeMirror-based authoring experience with a live preview powered by Graphviz WebAssembly, file management helpers, and zoom controls for both editor and preview.

Based on [MermaidJS Desktop Client](https://github.com/skydiver/mermaidjs-desktop-client) by Martín M.

# Table of Contents

1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Getting Started](#getting-started)
4. [Building](#building)
5. [Tooling](#tooling)
6. [Testing](#testing)
7. [Project Structure](#project-structure)
8. [Acknowledgements](#acknowledgements)

## Features

- **Live editing** – Write DOT syntax with syntax highlighting, line wrapping, and tab indentation support.
- **Instant preview** – Debounced rendering keeps the preview in sync while typing, with friendly error feedback when diagrams fail to render.
- **Multiple layout engines** – Support for all Graphviz layout engines (dot, neato, fdp, sfdp, circo, twopi, osage, patchwork).
- **File workflow** – New, open, and save actions integrate with the native filesystem via Electron dialog and fs APIs. Status bar tracks unsaved changes and last saved time.
- **Built-in examples** – Quick-start templates for directed graphs, undirected graphs, clusters, and more.
- **Smart exports** – Save diagrams as PNG (1× and 2× scale) or SVG with built-in padding, white backgrounds, and automatic scaling.
- **Keyboard shortcuts** – Standard shortcuts for file operations, editor zoom (Cmd/Ctrl+=/−/0), and help (F1).
- **Editor zoom** – Zoom in/out and reset the code editor font size with keyboard shortcuts.
- **Preview zoom** – Zoom diagrams with Ctrl+Scroll or toolbar controls.
- **Help dialog** – Press F1 to view app info, keyboard shortcuts, and available diagram examples.
- **Resizable workspace** – Drag the divider to resize editor/preview panes or double-click to reset.
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

The same headless rendering core also ships as a `graphvizjs` CLI for scripting and CI — no desktop app or browser required.

```bash
# Compile the CLI to dist-cli/ (also runs automatically on `npm pack`)
pnpm build:cli

# Render DOT to SVG / PNG / PDF
graphvizjs render diagram.dot -o diagram.svg
graphvizjs render diagram.dot -o diagram.png --format png --scale 2
graphvizjs render diagram.dot -o diagram.pdf --engine neato --pdf-page a4

# Read DOT from stdin
cat diagram.dot | graphvizjs render - -o out.svg

graphvizjs --help
graphvizjs --version
```

`bin.graphvizjs` points at the compiled `dist-cli/cli/index.js`, so `npm link` (or a global install of the packed tarball) exposes the `graphvizjs` command on any platform. To run it from source without building, use `pnpm graphvizjs -- render diagram.dot -o out.svg` (via tsx). The native rendering deps (`@resvg/resvg-js`, `canvas`) and WASM Graphviz install as normal dependencies with cross-platform prebuilds.

## Tooling

- `pnpm clean` – Remove build artifacts (`dist/`)
- `pnpm lint` – Run [Biome](https://biomejs.dev/) linter and formatter checks
- `pnpm lint:fix` – Automatically apply Biome fixes
- `pnpm typecheck` – Type-check TypeScript without emitting files

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

Tests are organized to mirror the source structure:
- `test/editor/` – Editor component tests (language, theme, zoom)
- `test/preview/` – Preview rendering tests (graphviz, render, zoom)
- `test/toolbar/` – Toolbar action tests (file operations, export, menus)
- `test/workspace/` – Workspace resize tests
- `test/window/` – Window state persistence tests
- `test/help/` – Help dialog tests
- `test/utils/` – Utility function tests (debounce)
- `test/mocks/` – Shared mocks for Electron APIs and Graphviz WASM
- `test/e2e/` – End-to-end tests with Playwright (app, rendering, file ops, export, examples, shortcuts)

## Project Structure

- `src/` – Frontend source (TypeScript/Vite)
  - `editor/` – CodeMirror configuration (language support, theme, zoom)
  - `preview/` – Graphviz WASM rendering logic and zoom controls
  - `toolbar/` – File operations, export handlers, examples menu
  - `workspace/` – Resizable pane management
  - `window/` – Persistence layer for window state
  - `help/` – Help dialog with shortcuts and app info
  - `examples/` – Built-in DOT diagram templates
  - `platform/` – Platform abstraction interface bridging renderer and Electron main process
- `electron/` – Electron main process (`main.ts`), preload script (`preload.ts`), and IPC handlers

## Acknowledgements

Built with [Electron](https://www.electronjs.org/), [Vite 7](https://vitejs.dev/), [CodeMirror 6](https://codemirror.net/6/), [@hpcc-js/wasm](https://github.com/hpcc-systems/hpcc-js-wasm) (Graphviz WebAssembly), [electron-store](https://github.com/sindresorhus/electron-store), and [Biome](https://biomejs.dev/) for linting/formatting.

Based on [MermaidJS Desktop Client](https://github.com/skydiver/mermaidjs-desktop-client) by Martín M.
