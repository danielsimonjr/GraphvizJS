# GraphvizJS — dependency-graph tool (design spec)

**Date:** 2026-07-02
**Status:** Approved design, pending implementation plan
**Origin:** Port + refactor of `MathTS/tools/create-dependency-graph/` (a 3,370-line, general-purpose CDG tool, ~half of it MathTS-specific) for the GraphvizJS codebase.

## Goal

A developer tool, run via `pnpm graph`, that scans GraphvizJS's `src/` and produces up-to-date architecture documentation: a module/dependency map, circular-dependency and unused-export reports, a `src`↔`test` coverage map, a **renderer↔Electron IPC-boundary check**, summary stats, and a Mermaid diagram — emitted as Markdown + JSON + `.mermaid` under `docs/architecture/`.

### Non-goals

- Porting the MathTS-specific analyzers (WASM-accelerator pairing, worker-pool/`ComputePool` threshold pairing, monorepo/workspace detection, the mathjs coverage-policy). No analog exists in GraphvizJS.
- The source's standalone-package machinery (own `node_modules`, `package-lock.json`, `dist/`, `@yao-pkg/pkg` `.exe` build).
- Runtime/behavioral analysis — this is static import/export analysis only.

## Success criteria

- `pnpm graph` exits 0 and writes `docs/architecture/DEPENDENCY_GRAPH.md`, `dependency-graph.json`, `dependency-graph.mermaid`.
- The module map reflects GraphvizJS's real structure (`editor/ preview/ toolbar/ tabs/ autosave/ platform/ window/ workspace/ help/ utils/ examples/` + root files).
- The IPC section correctly reports all 10 `GraphvizApi` methods as fully wired (contract + preload channel + main handler) with **zero false positives** — specifically it must not mis-flag `dialog:save` (registered as a multiline `ipcMain.handle(` call) or `storeGet<T>` (a generic method).
- Circular-dependency report on the current tree (expected: none, given callback-wired modules).
- Unit tests for the pure analyzers pass; a smoke test runs the tool on the repo and asserts exit 0 + the 3 files. `pnpm typecheck`/`lint` clean.

## Source analysis (what to reuse vs. strip)

The source (`create-dependency-graph.ts`, 3,370 lines) parses with **regex only** (runtime deps: `fs`, `path`, `js-yaml`; no AST library). Reusable general-purpose logic: file walk, import/export regex parsing, module categorization, circular-dependency detection, unused-export detection, statistics, Mermaid generation, Markdown/JSON emitters, CLI parsing. **Strip** (~127 references): `wasm-pairing`, `parallel-pairing`/`ComputePool`, `mathTyped`/`*Dispatch` routing, monorepo/`detectWorkspaces`/`--all` dormant handling, and the mathjs coverage-policy (`js-yaml` becomes unnecessary — dropped).

## Approach (chosen: A — port + modularize + integrate)

Rewrite the reusable core as clean, GraphvizJS-tailored modules under `tools/dependency-graph/`, run via the repo's own toolchain (`tsx` devDep + a `pnpm graph` script). No nested package, lockfile, or `.exe` build. Rejected: **B** (copy folder as-is then delete MathTS bits — drags `node_modules`/`dist`/lockfile/`.exe` + a monolith to hack down in place) and **C** (keep it a standalone mini-package — a second lockfile + dep island inside a pnpm repo, overkill for one script).

## Design

### File structure (split the monolith into focused, testable units)

All under `tools/dependency-graph/`:

- `types.ts` — shared interfaces (`ParsedFile`, `Dependency`, `ModuleMap`, `IpcReport`, `Analysis`, `Stats`, `CliOptions`).
- `scan.ts` — `scanSource(srcDir, opts): ParsedFile[]`: recursive walk of `src/` (excluding `dist`, `dist-electron`, `node_modules`, `coverage`, `*.d.ts`), regex-parsing each file's relative imports + exported names.
- `categorize.ts` — `categorize(files): ModuleMap`: bucket files by top-level `src/` subdirectory (`editor`, `preview`, `toolbar`, `tabs`, `autosave`, `platform`, `window`, `workspace`, `help`, `utils`, `examples`) with root-level files under `root`.
- `analyze.ts` — `detectCycles(files)`, `detectUnusedExports(files, testFiles)`, `mapTestCoverage(srcFiles, testFiles)` (for each `src/` file, which `test/` file(s) import it), `computeStats(...)`.
- `ipc.ts` — `analyzeIpc(root): IpcReport` (see below).
- `render.ts` — `renderMarkdown(model)`, `renderJson(model)`, `renderMermaid(moduleMap)`.
- `index.ts` — `parseCli(argv)` (`--include-tests`, `--help`), orchestration, and writing the 3 files to `docs/architecture/`.

