# Phase 2: Testing Implementation Plan

## Overview

**Objective:** Achieve 90% test coverage for GraphvizJS Desktop using Vitest for unit/integration tests and Playwright for E2E tests.

**Test Structure:** Mirror `src/` directory structure in `test/` folder using `.test.ts` naming convention.

## Test Framework Stack

| Tool | Purpose | Version |
|------|---------|---------|
| Vitest | Unit & integration testing | ^2.x |
| @vitest/coverage-v8 | Code coverage reporting | ^2.x |
| happy-dom | DOM simulation for unit tests | ^15.x |
| Playwright | E2E testing for Tauri app | ^1.x |
| @playwright/test | Playwright test runner | ^1.x |

## Directory Structure

```
test/
├── setup.ts                    # Global test setup
├── mocks/
│   ├── graphviz.ts            # Mock @hpcc-js/wasm
│   ├── tauri.ts               # Mock Tauri APIs
│   └── codemirror.ts          # Mock CodeMirror
├── editor/
│   ├── language.test.ts       # DOT syntax highlighting
│   ├── theme.test.ts          # Editor theme
│   └── zoom.test.ts           # Editor zoom controls
├── preview/
│   ├── graphviz.test.ts       # Graphviz WASM wrapper
│   ├── render.test.ts         # Preview rendering
│   └── zoom.test.ts           # Preview zoom
├── toolbar/
│   ├── actions.test.ts        # Toolbar actions
│   ├── examples-menu.test.ts  # Examples menu
│   ├── export-diagram.test.ts # Export functionality
│   ├── export-menu.test.ts    # Export menu UI
│   ├── new-diagram.test.ts    # New diagram action
│   ├── open-diagram.test.ts   # Open diagram action
│   ├── save-diagram.test.ts   # Save diagram action
│   └── shortcuts.test.ts      # Keyboard shortcuts
├── utils/
│   └── debounce.test.ts       # Debounce utility
├── window/
│   └── state.test.ts          # Window state persistence
├── workspace/
│   └── resize.test.ts         # Workspace resize
├── help/
│   └── dialog.test.ts         # Help dialog
└── e2e/
    ├── app.spec.ts            # Full app E2E tests
    ├── rendering.spec.ts      # Diagram rendering E2E
    ├── file-operations.spec.ts # File open/save E2E
    └── export.spec.ts         # Export functionality E2E
```

## Source Files & Test Coverage Plan

### Priority 1: Core Rendering (Critical Path)

| Source File | Test File | Test Cases | Priority |
|-------------|-----------|------------|----------|
| `src/preview/graphviz.ts` | `test/preview/graphviz.test.ts` | 12 | HIGH |
| `src/preview/render.ts` | `test/preview/render.test.ts` | 10 | HIGH |
| `src/editor/language.ts` | `test/editor/language.test.ts` | 15 | HIGH |

#### graphviz.test.ts (12 tests)
- `initGraphviz()` - successful initialization
- `initGraphviz()` - singleton pattern (only loads once)
- `renderDotToSvg()` - renders simple digraph
- `renderDotToSvg()` - renders undirected graph
- `renderDotToSvg()` - handles empty input
- `renderDotToSvg()` - handles invalid DOT syntax (throws)
- `renderDotToSvg()` - uses default 'dot' engine
- `renderDotToSvg()` - respects custom layout engine
- `renderDotToSvg()` - auto-initializes if not ready
- `isGraphvizReady()` - returns false before init
- `isGraphvizReady()` - returns true after init
- `LayoutEngine` type - all 8 engines valid

#### render.test.ts (10 tests)
- `createPreview()` - returns scheduler function
- Scheduler - calls onRenderStart callback
- Scheduler - calls onRenderSuccess on valid DOT
- Scheduler - calls onRenderError on invalid DOT
- Scheduler - calls onRenderEmpty on empty input
- Scheduler - debounces rapid calls
- Scheduler - cancels stale renders (token check)
- `showPreviewMessage()` - displays message correctly
- `showPreviewError()` - displays error with details
- Preview element - updates classList correctly

