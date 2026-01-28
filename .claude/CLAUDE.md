# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

GraphvizJS is a Tauri 2 desktop app for editing Graphviz DOT diagrams with live preview. The frontend is TypeScript/Vite with CodeMirror 6 for editing and `@hpcc-js/wasm` for client-side Graphviz rendering via WebAssembly. Based on [MermaidJS Desktop Client](https://github.com/skydiver/mermaidjs-desktop-client).

## Commands

```bash
pnpm install                # Install dependencies
pnpm dev                    # Frontend-only dev server (http://localhost:5173)
pnpm tauri dev              # Full desktop app with hot reload
pnpm build                  # TypeScript compile + Vite bundle
pnpm tauri build            # Production installer (.exe, .app, .deb)

pnpm test                   # Unit tests (Vitest + happy-dom)
pnpm test:watch             # Unit tests in watch mode
pnpm test:coverage          # Unit tests with coverage report
pnpm test:e2e               # E2E tests (Playwright, requires dev server)

pnpm lint                   # Biome check
pnpm lint:fix               # Biome auto-fix
pnpm typecheck              # tsc --noEmit
pnpm clean                  # Remove dist/ and src-tauri/target/
```

Run a single unit test file: `npx vitest run test/preview/render.test.ts`
Run a single E2E test: `npx playwright test test/e2e/rendering.spec.ts`

## Architecture

### Bootstrap Flow (`src/main.ts`)

The app bootstraps on `DOMContentLoaded` via a single `bootstrap()` function that:
1. Initializes Graphviz WASM (`initGraphviz`)
2. Loads persisted window state and settings from Tauri Store
3. Creates zoom controllers (preview + editor)
4. Creates the TabManager and initial tab with CodeMirror editor
5. Checks for multi-tab autosave recovery and prompts user
6. Wires up tab bar, toolbar actions, keyboard shortcuts, layout engine selector, and autosave

State is managed via a `TabManager` instance in `bootstrap()`. Each tab holds its own `TabState` (filePath, isDirty, lastCommittedDoc, lastSavedAt, editorView, editorZoomLevel). The `commitDocument()` function delegates to the active tab. Only the active tab's editor is visible (others hidden via `display:none`).

### Module Boundaries

Each `src/` subdirectory exports setup functions that receive DOM elements and callbacks. There is no shared global state or event bus — modules communicate through the callback options passed from `main.ts`.

- **editor/** — CodeMirror extensions: DOT language grammar (`language.ts`), theme (`theme.ts`), font zoom (`zoom.ts`)
- **preview/** — Graphviz WASM init (`graphviz.ts`), debounced SVG rendering (`render.ts`), preview zoom (`zoom.ts`)
- **toolbar/** — Each action is a separate module: `new-diagram.ts`, `open-diagram.ts`, `save-diagram.ts`, `export-diagram.ts`, `export-menu.ts`, `examples-menu.ts`, `layout-engine.ts`, `shortcuts.ts`. Orchestrated by `actions.ts`.
- **tabs/** — Multi-tab management: `manager.ts` (TabManager class, TabState interface), `tab-bar.ts` (tab bar UI rendering and event delegation)
- **autosave/** — Periodic draft saving (`manager.ts`) and crash recovery (`recovery.ts`). Supports multi-tab drafts via `tabDrafts` store key. Uses Tauri Store with keys defined in `constants.ts`.
- **workspace/** — Horizontal resizable pane divider
- **window/** — Window position/size persistence via Tauri Store
- **examples/** — `.dot` files loaded via `import.meta.glob` (Vite eager glob import with `?raw` query)

### Rendering Pipeline

Editor changes trigger a debounced render (300ms). `createPreview()` returns a `schedulePreviewRender(doc)` function. The render uses the currently selected layout engine (dot, neato, fdp, etc.) via `getCurrentEngine()`. Output is SVG injected into the preview host element.

### Tauri Integration

Native capabilities are accessed through Tauri plugins — `@tauri-apps/plugin-dialog` for file dialogs, `@tauri-apps/plugin-fs` for read/write, `@tauri-apps/plugin-store` for key-value persistence, `@tauri-apps/plugin-shell` for shell commands. The Rust backend (`src-tauri/src/lib.rs`) only configures plugins and restores window state.

### Vite Configuration

The Vite root is `src/` (not project root). HTML entry point is `src/index.html`. The `@hpcc-js/wasm` package is excluded from dependency optimization (`optimizeDeps.exclude`).

## Testing

Unit tests use **Vitest** with **happy-dom** for DOM simulation. Test files mirror the source structure under `test/`. Global test setup (`test/setup.ts`) mocks browser APIs not available in happy-dom: `matchMedia`, `ResizeObserver`, `IntersectionObserver`, `requestAnimationFrame`, and `HTMLCanvasElement` context methods.

Shared mocks for Tauri APIs and Graphviz WASM live in `test/mocks/`.

E2E tests use **Playwright** and are excluded from the Vitest run (`test/e2e/` directory).

Coverage thresholds: 80% lines/functions/statements, 70% branches. `src/main.ts` is excluded from coverage.

## Code Style

Enforced by **Biome** (not ESLint/Prettier):
- 2-space indent, single quotes, semicolons always, trailing commas (ES5)
- 100 char line width, LF line endings
- `const` over `let`, no `var`, no `any`
- Biome excludes `src-tauri/`, `dist/`, `coverage/`

## Version Synchronization

Version must be updated in **two** locations:
- `package.json` → `"version"`
- `src-tauri/tauri.conf.json` → `"version"`

## Adding Features

**New toolbar action**: Create `src/toolbar/your-action.ts` with a setup function, add a button to `src/index.html` with `data-action="your-action"`, import and wire in `src/toolbar/actions.ts`.

**New example diagram**: Add numbered `.dot` file to `src/examples/` (e.g., `08-cluster.dot`), add menu item in `src/index.html` under `[data-menu="examples"]`. Auto-loaded via Vite glob import.

**New export format**: Add to `ExportFormat` type in `src/toolbar/export-menu.ts`, add HTML menu item, handle in `src/toolbar/export-diagram.ts`.
