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
- 🟢 **Update `CLAUDE.md` (+ `README.md`) for the v2.0.0 headless-core architecture** — doc-rot
  discovered 2026-07-05: the architecture section still describes the pre-v2.0.0 app (renderer
  "Initializes Graphviz WASM", lists the deleted `preview/graphviz.ts`, `@hpcc-js/wasm` as
  "client-side rendering", the removed `getCurrentEngine()`; no `core/`, `cli/`, or IPC channels).
  Rewrite to current state (headless `core/`, IPC boundary, CLI), no version/date in the doc.
  Verify every claim with honest-claude.
- 🟢 **Extend the dependency-graph tool to `core/` + `cli/` + `electron/`** — needs a `moduleOf`
  refactor (top-level dirs currently collapse to `root`), add the new entry points to `entryLike`,
  and update the tool's test expectations. Note: the durable `renderer-purity.test.ts` already
  guards the central constraint, so this is completeness, not coverage of a gap.
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
