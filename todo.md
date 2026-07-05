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
- ⏸️ **Make the `graphvizjs` CLI a distributable binary** — deferred (Daniel, 2026-07-04). Ship
  via the tsc approach (compile `cli/`+`core/` to `dist-cli/`, shebang, `bin`→compiled JS, natives
  as normal deps). NOT `@vercel/ncc` — investigated and rejected (ESM + jsdom `__dirname` crash;
  61 MB Windows-DLL folder). See memory `project_graphvizjs_cli_distribution`.

## No action (reviewed, acceptable-as-is)

- `graphviz.test.ts` 8-engine / singleton coverage has no core analog — the same
  `graphvizInstance.layout()` path is exercised by `test/core/validate.test.ts` + the e2e suite.

## Future App-shell cycle (deferred from v1.4.0)

- 💤 Theme toggle (dark CSS written but unreachable — no toggle/matchMedia/persistence).
- 💤 Command palette, preferences UI.
- 💤 App icon (256×256 `.ico`; `win.icon` currently unset → default Electron icon).
