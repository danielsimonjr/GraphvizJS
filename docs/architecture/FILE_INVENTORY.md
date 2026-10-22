<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Complete File Inventory

This report lists each source file that the map census finds, with a disposition. The census reads the files that git tracks. Outside a git work tree, it walks the folder. The census skips tool state, dependency folders and build output (for example `.git/`, `node_modules/`, `dist/` and `target/`), and `obj/` and `bin/` for C#.

**Language**: typescript

**Total files**: 173

## Disposition counts

| Disposition | Count | Meaning |
| --- | --: | --- |
| `reachable` | 44 | A `src`-area file that an entry root reaches. |
| `build-entry` | 25 | A `src`-area file that is an entry root. |
| `test-only` | 2 | A `src`-area file that only a test reaches. |
| `orphan` | 2 | A `src`-area file that nothing reaches. Delete it, or wire it to a root. |
| `test` | 85 | A file in a `tests/` folder, or a `*.test.ts` or `*.spec.ts` file. |
| `tool` | 12 | A file in a `tools/` or `scripts/` folder outside `src/`. |
| `config` | 3 | A `*.config.*` file of TypeScript or JavaScript. |
| `example` | 0 | A file in `examples/` or `docs/`. |
| `bench` | 0 | A file in `bench/` or `benchmarks/`, or a `*.bench.*` file. |
| **Total** | **173** | |

## Per-area counts

| Area | Files |
| --- | --: |
| `config` | 3 |
| `src` | 73 |
| `tests` | 85 |
| `tools` | 12 |

## Per-package counts

| Package | Files |
| --- | --: |
| `(root)` | 128 |
| `graphvizjs-desktop-client` | 45 |

## All files

