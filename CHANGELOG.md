# Changelog

All notable changes to GraphvizJS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added - Phase 3: Feature Enhancements

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
- Total: 188 unit tests
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
