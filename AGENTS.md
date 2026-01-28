# AGENTS.md - GraphvizJS Desktop Client

This file provides guidance to AI coding agents working in this repository. For Claude Code specifically, see `.claude/CLAUDE.md` which contains additional detail.

## Quick Reference

```bash
pnpm install                # Install dependencies
pnpm dev                    # Frontend dev server (localhost:5173)
pnpm tauri dev              # Full desktop app with hot reload
pnpm build                  # TypeScript compile + Vite bundle
pnpm tauri build            # Production installer

pnpm test                   # Unit tests (Vitest + happy-dom)
pnpm test:watch             # Watch mode
pnpm test:coverage          # With coverage report
pnpm test:e2e               # Playwright E2E (requires dev server running)

pnpm lint                   # Biome linter/formatter check
pnpm lint:fix               # Auto-fix
pnpm typecheck              # tsc --noEmit
```

Single test file: `npx vitest run test/toolbar/actions.test.ts`
Single E2E test: `npx playwright test test/e2e/rendering.spec.ts`

## Project Overview

Tauri 2 desktop app for editing Graphviz DOT diagrams with live preview. TypeScript/Vite frontend with CodeMirror 6 editor and `@hpcc-js/wasm` for client-side Graphviz WebAssembly rendering. Rust backend is thin — only plugin setup and window restore.

## Architecture

### State Management

All app state lives as closure variables inside `bootstrap()` in `src/main.ts`: `currentFilePath`, `isDocumentDirty`, `lastCommittedDoc`, `lastSavedAt`. There is no global store or event bus. The `commitDocument()` function is the single transition point for marking content as clean.

### Module Pattern

Each `src/` subdirectory exports setup functions that receive DOM elements and callbacks as options objects. Modules never import each other laterally — all wiring happens in `main.ts`.

- **editor/** — CodeMirror extensions (DOT language, theme, font zoom)
- **preview/** — Graphviz WASM init, debounced SVG rendering (300ms), preview zoom
- **toolbar/** — One module per action (`new-diagram.ts`, `open-diagram.ts`, `save-diagram.ts`, `export-diagram.ts`, `export-menu.ts`, `examples-menu.ts`, `layout-engine.ts`, `shortcuts.ts`), orchestrated by `actions.ts`
- **autosave/** — Periodic draft saving (`manager.ts`) and crash recovery (`recovery.ts`) via Tauri Store
- **workspace/** — Resizable pane divider
- **window/** — Window state persistence via Tauri Store
- **examples/** — `.dot` template files, loaded via Vite `import.meta.glob` with `?raw` query

### Rendering Pipeline

Editor doc changes → 300ms debounce → `schedulePreviewRender(doc)` → Graphviz WASM renders with selected layout engine (`getCurrentEngine()`) → SVG injected into preview host → zoom reapplied.

### Tauri Plugins

`@tauri-apps/plugin-dialog` (file dialogs), `@tauri-apps/plugin-fs` (read/write), `@tauri-apps/plugin-store` (key-value persistence), `@tauri-apps/plugin-shell` (shell commands).

### Vite

Root is `src/` (not project root). Entry point is `src/index.html`. `@hpcc-js/wasm` is excluded from `optimizeDeps`.

## Code Style (Biome)

- 2-space indent, single quotes, semicolons always, trailing commas (ES5)
- 100 char line width, LF line endings
- `const` over `let`, no `var`, no explicit `any`
- Kebab-case file names (`open-diagram.ts`, `examples-menu.ts`)
- DOM queries use `data-` attributes: `[data-action="new-diagram"]`, `[data-menu="examples"]`

## Testing

- **Unit**: Vitest + happy-dom. Tests mirror source under `test/`. Shared mocks in `test/mocks/`. Global setup in `test/setup.ts` mocks `matchMedia`, `ResizeObserver`, `IntersectionObserver`, `requestAnimationFrame`, canvas context.
- **E2E**: Playwright in `test/e2e/`. Excluded from Vitest runs.
- **Coverage**: 80% lines/functions/statements, 70% branches. `src/main.ts` excluded.

## Git

- Main branch: `master`
- Run `pnpm lint:fix` before committing

## Version Sync

Update version in **both** `package.json` and `src-tauri/tauri.conf.json`.

## Adding Features

**Toolbar action**: Create `src/toolbar/your-action.ts` → add button in `src/index.html` with `data-action` → wire in `src/toolbar/actions.ts`.

**Example diagram**: Add numbered `.dot` to `src/examples/` → add menu item in `src/index.html` under `[data-menu="examples"]`.

**Export format**: Add to `ExportFormat` type in `export-menu.ts` → add HTML menu item → handle in `export-diagram.ts`.
