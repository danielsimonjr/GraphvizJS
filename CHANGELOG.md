# Changelog

All notable changes to GraphvizJS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [2.5.0] - 2026-07-05

### Added

- **Preferences dialog.** Opened with **Cmd/Ctrl+,** (Edit ▸ Preferences… on Windows/Linux, the
  app menu on macOS) or the command palette. Its Appearance section hosts the theme selector
  (System/Light/Dark), wired to the live theme so a change applies and persists immediately. Built
  to grow additional settings.

## [2.4.0] - 2026-07-05

### Added

- **Application icon.** Replaced the default Electron icon with an on-brand directed-graph mark
  (`build/icon.svg` → `build/icon.png` via `pnpm build:icon`, using the bundled resvg renderer).
  electron-builder embeds it in the Windows installer and executable; the window uses it in dev.

## [2.3.0] - 2026-07-05

### Added

- **Command palette (Ctrl/Cmd+Shift+P).** Fuzzy-search and run any command — new/open/save,
  export (SVG/PNG/PNG 2×/PDF), undo/redo, find, format, zoom, every layout engine, theme, and
  help — with ↑/↓ to move, Enter to run, Esc to dismiss. Also reachable from **View ▸ Command
  Palette…**. The command list is built from the same handlers the menus use.

## [2.2.0] - 2026-07-05

### Added

- **Theme toggle (System / Light / Dark).** The dark theme is now selectable from **View ▸ Theme**
  (a radio submenu reflecting the current choice) and a toolbar button that cycles the three modes.
  **System** follows the OS and updates live; the choice persists across launches (store key
  `colorScheme`) and is applied at startup before the editor loads to avoid a flash. Because the
  theme is CSS-variable-driven, one toggle re-themes the whole app including the CodeMirror editor.
- **Architecture enforcement in the dependency-graph tool.** `pnpm graph:check` verifies the
  headless-core layer policy (`core/` is a leaf, `cli/` → `core/` only, `electron/` → `core/` plus
  only the shared pure renderer modules `menu`/`watch`/`platform`, and the renderer may import
  `core/` only as type-only `core/types`) plus no runtime cycles, a fully-wired IPC surface, and a
  **non-stale committed report** (it re-renders in memory and fails if `docs/architecture/` drifted
  from source) — exiting non-zero on any violation. Now a CI gate. `pnpm graph -- --impact <file>`
  prints a file's transitive reverse-dependencies (blast radius). The written report gained an
  "Architecture rules" section. Dev-tooling only; no app behavior change.

### Fixed

- **Dependency-graph tool now parses dynamic `import()`.** The scanner only read static
  `import … from`, so files imported via `await import('…')` (the pattern in several test suites)
  were invisible — causing false "uncovered" rows for `src/help/dialog.ts`, `src/preview/render.ts`,
  and `src/toolbar/actions.ts`, and a false "unused export" for `isGraphvizReady`. Dynamic imports
  (destructured or bare) are now recorded, so coverage, edges, and unused-export detection are
  accurate. Dev-tooling only.

### Changed

- **Dependency-graph tool (`pnpm graph`)** now treats `.js`/`.jsx`/`.mjs`/`.cjs` files as
  first-class source (not just `.ts`) and resolves a `.js` import specifier to either its `.ts`
  sibling (TS-ESM) or a real same-name `.js` file. It also reports **dormant files** — files that
  have importers but are unreachable from any entry-like or test root (dead import clusters the
  zero-importer "unused files" check cannot see). Dev-tooling only; no app behavior change.

## [2.1.0] - 2026-07-05

### Added

- **Distributable `graphvizjs` CLI.** `pnpm build:cli` compiles the headless `cli/` + `core/`
  to `dist-cli/` as a real Node-ESM binary with a `#!/usr/bin/env node` shebang; `bin.graphvizjs`
  now points at the compiled `dist-cli/cli/index.js` (previously raw TypeScript, runnable only via
  tsx) and `files: ["dist-cli"]` ships it in the package. The command is installable via `npm link`
  or the packed tarball on Windows/macOS/Linux. The rendering deps (`@resvg/resvg-js`, `canvas`,
  `@hpcc-js/wasm`, `jsdom`) stay as normal dependencies resolved at runtime — not bundled — which
  is what makes vector PDF export work in the compiled binary.

### Fixed

- **CLI `-` (stdin) input now works.** Reading DOT from stdin was advertised in the usage text and
  implemented in `readInput`, but the argument parser rejected a bare `-` as an unknown flag, making
  the feature unreachable. The parser now treats `-` as the input marker.