#### language.test.ts (15 tests)
- `createDotLanguage()` - returns Extension
- Token - recognizes 'digraph' as keyword
- Token - recognizes 'graph' as keyword
- Token - recognizes 'subgraph' as keyword
- Token - recognizes 'node' as keyword
- Token - recognizes 'edge' as keyword
- Token - recognizes 'strict' as keyword
- Token - recognizes '->' as operator
- Token - recognizes '--' as operator
- Token - recognizes '//' comments
- Token - recognizes '/* */' comments
- Token - recognizes double-quoted strings
- Token - recognizes HTML labels '<...>'
- Token - recognizes attributes (label, color, shape)
- Token - recognizes numbers

### Priority 2: Utilities & Infrastructure

| Source File | Test File | Test Cases | Priority |
|-------------|-----------|------------|----------|
| `src/utils/debounce.ts` | `test/utils/debounce.test.ts` | 6 | HIGH |
| `src/editor/zoom.ts` | `test/editor/zoom.test.ts` | 8 | MEDIUM |
| `src/preview/zoom.ts` | `test/preview/zoom.test.ts` | 8 | MEDIUM |

#### debounce.test.ts (6 tests)
- `debounce()` - delays function execution
- `debounce()` - only executes once for rapid calls
- `debounce()` - executes with correct arguments
- `debounce()` - resets timer on new calls
- `debounce()` - handles zero delay
- `debounce()` - preserves 'this' context

#### editor/zoom.test.ts (8 tests)
- `createEditorZoomExtension()` - returns Compartment
- `createEditorZoomController()` - returns controller object
- Controller - `zoomIn()` increases level
- Controller - `zoomOut()` decreases level
- Controller - `reset()` returns to default
- Controller - respects min/max bounds
- Controller - `getLevel()` returns current level
- `createEditorZoomKeymap()` - returns keymap array

#### preview/zoom.test.ts (8 tests)
- `createZoomController()` - returns controller object
- Controller - `zoomIn()` increases level
- Controller - `zoomOut()` decreases level
- Controller - `reset()` returns to default
- Controller - respects min/max bounds
- `setupZoomControls()` - wires up buttons
- `setupWheelZoom()` - handles Ctrl+wheel
- `updateLevelDisplay()` - formats percentage

### Priority 3: Toolbar Actions

| Source File | Test File | Test Cases | Priority |
|-------------|-----------|------------|----------|
| `src/toolbar/new-diagram.ts` | `test/toolbar/new-diagram.test.ts` | 5 | MEDIUM |
| `src/toolbar/open-diagram.ts` | `test/toolbar/open-diagram.test.ts` | 6 | MEDIUM |
| `src/toolbar/save-diagram.ts` | `test/toolbar/save-diagram.test.ts` | 6 | MEDIUM |
| `src/toolbar/export-diagram.ts` | `test/toolbar/export-diagram.test.ts` | 8 | MEDIUM |
| `src/toolbar/actions.ts` | `test/toolbar/actions.test.ts` | 5 | MEDIUM |
| `src/toolbar/examples-menu.ts` | `test/toolbar/examples-menu.test.ts` | 4 | LOW |
| `src/toolbar/export-menu.ts` | `test/toolbar/export-menu.test.ts` | 4 | LOW |
| `src/toolbar/shortcuts.ts` | `test/toolbar/shortcuts.test.ts` | 4 | LOW |

### Priority 4: UI Components

| Source File | Test File | Test Cases | Priority |
|-------------|-----------|------------|----------|
| `src/help/dialog.ts` | `test/help/dialog.test.ts` | 5 | LOW |
| `src/window/state.ts` | `test/window/state.test.ts` | 6 | LOW |
| `src/workspace/resize.ts` | `test/workspace/resize.test.ts` | 5 | LOW |
| `src/editor/theme.ts` | `test/editor/theme.test.ts` | 3 | LOW |

### Priority 5: E2E Tests (Playwright)

