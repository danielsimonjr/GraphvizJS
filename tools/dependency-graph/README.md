# dependency-graph

Dev tool: static import/export analysis of GraphvizJS `src/` (+ `test/`).

## Run

    pnpm graph              # regenerate docs/architecture/*
    pnpm graph --include-tests

## Outputs (committed snapshot under docs/architecture/)

- `DEPENDENCY_GRAPH.md` — modules, module-dependency table, circular-dependency
  report, unused files/exports, src↔test coverage, IPC-boundary table, stats.
- `dependency-graph.json` — the full model, machine-readable.
- `dependency-graph.mermaid` — module-level `graph LR` diagram.

Regenerate before architecture reviews; the committed copy can drift from code.

## Modules

- `scan.ts` — walk + regex-parse files (imports/exports/LOC), resolve specifiers.
- `categorize.ts` — bucket files into modules; aggregate folder-level edges.
- `analyze.ts` — cycles, unused files/exports, src↔test coverage, stats.
- `ipc.ts` — renderer↔Electron IPC-boundary check (contract ↔ preload ↔ main).
- `render.ts` — Markdown / JSON / Mermaid emitters.
- `index.ts` — CLI + orchestration.

## Known limits

Regex (not AST) parsing, so several constructs are approximated:

- `import.meta.glob` loads (Vite, used in `examples/` and `editor/`) are not
  static imports and are excluded from edge resolution.
- `export default` is not recorded as an export.
- Re-exports (`export { X } from './y'`) are not counted as a *use* of `y`'s
  `X`, so a symbol only consumed via a re-export barrel can show as an unused
  export (false positive).
- Combined default-plus-namespace imports (`import D, * as NS from './x'`) are
  not parsed (combined default-plus-named `import D, { N }` IS supported).
- Circular-dependency detection reports whether a cycle exists and gives one
  representative cycle per back-edge; it can under-enumerate distinct
  overlapping simple cycles.
- Scan exclusions match by directory *basename* (`dist`, `coverage`, `e2e`,
  …), so a same-named directory anywhere in the tree is skipped.