- **`graphvizjs --version` is layout-independent.** It reads the version from the nearest ancestor
  `package.json` instead of a fixed relative path, so it is correct whether run from source (tsx) or
  the compiled binary, where the depth to `package.json` differs.
- **Dependency-graph tool resolves TS-ESM `.js` import specifiers.** The compiled-CLI work added
  explicit `.js` extensions to relative imports in `cli/` and `core/`; the `pnpm graph` resolver now
  maps a `.js` specifier to its `.ts` source, restoring the `cli → core` edge in the report.

## [2.0.1] - 2026-07-05

### Security

- Tightened the renderer Content-Security-Policy `script-src` to `'self'`, removing
  `'unsafe-eval'` and `'wasm-unsafe-eval'`. Those were only required by the in-renderer
  Graphviz/PDF libraries that moved to the headless core in v2.0.0; the renderer bundle now
  contains no `new Function`, `eval`, or `WebAssembly`.

### Changed

- The main process now logs a Graphviz pre-initialization failure instead of raising an
  unhandled promise rejection (the engine still re-initializes on the first render/export call).

## [2.0.0] - 2026-07-04

### Changed

- **Re-architected around a headless core.** All diagram rendering and SVG / PNG /
  PDF export now run in a Node-only `core/` used by the Electron main process.
  The renderer contains zero Graphviz — it drives the live preview, linting, and
  export over IPC. Behavior is unchanged for GUI users, and the renderer bundle
  no longer ships the Graphviz WebAssembly module.

### Added

- **`graphvizjs` CLI.** `graphvizjs render <input.dot> -o <output>` with
  `--engine`, `--format` (svg/png/pdf), `--scale`, `--pdf-page`, and
  `--pdf-orientation`, plus stdin via `-`. The GUI and CLI share the same
  render/export core.

### Fixed

- Image/PDF export now uses the tab's selected layout engine, matching the live
  preview. Previously export always rendered with the default `dot` engine
  regardless of the chosen engine.

### Added

- Native application menu (File / Edit / View / Help, plus the macOS app menu)
  replacing the default Electron menu. Menu items mirror the toolbar actions —
  New / Open / Save / Save As, Export (PNG/PNG×2/SVG/PDF), Open Recent, Find,
  Format, Undo / Redo, a Layout Engine submenu, editor Zoom, Help, and About /
  View Source. Existing keyboard shortcuts are unchanged: duplicated
  accelerators are shown as labels only, so nothing double-fires.

## [1.3.0] - 2026-07-03

### Added

- Recent files: a toolbar **Recent** menu lists recently opened and saved
  diagrams (most-recent-first, up to 10); pick one to reopen it, or focus it if
  it's already open. Files that have since been deleted are pruned on use.
- **Save As** (Ctrl+Shift+S): save the current diagram to a newly chosen path,
  even when the tab already has one.
- Silent session restore: on launch the app reopens the tabs you had open —
  file paths, unsaved edits, per-tab layout engine, and the active tab — with no
  prompt. This replaces the old crash-recovery dialog; a pre-1.3.0 draft is
  migrated into the session once on first launch.
- Per-document layout engine: each tab remembers its own dot/neato/fdp/… engine,
  and the selector follows the active tab across switching, closing, and new tabs.
- External-change reload: when a file open in the app is changed on disk by
  another program, a tab with no unsaved edits reloads automatically, while a tab
  with unsaved edits prompts before discarding your changes.

## [1.2.0] - 2026-07-03

### Added

- DOT-aware autocomplete with snippets: keyword, attribute-name, and
  attribute-value (enum/color) completions, plus subgraph/node/edge snippet
  templates (Ctrl+Space or type to trigger).
- Find & replace: a themed search panel (Ctrl+F / Ctrl+H, F3 to cycle) plus a
  toolbar Find button.
- Format document: reindents by brace depth and normalizes spacing without
  touching string/HTML-label/comment content (toolbar Format button or
  Shift+Alt+F). Idempotent and fail-safe on unbalanced input.
- Richer linting: fast local diagnostics for unbalanced delimiters, unknown
  attribute names, and attribute entries missing a value — alongside the
  existing Graphviz engine validation.

## [1.1.0] - 2026-07-02

### Added - PDF Export

- **Export as PDF** joins SVG / PNG / PNG@2x in the export menu. Output is a **vector** PDF converted from the rendered diagram SVG via `svg2pdf.js` + `jsPDF` (the `@hpcc-js/wasm` Graphviz build cannot emit PDF directly).
- **Export-time options dialog**: choose **Fit page to diagram** (default — the page equals the diagram bounds) or **Standard page** (Letter/A4 with Auto/Portrait/Landscape orientation, diagram scaled-to-fit and centered on a white background).