| File | Package | Area | Disposition | Lines |
| --- | --- | --- | --- | --: |
| `cli/args.ts` | (root) | src | build-entry | 294 |
| `cli/index.ts` | (root) | src | build-entry | 208 |
| `core/apply-fixes.ts` | (root) | src | build-entry | 33 |
| `core/dot-catalog.ts` | (root) | src | build-entry | 232 |
| `core/dot-colors.ts` | (root) | src | build-entry | 184 |
| `core/dot-vocab.ts` | (root) | src | build-entry | 203 |
| `core/edit-distance.ts` | (root) | src | build-entry | 57 |
| `core/export-pdf.ts` | (root) | src | build-entry | 225 |
| `core/export-png.ts` | (root) | src | build-entry | 43 |
| `core/export.ts` | (root) | src | build-entry | 47 |
| `core/format.ts` | (root) | src | build-entry | 161 |
| `core/graph-stats.ts` | (root) | src | build-entry | 119 |
| `core/normalize-svg.ts` | (root) | src | build-entry | 92 |
| `core/parse-graph.ts` | (root) | src | build-entry | 361 |
| `core/render.ts` | (root) | src | build-entry | 129 |
| `core/scan-dot.ts` | (root) | src | build-entry | 159 |
| `core/semantic-lint.ts` | (root) | src | build-entry | 374 |
| `core/structure-lint.ts` | (root) | src | build-entry | 99 |
| `core/types.ts` | (root) | src | build-entry | 137 |
| `core/validate.ts` | (root) | src | build-entry | 21 |
| `electron/app-menu.ts` | (root) | src | reachable | 59 |
| `electron/file-watcher.ts` | (root) | src | reachable | 52 |
| `electron/main.ts` | (root) | src | build-entry | 228 |
| `electron/preload.ts` | (root) | src | build-entry | 39 |
| `playwright.config.ts` | (root) | config | config | 28 |
| `scripts/build-cli-exe.mjs` | (root) | tools | tool | 109 |
| `scripts/exe-entry.mjs` | (root) | tools | tool | 10 |
| `scripts/render-icon.mjs` | (root) | tools | tool | 13 |
| `src/autosave/constants.ts` | graphvizjs-desktop-client | src | reachable | 9 |
| `src/editor/autocomplete.ts` | graphvizjs-desktop-client | src | reachable | 102 |
| `src/editor/language.ts` | graphvizjs-desktop-client | src | reachable | 119 |
| `src/editor/linting.ts` | graphvizjs-desktop-client | src | reachable | 207 |
| `src/editor/search.ts` | graphvizjs-desktop-client | src | reachable | 7 |
| `src/editor/theme.ts` | graphvizjs-desktop-client | src | reachable | 32 |
| `src/editor/zoom.ts` | graphvizjs-desktop-client | src | reachable | 155 |
| `src/help/dialog.ts` | graphvizjs-desktop-client | src | reachable | 141 |
| `src/main.ts` | graphvizjs-desktop-client | src | build-entry | 914 |
| `src/menu/commands.ts` | graphvizjs-desktop-client | src | reachable | 91 |
| `src/menu/menu-template.ts` | graphvizjs-desktop-client | src | reachable | 336 |
| `src/palette/command-palette.ts` | graphvizjs-desktop-client | src | reachable | 173 |
| `src/platform/contract.ts` | graphvizjs-desktop-client | src | reachable | 71 |
| `src/platform/global.d.ts` | graphvizjs-desktop-client | src | orphan | 7 |
| `src/platform/index.ts` | graphvizjs-desktop-client | src | reachable | 256 |
| `src/preferences/preferences-dialog.ts` | graphvizjs-desktop-client | src | reachable | 118 |
| `src/preview/render.ts` | graphvizjs-desktop-client | src | reachable | 104 |
| `src/preview/zoom.ts` | graphvizjs-desktop-client | src | reachable | 149 |
| `src/recent/recent-files.ts` | graphvizjs-desktop-client | src | reachable | 31 |
| `src/session/session.ts` | graphvizjs-desktop-client | src | reachable | 109 |
| `src/stats/stats-dialog.ts` | graphvizjs-desktop-client | src | reachable | 83 |
| `src/tabs/manager.ts` | graphvizjs-desktop-client | src | reachable | 163 |
| `src/tabs/tab-bar.ts` | graphvizjs-desktop-client | src | reachable | 115 |
| `src/theme/color-scheme.ts` | graphvizjs-desktop-client | src | reachable | 100 |
| `src/toolbar/actions.ts` | graphvizjs-desktop-client | src | reachable | 177 |
| `src/toolbar/examples-menu.ts` | graphvizjs-desktop-client | src | reachable | 132 |
| `src/toolbar/export-diagram.ts` | graphvizjs-desktop-client | src | reachable | 74 |
| `src/toolbar/export-menu.ts` | graphvizjs-desktop-client | src | reachable | 108 |
| `src/toolbar/find.ts` | graphvizjs-desktop-client | src | reachable | 26 |
| `src/toolbar/format.ts` | graphvizjs-desktop-client | src | reachable | 59 |
| `src/toolbar/layout-engine.ts` | graphvizjs-desktop-client | src | reachable | 61 |
| `src/toolbar/new-diagram.ts` | graphvizjs-desktop-client | src | reachable | 19 |
| `src/toolbar/open-diagram.ts` | graphvizjs-desktop-client | src | reachable | 31 |
| `src/toolbar/pdf-options-dialog.ts` | graphvizjs-desktop-client | src | reachable | 84 |
| `src/toolbar/recent-menu.ts` | graphvizjs-desktop-client | src | reachable | 86 |
| `src/toolbar/save-as.ts` | graphvizjs-desktop-client | src | reachable | 56 |
| `src/toolbar/save-diagram.ts` | graphvizjs-desktop-client | src | reachable | 44 |
| `src/toolbar/shortcuts.ts` | graphvizjs-desktop-client | src | reachable | 101 |
| `src/toolbar/theme-button.ts` | graphvizjs-desktop-client | src | reachable | 40 |
| `src/utils/debounce.ts` | graphvizjs-desktop-client | src | reachable | 20 |
| `src/vite-env.d.ts` | graphvizjs-desktop-client | src | orphan | 1 |
| `src/watch/file-watch.ts` | graphvizjs-desktop-client | src | reachable | 24 |
| `src/watch/watch-plan.ts` | graphvizjs-desktop-client | src | reachable | 37 |
| `src/window/state.ts` | graphvizjs-desktop-client | src | reachable | 33 |
| `src/workspace/resize.ts` | graphvizjs-desktop-client | src | reachable | 67 |
| `test/architecture/renderer-purity.test.ts` | (root) | tests | test | 74 |
| `test/cli/args.test.ts` | (root) | tests | test | 133 |
| `test/cli/cli.integration.test.ts` | (root) | tests | test | 147 |
| `test/cli/dist.integration.test.ts` | (root) | tests | test | 95 |
| `test/cli/offset.test.ts` | (root) | tests | test | 22 |
| `test/core/apply-fixes.test.ts` | (root) | tests | test | 37 |
| `test/core/dot-catalog.test.ts` | (root) | tests | test | 89 |
| `test/core/dot-colors.test.ts` | (root) | tests | test | 42 |
| `test/core/dot-vocab.test.ts` | (root) | tests | test | 87 |
| `test/core/edit-distance.test.ts` | (root) | tests | test | 59 |
| `test/core/export-pdf.test.ts` | (root) | tests | test | 41 |
| `test/core/export-png.test.ts` | (root) | tests | test | 25 |
| `test/core/export.test.ts` | (root) | tests | test | 33 |
| `test/core/format.test.ts` | (root) | tests | test | 83 |
| `test/core/graph-stats.test.ts` | (root) | tests | test | 81 |
| `test/core/normalize-svg.test.ts` | (root) | tests | test | 47 |
| `test/core/parse-graph.test.ts` | (root) | tests | test | 241 |
| `test/core/render.test.ts` | (root) | tests | test | 16 |
| `test/core/scan-dot.test.ts` | (root) | tests | test | 60 |
| `test/core/semantic-lint.test.ts` | (root) | tests | test | 380 |
| `test/core/structure-lint.test.ts` | (root) | tests | test | 53 |
| `test/core/validate-diagram.test.ts` | (root) | tests | test | 45 |
| `test/core/validate.test.ts` | (root) | tests | test | 343 |
| `test/e2e/app-menu.spec.ts` | (root) | tests | test | 27 |
| `test/e2e/app.spec.ts` | (root) | tests | test | 79 |
| `test/e2e/editor-authoring.spec.ts` | (root) | tests | test | 56 |
| `test/e2e/editor-zoom.spec.ts` | (root) | tests | test | 52 |
| `test/e2e/examples.spec.ts` | (root) | tests | test | 121 |
| `test/e2e/export.spec.ts` | (root) | tests | test | 162 |
| `test/e2e/external-change.spec.ts` | (root) | tests | test | 47 |
| `test/e2e/file-operations.spec.ts` | (root) | tests | test | 101 |
| `test/e2e/global-setup.ts` | (root) | src | build-entry | 24 |
| `test/e2e/helpers.ts` | (root) | src | test-only | 168 |
| `test/e2e/keyboard-shortcuts.spec.ts` | (root) | tests | test | 131 |
| `test/e2e/per-doc-engine.spec.ts` | (root) | tests | test | 46 |
| `test/e2e/recent-files.spec.ts` | (root) | tests | test | 22 |
| `test/e2e/rendering.spec.ts` | (root) | tests | test | 125 |
| `test/e2e/save-as.spec.ts` | (root) | tests | test | 42 |
| `test/e2e/session-restore.spec.ts` | (root) | tests | test | 55 |
| `test/e2e/stats.spec.ts` | (root) | tests | test | 35 |
| `test/editor/autocomplete.test.ts` | (root) | tests | test | 76 |
| `test/editor/language.test.ts` | (root) | tests | test | 197 |
| `test/editor/linting.test.ts` | (root) | tests | test | 433 |
| `test/editor/search.test.ts` | (root) | tests | test | 9 |
| `test/editor/theme.test.ts` | (root) | tests | test | 39 |
| `test/editor/zoom.test.ts` | (root) | tests | test | 322 |
| `test/help/dialog.test.ts` | (root) | tests | test | 185 |
| `test/menu/commands.test.ts` | (root) | tests | test | 66 |
| `test/menu/menu-template.test.ts` | (root) | tests | test | 138 |
| `test/mocks/graphviz.ts` | (root) | src | test-only | 65 |
| `test/palette/command-palette.test.ts` | (root) | tests | test | 121 |
| `test/platform/index.test.ts` | (root) | tests | test | 123 |
| `test/preferences/preferences-dialog.test.ts` | (root) | tests | test | 55 |
| `test/preview/render.test.ts` | (root) | tests | test | 277 |
| `test/preview/zoom.test.ts` | (root) | tests | test | 150 |
| `test/recent/recent-files.test.ts` | (root) | tests | test | 60 |
| `test/session/session.test.ts` | (root) | tests | test | 125 |
| `test/setup.ts` | (root) | src | build-entry | 97 |
| `test/stats/stats-dialog.test.ts` | (root) | tests | test | 44 |
| `test/tabs/manager.test.ts` | (root) | tests | test | 302 |
| `test/tabs/tab-bar.test.ts` | (root) | tests | test | 192 |
| `test/theme/color-scheme.test.ts` | (root) | tests | test | 127 |
| `test/toolbar/actions.test.ts` | (root) | tests | test | 285 |
| `test/toolbar/examples-menu.test.ts` | (root) | tests | test | 227 |
| `test/toolbar/export-diagram.test.ts` | (root) | tests | test | 237 |
| `test/toolbar/export-menu.test.ts` | (root) | tests | test | 205 |
| `test/toolbar/find.test.ts` | (root) | tests | test | 37 |
| `test/toolbar/format.test.ts` | (root) | tests | test | 153 |
| `test/toolbar/layout-engine.test.ts` | (root) | tests | test | 109 |
| `test/toolbar/new-diagram.test.ts` | (root) | tests | test | 56 |
| `test/toolbar/open-diagram.test.ts` | (root) | tests | test | 36 |
| `test/toolbar/pdf-options-dialog.test.ts` | (root) | tests | test | 58 |
| `test/toolbar/recent-menu.test.ts` | (root) | tests | test | 56 |
| `test/toolbar/save-as.test.ts` | (root) | tests | test | 41 |
| `test/toolbar/save-diagram.test.ts` | (root) | tests | test | 50 |
| `test/toolbar/shortcuts.test.ts` | (root) | tests | test | 131 |
| `test/toolbar/theme-button.test.ts` | (root) | tests | test | 30 |
| `test/tools/analyze.test.ts` | (root) | tests | test | 173 |
| `test/tools/categorize.test.ts` | (root) | tests | test | 54 |
| `test/tools/docs-check.test.ts` | (root) | tests | test | 26 |
| `test/tools/index.test.ts` | (root) | tests | test | 73 |
| `test/tools/ipc.test.ts` | (root) | tests | test | 117 |
| `test/tools/render.test.ts` | (root) | tests | test | 114 |
| `test/tools/rules.test.ts` | (root) | tests | test | 96 |
| `test/tools/scan.test.ts` | (root) | tests | test | 156 |
| `test/utils/debounce.test.ts` | (root) | tests | test | 84 |
| `test/watch/watch-plan.test.ts` | (root) | tests | test | 30 |
| `test/window/state.test.ts` | (root) | tests | test | 36 |
| `test/workspace/resize.test.ts` | (root) | tests | test | 80 |
| `tools/dependency-graph/analyze.ts` | (root) | tools | tool | 199 |
| `tools/dependency-graph/categorize.ts` | (root) | tools | tool | 47 |
| `tools/dependency-graph/index.ts` | (root) | tools | tool | 202 |
| `tools/dependency-graph/ipc.ts` | (root) | tools | tool | 103 |
| `tools/dependency-graph/render.ts` | (root) | tools | tool | 159 |
| `tools/dependency-graph/rules.ts` | (root) | tools | tool | 90 |
| `tools/dependency-graph/scan.ts` | (root) | tools | tool | 193 |
| `tools/dependency-graph/types.ts` | (root) | tools | tool | 118 |
| `tools/docs-check/index.ts` | (root) | tools | tool | 102 |
| `vite.config.ts` | (root) | config | config | 64 |
| `vitest.config.ts` | (root) | config | config | 27 |

## Skipped links

Links (symbolic links and junctions) that the census did not follow. A link can point to another repository, so no file behind a link is in this inventory or in the graph.

_None._

## Warnings

- package.json entry 'dist-electron/main.js' did not resolve to a known source file -- ignored; if no other declared entry resolves either, the entry-point root falls back to a conventional src/index.* file instead
- package.json entry 'dist-cli/cli/index.js' did not resolve to a known source file -- ignored; if no other declared entry resolves either, the entry-point root falls back to a conventional src/index.* file instead
