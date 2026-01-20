# GraphvizJS Desktop Client

GraphvizJS is a desktop editor for [Graphviz](https://graphviz.org/) DOT diagrams with real-time preview, syntax highlighting, and SVG/PNG export. Built with Tauri, it pairs a CodeMirror-based authoring experience with a live preview powered by Graphviz WebAssembly, file management helpers, and zoom controls for both editor and preview.

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
- **File workflow** – New, open, and save actions integrate with the native filesystem via Tauri dialog and fs plugins. Status bar tracks unsaved changes and last saved time.
- **Built-in examples** – Quick-start templates for directed graphs, undirected graphs, clusters, and more.
- **Smart exports** – Save diagrams as PNG (1× and 2× scale) or SVG with built-in padding, white backgrounds, and automatic scaling.
- **Keyboard shortcuts** – Standard shortcuts for file operations, editor zoom (Cmd/Ctrl+=/−/0), and help (F1).
- **Editor zoom** – Zoom in/out and reset the code editor font size with keyboard shortcuts.
- **Preview zoom** – Zoom diagrams with Ctrl+Scroll or toolbar controls.
- **Help dialog** – Press F1 to view app info, keyboard shortcuts, and available diagram examples.
- **Resizable workspace** – Drag the divider to resize editor/preview panes or double-click to reset.
- **Window persistence** – Window position, size, and maximized state persist between launches via Tauri store plugin.

## Prerequisites

Make sure the common Tauri requirements are installed:

- [Node.js](https://nodejs.org/) 18 or newer
- [pnpm](https://pnpm.io/) (preferred package manager for this repo)
- [Rust toolchain](https://www.rust-lang.org/learn/get-started) with `cargo`
- Platform-specific dependencies listed in the [Tauri docs](https://tauri.app/v1/guides/getting-started/prerequisites/) (e.g., Xcode Command Line Tools on macOS)

## Getting Started

```bash
# Install dependencies
pnpm install

# Run the desktop app with live reload
pnpm tauri dev
```

The command above launches both the Vite dev server and the Tauri shell. For faster iteration on UI/preview features without native APIs, you can run the frontend standalone:

```bash
pnpm dev
```

and open the reported URL (typically `http://localhost:5173`) in your browser.

## Building

```bash
# Type-check and bundle the frontend
pnpm build

# Produce a platform-specific production bundle
# Creates .app on macOS, .exe installer on Windows, or .deb/.AppImage on Linux
pnpm tauri build
```

## Tooling

- `pnpm clean` – Remove build artifacts (`dist/`, `src-tauri/target/`)
- `pnpm lint` – Run [Biome](https://biomejs.dev/) linter and formatter checks
- `pnpm lint:fix` – Automatically apply Biome fixes
- `pnpm typecheck` – Type-check TypeScript without emitting files

## Testing

The project uses [Vitest](https://vitest.dev/) for unit testing with [happy-dom](https://github.com/nicholasribeiro/happy-dom) for DOM simulation.

```bash
# Run unit tests
pnpm test

# Run unit tests in watch mode
pnpm test:watch

# Run unit tests with coverage report
pnpm test:coverage

# Run E2E tests (requires dev server)
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
- `test/mocks/` – Shared mocks for Tauri APIs and Graphviz WASM
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
- `src-tauri/` – Tauri backend (Rust) with plugins for dialog, filesystem, store, and shell
- `public/` – Static assets served by Vite (if added)

## Acknowledgements

Built with [Tauri 2](https://tauri.app/) (v2.9+), [Vite 7](https://vitejs.dev/), [CodeMirror 6](https://codemirror.net/6/), [@hpcc-js/wasm](https://github.com/hpcc-systems/hpcc-js-wasm) (Graphviz WebAssembly), and [Biome](https://biomejs.dev/) for linting/formatting.

Based on [MermaidJS Desktop Client](https://github.com/skydiver/mermaidjs-desktop-client) by Martín M.