## [1.0.0] - 2026-07-02

### Changed - Desktop Shell: Tauri → Electron Migration

- **Electron replaces Tauri** as the desktop shell. The app now runs as a standard Node/Chromium Electron application with no Rust toolchain dependency.
- **`src-tauri/` removed** — all Rust source, Cargo files, Tauri configuration, and `@tauri-apps/*` npm packages are gone.
- **New `electron/` directory** — `main.ts` (BrowserWindow, IPC handlers, native dialog + fs calls), `preload.ts` (context-bridge exposing `window.graphvizApi`).
- **New `src/platform/` abstraction** — `PlatformStore` interface + `ElectronStore` implementation using `electron-store`; renderer code calls `window.graphvizApi` and never imports Node APIs directly.
- **Persistence** uses `electron-store` (JSON file in the OS user-data directory). **Prior Tauri-store user data (window bounds, autosave drafts, settings) does not carry over automatically** — the app starts with default settings on first launch after migration.
- **`electron-builder.yml`** added for **Windows-only** packaging (NSIS `.exe`). Output goes to `release/`. CI runs on `windows-latest` (native Electron e2e).
- **`electron` moved to `devDependencies`** — electron-builder bundles the runtime into the installer; keeping it in `dependencies` would double the installed size.
- **CI workflow updated** — Rust/Cargo steps removed; workflow now runs `pnpm install → pnpm lint → pnpm typecheck → pnpm test:coverage → pnpm build → E2E (xvfb-run)`.
- E2E tests (51 passing) run against the `file://` production build inside a real Electron window, validating WASM loading under `file://` protocol.
- Dependabot `glib`/`rand` alerts (sourced from Tauri's Rust dependencies) are expected to close automatically after this branch merges and Dependabot rescans.

### Added - Phase 3: Feature Enhancements

#### DOT Syntax Validation/Linting (Sprint 4) - 48 tests
- Real-time DOT syntax validation with inline error markers in the editor
- validateDot() function in graphviz.ts for error-only validation without rendering
- Error message parsing with regex patterns to extract line/column numbers from Graphviz errors
- CodeMirror lint integration via createDotLinter() in src/editor/linting.ts
- Red squiggly underlines under syntax errors with precise position mapping
- Lint gutter with error markers (red dots) for quick error identification
- Hover tooltips showing detailed error messages
- Validation uses the currently selected layout engine (same as preview)
- Independent 500ms debounce for validation (separate from 300ms render debounce)
- Each tab validates independently with its own linter instance
- CSS styling for lint UI: gutter icons, squiggles, and tooltip panels
- Unit tests for validateDot (30 tests) covering error parsing and edge cases
- Unit tests for createDotLinter (18 tests) covering CodeMirror integration

#### Multiple Tabs / Documents (Sprint 3) - 48 tests
- Tabbed interface supporting up to 10 simultaneous open documents
- TabManager class: pure state container managing tab lifecycle (create, close, switch, navigate)
- Tab bar UI with filename display, dirty indicator, close button, and new tab button
- Each tab has independent state: content, file path, dirty flag, save timestamp, editor instance
- Each tab gets its own CodeMirror EditorView (hidden via display:none when inactive) to preserve undo history
- Keyboard shortcuts: Ctrl+T (new tab), Ctrl+W (close tab), Ctrl+Tab/Ctrl+Shift+Tab (cycle tabs)
- Multi-tab autosave: all tab drafts saved as serialized object under 'tabDrafts' store key
- Multi-tab recovery: restores all tabs from previous session with legacy format fallback
- Opening files and examples always create new tabs (removed shouldReplace pattern)
- Toolbar actions (save, export) operate on active tab via getEditor() accessor
- Tab bar styled with dark/light theme support, horizontal scroll overflow
- Unit tests for TabManager (33 tests) and tab-bar component (15 tests)
- Updated existing toolbar tests for new multi-tab API signatures

#### Auto-Save / Recovery (Sprint 2) - 21 tests
- Periodic autosave of editor drafts every 30 seconds (only when content changed)
- Startup recovery check with user prompt to restore or discard unsaved work
- Stale draft cleanup (drafts older than 7 days auto-removed)
- Draft cleared on manual save to prevent false recovery prompts
- Status bar shows brief "Draft saved" indicator after autosave
- Unit tests for autosave manager (10 tests) and recovery module (11 tests)

#### Layout Engine Selector (Sprint 1) - 8 tests
- Toolbar dropdown to switch between all 8 Graphviz layout engines
- layout-engine.ts: Setup and current engine retrieval functions
- render.ts: Updated to accept and use selected layout engine
- Styled dropdown matching toolbar aesthetic
- Unit tests for layout engine handler (100% coverage)

### Added - Phase 2: Testing Infrastructure

#### Test Infrastructure (Sprint 1)
- Vitest test framework with happy-dom environment
- Coverage reporting with v8 provider (text, HTML, LCOV)
- Comprehensive mocks for Tauri APIs (dialog, fs, store, window)
- Mock for @hpcc-js/wasm Graphviz with configurable responses
- Test scripts: `pnpm test`, `pnpm test:watch`, `pnpm test:coverage`

#### Core Rendering Tests (Sprint 2) - 41 tests
- graphviz.test.ts: Initialization, singleton pattern, rendering, error handling (100% coverage)
- render.test.ts: Scheduler, callbacks, debounce, error display (95% coverage)
- language.test.ts: DOT syntax, keywords, operators, comments, strings (87% coverage)

#### Utility and Zoom Tests (Sprint 3) - 27 tests
- debounce.test.ts: Timing behavior with fake timers (100% coverage)
- editor/zoom.test.ts: Zoom controller, bounds, keymap (85% coverage)
- preview/zoom.test.ts: Zoom controls, wheel zoom, display formatting (76% coverage)

#### Toolbar Tests (Sprint 4) - 88 tests
- new-diagram.test.ts: Click handler, content replacement, callbacks (100% coverage)
- open-diagram.test.ts: File dialog, content loading, path handling (78% coverage)
- save-diagram.test.ts: Save dialog, file writing, path handling (93% coverage)
- export-diagram.test.ts: SVG export, PNG export, base name inference (59% coverage)
- actions.test.ts: Toolbar setup, confirm dialogs (66% coverage)
- examples-menu.test.ts: Menu rendering, toggle, item selection (96% coverage)
- export-menu.test.ts: Menu toggle, keyboard navigation, format selection (95% coverage)
- shortcuts.test.ts: Event listeners, key combinations (93% coverage)

#### UI Component Tests (Sprint 5) - 35 tests
- dialog.test.ts: Setup, keyboard shortcuts, dialog content, close handlers (86% coverage)
- state.test.ts: Load/save/apply window state, persistence setup (92% coverage)
- resize.test.ts: Drag handlers, constraints, reset (95% coverage)
- theme.test.ts: Extension structure, syntax highlighting (100% coverage)

#### Coverage Summary
- Total: 310 unit tests (196 from Phase 2 + 114 from Phase 3)
- Overall coverage: 85%
- Coverage thresholds enforced: 80% lines/functions/statements, 70% branches

#### E2E Test Infrastructure (Sprint 6)
- Playwright test framework with Chromium
- playwright.config.ts configured for Vite dev server
- E2E helpers with common utilities (waitForAppReady, selectors, etc.)
- Test scripts: `pnpm test:e2e`, `pnpm test:e2e:headed`, `pnpm test:e2e:debug`

#### E2E Feature Tests (Sprints 6-7) - 50 tests
- app.spec.ts: App launch, toolbar buttons (12 tests)
- rendering.spec.ts: DOT rendering, preview zoom, layout engines (6 tests)
- file-operations.spec.ts: New, open, save, dirty state (6 tests)
- export.spec.ts: Export menu, format options, keyboard nav (9 tests)
- examples.spec.ts: Examples menu, selection, loading (7 tests)
- keyboard-shortcuts.spec.ts: File shortcuts, editor zoom, help (10 tests)
- Note: E2E tests timeout on app initialization - need selector/timing adjustments

#### CI/CD (Sprint 8)
- GitHub Actions workflow for unit tests (`.github/workflows/test.yml`)
- Runs linting, type checking, and unit tests with coverage on push/PR
- E2E tests excluded from CI (require full app runtime)

### Changed
- Updated README with Testing section and test commands
- Added coverage directory to biome.jsonc excludes
- Expanded ROADMAP with detailed future enhancement plans

## [1.0.0] - 2026-01-20

### Added - Phase 1: MermaidJS to GraphvizJS Conversion
- Converted MermaidJS Desktop Client to GraphvizJS
- Replaced Mermaid.js with @hpcc-js/wasm Graphviz WASM rendering
- Implemented DOT language syntax highlighting for CodeMirror
- Support for all Graphviz layout engines (dot, neato, fdp, sfdp, circo, twopi, osage, patchwork)
- Built-in DOT diagram examples (directed graphs, undirected, clusters, records, etc.)
- SVG and PNG export with automatic scaling
- Editor zoom controls with keyboard shortcuts
- Preview zoom with mouse wheel and toolbar controls
- Help dialog with keyboard shortcuts reference
- Window state persistence across sessions
- Resizable workspace panes
