# GraphvizJS — Todo

Working backlog, maintained per the dev-workflow (session-start reads it, step 11 updates it,
step 16 pulls the next item). Statuses: 🟢 READY · 🟡 IN PROGRESS · ✅ DONE (pending commit) ·
⏸️ DEFERRED · 💤 FUTURE CYCLE.

## v2.0.0 follow-ups (branch `chore/v2.0.0-followups`)

- ✅ **Tighten renderer CSP** — dropped `'unsafe-eval'`/`'wasm-unsafe-eval'` from `script-src`
  (only needed by the in-renderer Graphviz/PDF libs removed in v2.0.0). Bundle verified free of
  `new Function`/`eval`/`WebAssembly`; e2e 18/18 with `script-src 'self'`.
- ✅ **`initGraphviz()` warm-up `.catch`** — log WASM pre-init failure in the main process instead
  of an unhandled promise rejection.
- ✅ **Remove `createPreview` legacy dual-signature** — 0 production callers; deleted the
  flat-callbacks branch + its backward-compat test.
- ✅ **Update `CLAUDE.md` for the v2.0.0 headless-core architecture** — rewrote Overview,
  Bootstrap Flow, Module Boundaries (added `core/`/`cli/`/`platform/`/`session/`/`recent/`/`watch/`/
  `menu/`; fixed `preview/`, `autosave/`, `editor/`), Rendering Pipeline (IPC, no `getCurrentEngine`),
  Electron Integration (render/validate/export + push channels), Vite config (native-dep
  externalization), and the export-format recipe. Every claim verified against current code.
  (`README.md` had no architecture staleness — not touched.)
- ✅ **De-duplicate the `ExportFormat` type** — `src/toolbar/export-menu.ts` now type-only
  re-exports `ExportFormat` from `core/types` (single source of truth; purity-safe). typecheck 0,
  purity test green.
- ✅ **Extend the dependency-graph tool to `core/` + `cli/` + `electron/`** — `moduleOf` now maps
  top-level layers to themselves; `buildAnalysis` scans all three (+ `cli/index.ts`,
  `electron/main.ts`, `electron/preload.ts` as entry-like). Graph went 15→18 modules / 42→54 files,
  0 unused files, still IPC 16/16 and 0 cycles; the `cli → core` / `platform → core` edges are now
  visible. Tests added in `categorize.test.ts` + `index.test.ts`.
- ✅ **Make the `graphvizjs` CLI a distributable binary** (v2.1.0, branch `feat/cli-distributable`)
  — shipped via the tsc approach (`tsconfig.cli.json` compiles `cli/`+`core/` → `dist-cli/` as Node
  ESM; `#!/usr/bin/env node` shebang; `bin`→`dist-cli/cli/index.js`; `files:["dist-cli"]`; natives
  as normal deps). NOT `@vercel/ncc` (rejected: ESM + jsdom `__dirname` crash). Verified by running
  the compiled binary from outside the repo (svg/png/pdf/stdin/--version) + a durable subprocess
  integration test. Three root-cause fixes surfaced by the DGT bedrock audit + validation:
  - Added explicit `.js` extensions to relative imports in `cli/`+`core/` (NodeNext requirement).
  - Made the `--version` read layout-independent (walk up to the nearest `package.json`) so it works
    in both the source (tsx) and compiled layouts.
  - **Pre-existing bug fixed:** `render -` (stdin) was rejected as an unknown flag despite being
    advertised in USAGE and implemented in `readInput` — the parser guard now exempts a bare `-`.
  - **DGT tool fixed:** `resolveImport`/`resolveCandidates` now map a TS-ESM `.js` specifier to its
    `.ts` source (the `.js` extensions had silently dropped the `cli → core` edge).
  See memory `project_graphvizjs_cli_distribution`.

## Headless-core / language-tooling cycle — ✅ COMPLETE