### Module dependency & categorization

`scan.ts` records, per file, the resolved internal imports (relative paths → `src/…` keys) and the exported identifiers (`export function/const/class/interface/type`, `export { … }`). `categorize.ts` groups by first path segment. Folder-level edges (module → module) are aggregated from file-level edges for the Mermaid diagram and the "module dependencies" table.

### IPC-boundary analyzer (`ipc.ts`) — the wasm-pairing analog

Extracts three sets and cross-references them:

1. **Contract methods** — from `src/platform/contract.ts`: method names on the `GraphvizApi` interface. Parser must handle **generic methods** (`storeGet<T>(key: …)`), so match `^\s*(\w+)\s*(?:<[^>]*>)?\s*\(`.
2. **Preload channels** — from `electron/preload.ts`: string args to `ipcRenderer.invoke('<channel>')`, plus the `GraphvizApi` method each is exposed as (the contextBridge key).
3. **Main handlers** — from `electron/main.ts`: string args to `ipcMain.handle('<channel>')`. Parser **must be multiline-tolerant**: match `ipcMain.handle(` then the next string literal across whitespace/newlines (the real `dialog:save` handler spans lines 100–101). Same tolerance for `ipcRenderer.invoke(`.

Report three buckets, keyed by channel: ✅ **fully wired** (a contract method → preload `invoke` → main `handle`), ⚠️ **contract/preload channel with no `ipcMain.handle`** (latent bug — the invoke would reject), 🔸 **`ipcMain.handle` with no preload `invoke`** (orphan/dead handler). On the current tree, all 10 channels (`dialog:openText`, `dialog:save`, `fs:writeText`, `fs:writeBinary`, `store:get`, `store:set`, `store:delete`, `dialog:confirm`, `shell:openExternal`, `app:info`) must land in ✅.

### Outputs → `docs/architecture/`

- `DEPENDENCY_GRAPH.md` — modules & their files, module-dependency table, circular-dependency report, unused exports, `src`↔`test` coverage, IPC-boundary table, summary stats.
- `dependency-graph.json` — the full model, machine-readable.
- `dependency-graph.mermaid` — module-level `graph LR` diagram.

An initial snapshot of all three is **committed** (browsable architecture doc); `pnpm graph` regenerates on demand.

### Run mechanism

Add `tsx` as a devDependency and a script: `"graph": "tsx tools/dependency-graph/index.ts"`. (Node 20 in CI can't strip TS types, so `tsx` is required rather than bare `node`.) The tool is dev-only; it is **not** part of `build` and adds no runtime dependency to the shipped app.

## Testing

- **Unit** (`test/tools/`): `categorize` buckets a fixture file set correctly; `detectCycles` finds a seeded cycle and reports none on an acyclic fixture; `analyzeIpc` on inline fixtures correctly classifies fully-wired vs missing-handler vs orphan, **including a multiline `ipcMain.handle(` and a generic `storeGet<T>` contract method** (the two real false-positive traps); `mapTestCoverage` maps a src file to its importing test.
- **Smoke** (`test/tools/`): run the tool's orchestration against the real repo (or a tmp copy), assert exit 0 and that the 3 output files are written and parse (JSON valid, Markdown non-empty). Alternatively assert the exported `run()` returns a model with `ipc.fullyWired.length === 10` and `ipc.missingHandlers.length === 0`.
- `pnpm typecheck` + `pnpm lint` clean; tests join the existing Vitest suite. `tools/**` and the generated `docs/architecture/**` are excluded from app coverage thresholds (dev tooling, not shipped code).

## Risks & mitigations

- **Regex parsing misses.** Known GraphvizJS cases: multiline `ipcMain.handle(`/`ipcRenderer.invoke(` (handled — multiline-tolerant match), generic contract methods (handled — optional `<…>` in the method regex), and `import.meta.glob` in `examples/` and `editor/` (a Vite construct, not a static import — the tool will note globbed example `.dot`/module loads as a footnote rather than trying to resolve them). *Mitigation:* the IPC-analyzer unit tests encode the first two traps explicitly; `import.meta.glob` is documented as out-of-scope for edge resolution.
- **Output staleness.** Committed snapshot drifts from code. *Mitigation:* `pnpm graph` is one command; regenerate before architecture reviews (documented in the tool's `tools/dependency-graph/README.md`).
- **`docs/architecture/` vs existing `docs/superpowers/`.** Kept separate: `superpowers/` holds specs/plans, `architecture/` holds generated snapshots.

## Out of scope (possible later)

Watch mode, SVG/HTML rendering of the Mermaid graph, per-file cyclomatic metrics, and enforcing the reports in CI (e.g., failing on a new cycle or an unwired IPC channel).
