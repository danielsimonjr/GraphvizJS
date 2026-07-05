# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

GraphvizJS is an Electron desktop app for editing Graphviz DOT diagrams with live preview. The frontend is TypeScript/Vite with CodeMirror 6 for editing. All Graphviz work — DOT→SVG render, validation, and SVG/PNG/PDF export — runs headlessly in a Node-only `core/` in the **main process**; the renderer holds zero Graphviz and drives preview, linting, and export over IPC. A `graphvizjs` CLI (`cli/`) consumes the same core. Rendering uses `@hpcc-js/wasm` (WebAssembly), PNG export `@resvg/resvg-js`, and vector PDF export jsPDF + svg2pdf.js in a jsdom + node-canvas environment. Based on [MermaidJS Desktop Client](https://github.com/skydiver/mermaidjs-desktop-client).

## Commands

```bash
pnpm install                # Install dependencies
pnpm dev                    # Frontend-only dev server (http://localhost:5173)
pnpm build                  # TypeScript compile + Vite bundle
pnpm build:cli              # Compile the headless graphvizjs CLI to dist-cli/
pnpm package                # Build distributable installer (electron-builder)
pnpm graphvizjs -- ...      # Run the CLI from source via tsx (e.g. render g.dot -o o.svg)

pnpm test                   # Unit tests (Vitest + happy-dom)
pnpm test:watch             # Unit tests in watch mode
pnpm test:coverage          # Unit tests with coverage report
pnpm test:e2e               # E2E tests (Playwright, requires dev server)
pnpm test:e2e:headed        # E2E tests with visible browser
pnpm test:e2e:debug         # E2E tests in debug mode

pnpm lint                   # Biome check
pnpm lint:fix               # Biome auto-fix
pnpm typecheck              # tsc --noEmit
pnpm clean                  # Remove dist/
```

Run a single unit test file: `npx vitest run test/preview/render.test.ts`
Run a single E2E test: `npx playwright test test/e2e/rendering.spec.ts`

## Architecture

### Bootstrap Flow (`src/main.ts`)

The app bootstraps on `DOMContentLoaded` via a single `bootstrap()` function that:
1. Loads persisted window state and settings from electron-store
2. Creates zoom controllers (preview + editor)
3. Creates the `TabManager` and initial tab with a CodeMirror editor
4. Silently restores the previously open session (`loadSession` — tabs, unsaved edits, and per-tab layout engine) instead of prompting for crash recovery
5. Wires up the tab bar, toolbar actions, keyboard shortcuts, the layout-engine selector, and session persistence

The main process (not the renderer) initializes Graphviz. State is managed via a `TabManager` instance in `bootstrap()`. Each tab holds its own `TabState` (id, file path, dirty flag, last-committed and saved-content baselines, editor instance, editor zoom, and layout engine). The `commitDocument()` function delegates to the active tab. Only the active tab's editor is visible (others hidden via `display:none`).

### Module Boundaries

The **`core/`** directory (repo root, Node-only, no DOM) owns all Graphviz work: `render.ts` (DOT→SVG + validation via `@hpcc-js/wasm`), `normalize-svg.ts` (pure-string viewBox/padding rewrite — no DOM `getBBox`), `export-png.ts` (`@resvg/resvg-js`), `export-pdf.ts` (headless vector PDF), and the `export.ts` orchestrator (`exportDiagram`). Both the Electron main process and the **`cli/`** binary (`graphvizjs`) consume it. Types live in `core/types.ts`.

Within `src/` (the renderer), each subdirectory exports setup functions that receive DOM elements and callbacks. There is no shared global state or event bus — modules communicate through the callback options passed from `main.ts`, and reach Graphviz only over IPC.

- **platform/** — the renderer↔main IPC boundary: `contract.ts` (the `GraphvizApi` interface exposed on `window.graphviz`) and `index.ts` (thin renderer-side wrappers, incl. `renderSvg`/`validateDot`/`exportRender`)
- **editor/** — CodeMirror extensions: DOT grammar (`language.ts`), theme, font zoom, autocomplete + snippets (`autocomplete.ts`, `dot-data.ts`), find/replace (`search.ts`), formatting (`format.ts`), a literal-aware scanner (`scan-dot.ts`), and linting — `linting.ts` (validates via the `render:validate` IPC) plus local `structure-lint.ts`
- **preview/** — debounced live preview (`render.ts`, renders via the `render:svg` IPC) and preview zoom (`zoom.ts`)
- **toolbar/** — each action is a separate module (`new-diagram.ts`, `open-diagram.ts`, `save-diagram.ts`, `save-as.ts`, `export-diagram.ts` [calls `export:render`], `export-menu.ts`, `examples-menu.ts`, `recent-menu.ts`, `layout-engine.ts`, `find.ts`, `format.ts`, `pdf-options-dialog.ts`, `shortcuts.ts`), orchestrated by `actions.ts`
- **tabs/** — multi-tab management: `manager.ts` (TabManager class, TabState interface), `tab-bar.ts` (tab bar UI + event delegation)
- **session/** — silent session capture/restore/persist across launches (`session.ts`, the `session` store key)
- **recent/** — recent-files list core (`recent-files.ts`)
- **watch/** — external-change detection (`watch-plan.ts` pure core; renderer side reacts to the `file:changed` push and reloads clean tabs / prompts dirty ones)
- **menu/** — native application menu: `menu-template.ts` (pure `buildMenuTemplate`) and `commands.ts` (dispatch for `menu:action`)
- **workspace/** — horizontal resizable pane divider
- **window/** — window position/size persistence via electron-store
- **help/** — help dialog with shortcuts and app info (`dialog.ts`)
- **autosave/** — legacy autosave constants only (`constants.ts`); the old draft-manager/recovery modules were replaced by `session/`
- **utils/** — shared utilities (`debounce.ts`)
- **examples/** — `.dot` files loaded via `import.meta.glob` (Vite eager glob import with `?raw`)

### Rendering Pipeline

Editor changes trigger a debounced render (`RENDER_DELAY` = 300ms). `createPreview()` returns a `schedulePreviewRender(doc)` function that sends the DOT plus the active tab's layout engine over the `render:svg` IPC to the core in the main process, receives the SVG string, and injects it into the preview host element (a stale-token check cancels superseded renders). The engine is read per-tab via a `getEngine` closure over the active tab — there is no global engine getter.

### Electron Integration

The main process hosts the headless `core/` and registers the IPC handlers the renderer calls: `render:svg`, `render:validate`, and `export:render` (DOT in, SVG / diagnostics / export bytes out), alongside file-dialog/filesystem, `electron-store` key-value, external-file-watch, and native-menu channels. All are exposed to the renderer through the preload script (`electron/preload.ts`) as `window.graphviz`, wrapped by `src/platform/`. `menu:action`/`file:changed` are push channels (main→renderer).

### Vite Configuration

The Vite root is `src/` (not project root). HTML entry point is `src/index.html`. `@hpcc-js/wasm` is excluded from renderer dependency optimization (`optimizeDeps.exclude`). The Electron **main** build (via `vite-plugin-electron`) externalizes the native/heavy Node deps the core loads at runtime — `@hpcc-js/wasm`, `@resvg/resvg-js`, `canvas`, `jsdom`, `jspdf`, `svg2pdf.js` — because rollup cannot bundle a native `.node` binary; electron-builder includes them in the installer and `asarUnpack`s the natives.

### CLI Distributable (`dist-cli/`)

`pnpm build:cli` (`tsconfig.cli.json`) `tsc`-compiles `cli/` + `core/` to `dist-cli/` as real Node ESM — **not** bundled (bundling jsdom crashes on `__dirname`; the native `.node` binaries can't be inlined anyway). `bin.graphvizjs` → `dist-cli/cli/index.js` (shebang preserved by `tsc`), and `files: ["dist-cli"]` ships it in `npm pack`. Because the output runs under Node's own ESM loader, relative imports **within `cli/` and `core/` must carry explicit `.js` extensions** (NodeNext resolution) — these resolve identically under tsx, Vitest, and both Vite builds, so they don't affect the app. The natives/WASM/jsdom stay ordinary `dependencies`, resolved from `node_modules` at runtime (prebuilds install cross-platform). `test/cli/dist.integration.test.ts` builds and subprocess-runs the compiled binary as the durable guard.

## Testing

Unit tests use **Vitest** with **happy-dom** for DOM simulation. Test files mirror the source structure under `test/`. Global test setup (`test/setup.ts`) mocks browser APIs not available in happy-dom: `matchMedia`, `ResizeObserver`, `IntersectionObserver`, `requestAnimationFrame`, and `HTMLCanvasElement` context methods.

Shared mocks for Electron APIs and Graphviz WASM live in `test/mocks/`.

E2E tests use **Playwright** and are excluded from the Vitest run (`test/e2e/` directory).

Coverage thresholds: 80% lines/functions/statements, 70% branches. `src/main.ts` is excluded from coverage.

## Code Style

Enforced by **Biome** (not ESLint/Prettier):
- 2-space indent, single quotes, semicolons always, trailing commas (ES5)
- 100 char line width, LF line endings
- `const` over `let`, no `var`, no `any`
- Biome excludes `dist/`, `coverage/`

## Version Synchronization

Version is maintained in `package.json` → `"version"`.

## Adding Features

**New toolbar action**: Create `src/toolbar/your-action.ts` with a setup function, add a button to `src/index.html` with `data-action="your-action"`, import and wire in `src/toolbar/actions.ts`.

**New example diagram**: Add numbered `.dot` file to `src/examples/` (e.g., `08-cluster.dot`), add menu item in `src/index.html` under `[data-menu="examples"]`. Auto-loaded via Vite glob import.

**New export format**: Add to the `ExportFormat` type in `core/types.ts` (and the `export-menu.ts` menu type), add the HTML menu item, handle the format in `core/export.ts` (`exportDiagram`), and wire the menu action in `src/toolbar/export-diagram.ts` (which calls the `export:render` IPC). The renderer never renders/exports directly.