- ✅ **CLI `validate` + `format`** (v2.6.0) — the core oracle exposed headlessly; `validate --json`/`--strict`, `format` to stdout/`-o`; `dot:format`/`dot:vocabulary` IPC.
- ✅ **Semantic lint + quick fixes & standalone exe** (v2.7.0) — 5 rule families (invalid value/color with did-you-mean, wrong-context, duplicate-attribute, undefined-cluster), editor code actions, `validate --fix`; `pnpm build:cli:exe` SEA binary (format/validate/render→svg).
- ✅ **Graph statistics** (v2.8.0) — first Tier-4 graph-intelligence feature. Pure structural DOT parser (`core/parse-graph.ts`) + metrics/cycle-detection (`core/graph-stats.ts`); `graphvizjs stats [--json]`, `dot:stats` IPC (20th channel), Graph Statistics dialog (palette + View menu), E2E, exe coverage. Zero-throw invariant enforced (depth-guarded parser). Executed subagent-driven; final whole-branch review MERGE-READY YES.

## Polish debts (from v2.8.0 final review — acceptable-as-is, low priority)

- 💤 **Scope the E2E stats assertion** — `test/e2e/stats.spec.ts` asserts `'3'` unscoped (nodeCount and edgeCount are both 3 in the fixture); tighten with a `.stats-row` `hasText: 'Nodes'` locator so it strictly binds to the Nodes row.
- 💤 **`formatStats` padding** — CLI human output pads to `width+1` then adds a literal space (one extra); cosmetic, alignment already consistent.

## Next-cycle candidates (ROADMAP backlog — pull one at session-start)

- 💤 **Deprecated-attribute warnings** (Tier 2 remainder) — small; folds into `core/semantic-lint.ts` + a `deprecated` flag on the attribute catalog.
- 💤 **Source ↔ preview node map** (Tier 1 foundation) — `core/` `mapNodesToSource(dot, svg)` + CLI `map --json`; enables click-node→jump and cursor→highlight. Shared foundation for most hybrid features.
- 💤 **Graph-intelligence follow-ons** (Tier 4) — outline navigator, cycle-in-panel highlighting, path highlighting, visual diff; reuse the `parse-graph` GraphModel.
- 💤 **Preferences: default-engine + restore-session toggles** — offered but not selected in v2.5.0; `createNewTab` default can read a mutable `defaultEngine`; session restore is a guarded call.

## No action (reviewed, acceptable-as-is)

- `graphviz.test.ts` 8-engine / singleton coverage has no core analog — the same
  `graphvizInstance.layout()` path is exercised by `test/core/validate.test.ts` + the e2e suite.
- Deep-nesting (~500+ level) subgraphs are counted only up to `MAX_DEPTH` in `parse-graph.ts` — an intentional zero-throw guard against stack overflow; unreachable by realistic DOT.

## App-shell cycle (deferred from v1.4.0) — ✅ COMPLETE

- ✅ **Theme toggle** (v2.2.0) — System/Light/Dark selectable from View ▸ Theme (radio submenu) +
  a toolbar cycle button; System follows the OS live; choice persists (`colorScheme` store key) and
  applies at startup. CSS-variable-driven, so one `body.dark` toggle re-themes chrome + editor.
  New `src/theme/color-scheme.ts` + `src/toolbar/theme-button.ts`; `menu:setTheme` IPC (16→17).
- ✅ **Command palette** (v2.3.0) — Ctrl/Cmd+Shift+P fuzzy-search + run any command (file/export/
  edit/view/layout-engine/theme/help); View ▸ Command Palette… menu item (rides `menu:action`, no
  new IPC). New `src/palette/command-palette.ts` (pure `fuzzyScore`/`filterCommands` + overlay
  controller). Command list built from the shared `menuHandlers`.
- ✅ **App icon** (v2.4.0) — on-brand directed-graph mark (`build/icon.svg` → `build/icon.png` via
  `pnpm build:icon`/resvg); electron-builder embeds it (win.icon), window uses it in dev. Swap the
  SVG + rerun to rebrand.
- ✅ **Preferences UI** (v2.5.0) — Preferences dialog via Cmd/Ctrl+, (Edit ▸ Preferences… /
  macOS app menu) + command palette. Scoped to **Appearance → Theme** per Daniel's choice; wired to
  the live color-scheme controller. New `src/preferences/preferences-dialog.ts`; structured to grow
  more sections. (Default-engine + restore-session were offered but not selected — easy to add: the
  `createNewTab` default param can read a mutable `defaultEngine`; session restore is a guarded call.)