| Test File | Test Cases | Priority |
|-----------|------------|----------|
| `test/e2e/app.spec.ts` | 5 | HIGH |
| `test/e2e/rendering.spec.ts` | 8 | HIGH |
| `test/e2e/file-operations.spec.ts` | 6 | MEDIUM |
| `test/e2e/export.spec.ts` | 4 | MEDIUM |

#### app.spec.ts (5 tests)
- App launches successfully
- Default DOT snippet appears in editor
- Preview pane shows rendered diagram
- Window title shows app name
- Help dialog opens with F1

#### rendering.spec.ts (8 tests)
- Renders simple digraph
- Renders undirected graph
- Renders graph with styles
- Renders subgraphs/clusters
- Shows error for invalid syntax
- Shows message for empty input
- Debounces rapid typing
- Preserves diagram on syntax error

#### file-operations.spec.ts (6 tests)
- New diagram resets editor
- Open dialog filters .dot/.gv files
- Opened file content appears in editor
- Save dialog defaults to .dot
- Saved file contains editor content
- Unsaved changes prompt appears

#### export.spec.ts (4 tests)
- Export PNG creates valid image
- Export PNG @2x creates 2x resolution
- Export SVG creates valid SVG
- Export filenames use diagram base name

## Test Configuration

### vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    exclude: ['test/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/vite-env.d.ts', 'src/main.ts'],
      thresholds: {
        global: {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
```

### playwright.config.ts
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30000,
  use: {
    headless: true,
  },
  projects: [
    {
      name: 'tauri',
      use: {
        // Tauri-specific configuration
      },
    },
  ],
});
```

## Sprint Breakdown

| Sprint | Title | Tasks | Est. Hours |
|--------|-------|-------|------------|
| 2.1 | Test Infrastructure Setup | Install deps, config, mocks | 0.5 |
| 2.2 | Core Rendering Tests | graphviz, render, language | 1.5 |
| 2.3 | Utility & Zoom Tests | debounce, editor zoom, preview zoom | 1.0 |
| 2.4 | Toolbar Tests | new, open, save, export, actions | 1.5 |
| 2.5 | UI Component Tests | help, window, workspace, theme | 1.0 |
| 2.6 | E2E Setup & App Tests | Playwright setup, basic E2E | 1.0 |
| 2.7 | E2E Feature Tests | rendering, file-ops, export E2E | 1.5 |
| 2.8 | Coverage & Polish | Reach 90%, fix gaps, CI setup | 1.0 |

**Total Estimated Hours:** 9.0 hours

## Success Criteria

- [ ] All 18 source files have corresponding test files
- [ ] 90% statement coverage achieved
- [ ] 85% branch coverage achieved
- [ ] All unit tests pass
- [ ] All E2E tests pass
- [ ] Coverage report generated (HTML + LCOV)
- [ ] Test scripts added to package.json
- [ ] CI-ready test configuration

## Mocking Strategy

### @hpcc-js/wasm Mock
```typescript
// test/mocks/graphviz.ts
export const mockGraphviz = {
  load: vi.fn().mockResolvedValue({
    layout: vi.fn().mockImplementation((dot, format, engine) => {
      if (!dot.trim()) throw new Error('Empty input');
      if (!dot.includes('graph') && !dot.includes('digraph')) {
        throw new Error('Invalid DOT syntax');
      }
      return '<svg>...</svg>';
    }),
  }),
};
```

### Tauri API Mock
```typescript
// test/mocks/tauri.ts
export const mockTauriDialog = {
  open: vi.fn().mockResolvedValue('/path/to/file.dot'),
  save: vi.fn().mockResolvedValue('/path/to/save.dot'),
};

export const mockTauriFs = {
  readTextFile: vi.fn().mockResolvedValue('digraph { A -> B }'),
  writeTextFile: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
};
```

## Notes

- `src/main.ts` excluded from unit coverage (entry point, tested via E2E)
- `src/vite-env.d.ts` excluded (type definitions only)
- E2E tests require built Tauri app or dev server running
- Some toolbar tests require DOM simulation with happy-dom
