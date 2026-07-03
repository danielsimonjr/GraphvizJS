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

Regex (not AST) parsing. `import.meta.glob` loads (Vite, used in `examples/` and
`editor/`) are not static imports and are excluded from edge resolution.
