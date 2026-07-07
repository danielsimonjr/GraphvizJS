# CLI-first workflow + `validate`/`format` core oracles

**Date:** 2026-07-07
**Status:** Approved (design) — pending implementation plan
**Author:** Daniel Simon Jr. (with Claude)

## Problem

Two capabilities the current architecture cannot support cleanly:

1. **Build a feature in the CLI before surfacing it in the UI.** New capability
   should land headless, be exercised and tested via the CLI, then be promoted
   to the UI over IPC.
2. **Use the CLI to automate and troubleshoot the UI as a "core oracle."** Run
   the same `.dot` through the CLI: if it reproduces a UI symptom, the bug is in
   `core/`; if it does not, the bug is in the renderer or the IPC seam.

Both are blocked by the same gap: **the CLI is narrower than core.** Core exposes
render + validation, but the CLI only surfaces `render` (export-to-file). There is
no CLI `validate`, and validation output is not machine-readable, so there is
nothing to compare against what the UI shows.

A deeper obstacle surfaced during design. The UI shows **two** kinds of
diagnostics, but only one comes from core:

- `render:validate` → core's `validateDot()` — real Graphviz syntax validation.
- `createStructureLintSource()` in `src/editor/structure-lint.ts` — a
  **renderer-only** structural lint (delimiter balance + unknown-attribute
  checks) that never touches core.

So a CLI `validate` built only on core's `validateDot` would be a partial oracle:
it could never reproduce the structural warnings the UI shows. Making the oracle
**total** requires the structural analysis (and its pure dependencies) to become
shared substance.

## Constraint that shapes everything

The dependency-graph layering rule (`tools/dependency-graph/rules.ts`) is hard and
build-failing (`hardViolationCount`):

> **The renderer may import `core/` only as the type-only `core/types.ts`.**
> `core/` is a leaf and may import nothing.

There is no shared middle layer. Therefore any **pure utility the renderer needs
synchronously** becomes a problem the moment core also needs it — it cannot be
imported from both sides. This affects three utilities:

| Pure utility | Renderer needs it (sync) for… | Core needs it for… |
|---|---|---|
| `scan-dot` (literal-aware span scanner) | `src/editor/format.ts` (Format Document) | structural lint |
| DOT vocabulary (`DOT_ATTRIBUTES`/`DOT_KEYWORDS`) | `language.ts` highlighting, `autocomplete.ts` | "unknown attribute" check |
| `structuralDiagnostics` | live editor linting (200 ms, local) | the oracle |

## Decision

Adopt the **"one core"** realization (Option B, full): move all pure DOT language
substance into `core/`, and adapt the renderer to consume it over IPC. This keeps
a single mental model — one core, two subjects (`cli/` and `src/`) — at the cost
of a mid-size refactor and making the renderer's live linting asynchronous.

Rejected alternatives:
- **Shared `dot-lang/` leaf** (Option A): keeps renderer linting synchronous and
  avoids the IPC changes, but introduces a new architectural layer. Declined in
  favor of preserving the single-core mental model.
- **Syntax-only pilot, structural deferred**: ships faster but is only a partial
  oracle. Declined — the total oracle is wanted now.

## Architecture

### What moves into `core/`

| New core file | Source | Nature |
|---|---|---|
| `core/scan-dot.ts` | `src/editor/scan-dot.ts` | pure scanner (`scanDot`, `checkBalance`, `Span`, `SpanKind`) |
| `core/dot-vocab.ts` | vocab half of `src/editor/dot-data.ts` | `DOT_ATTRIBUTES`, `DOT_KEYWORDS` |
| `core/structure-lint.ts` | `src/editor/structure-lint.ts` | `structuralDiagnostics` + `parseAttrEntries` (pure part only) |
| `core/format.ts` | `src/editor/format.ts` | `formatDot` (already pure, imports only `scan-dot`) |
| `core/validate.ts` | new | `validateDiagram()` orchestrator — the oracle |

`src/editor/dot-data.ts` retains **only** the autocomplete snippet data (a UI
concern). The CodeMirror wrapper `createStructureLintSource` is **deleted**; the
renderer no longer computes diagnostics locally.

Relocated modules carry explicit `.js` import extensions (NodeNext), consistent
with the rest of `core/` and `cli/`.

### New / changed core API

```ts
// core/validate.ts — the single source of truth, consumed by CLI and IPC alike
export interface DiagramDiagnostics {
  syntax: DotValidationError | null;     // Graphviz syntax (existing validateDot)
  structural: StructuralDiagnostic[];    // moved structural analysis
}
export function validateDiagram(
  source: string,
  engine?: LayoutEngine
): Promise<DiagramDiagnostics>;

// core/format.ts — moved unchanged
export function formatDot(source: string, opts?: FormatOptions): string;
```

`StructuralDiagnostic` keeps its character-offset (`from`/`to`) shape for the
renderer; the CLI derives line/column from offsets for human output.

### IPC changes

`src/platform/contract.ts` → `electron/preload.ts` → main-process handler →
`src/platform/index.ts`. `graph:check` enforces that all four align (any
orphan/missing handler or missing contract entry is a hard violation).

- **`render:validate`** — return type changes from `DotValidationError | null` to
  `DiagramDiagnostics` (`{ syntax, structural }`). One round-trip feeds the whole
  linter. The contract method (`GraphvizApi`) and its renderer wrapper are renamed
  `validateDot` → `validateDiagram` to match the new return shape; the underlying
  channel string stays `render:validate`. (Decision (b): extend the existing
  channel rather than add a new one — fewer channels; `graph:check` catches any
  mismatch.)
- **`dot:format`** — new channel: `formatDot(source) → string`.
- **`dot:vocabulary`** — new channel: `{ attributes, keywords }`, fetched once at
  bootstrap.

### Renderer changes (adapt to IPC)

- `src/editor/language.ts`, `src/editor/autocomplete.ts` — parameterized on the
  vocabulary (`createDotLanguage(vocab)`, etc.) instead of importing it.
  `bootstrap()` `await`s `dotVocabulary()` before building the editor (bootstrap
  is already async).
- `src/editor/linting.ts` — consumes the combined `{ syntax, structural }` and
  maps both to CodeMirror diagnostics (syntax = error span from line/column;
  structural = offsets). The separate `createStructureLintSource` linter is
  removed. **Live linting becomes asynchronous/IPC** — the accepted regression.
- `src/toolbar/format.ts` — calls the `dot:format` IPC (async) instead of the
  local `formatDot`.

### CLI commands + automation contract

```
graphvizjs validate <input.dot|-> [--engine E] [--json] [--strict]
graphvizjs format   <input.dot|-> [-o <output>]     # default: stdout
```

- **Human output** (default): linter-style lines
  `input.dot:LINE:COL: error: <message>` (syntax) and
  `input.dot:LINE:COL: warning: <message>` (structural), plus a summary line.
- **`--json`**: the documented convention for all machine-readable CLI output.
  ```json
  {
    "input": "bug.dot",
    "engine": "dot",
    "valid": false,
    "syntax": { "message": "…", "line": 12, "column": 5 },
    "structural": [
      { "severity": "warning", "message": "Unknown attribute 'shp'", "line": 4, "column": 9 }
    ]
  }
  ```
- **Exit codes**: `0` valid · `1` invalid · `2` usage error.
  - Decision (a): structural **warnings do not fail** by default (`exit 0`);
    `--strict` makes any warning fail (`exit 1`). A syntax error always fails.
  - `valid` in JSON reflects the same rule as the exit code (respects `--strict`).

`format` writes to `-o <path>` or stdout; a bare `-` input reads stdin (consistent
with `render`).

## What this unlocks

- **CLI-first feature development**: new capability lands in `core/`, gets a CLI
  command + `--json` output, is unit-tested headlessly in isolation, then is
  surfaced in the UI over IPC. This becomes the documented standing convention
  (core → CLI → IPC → UI).
- **CLI as core oracle**: `graphvizjs validate bug.dot --json` yields core's exact
  verdict. Matches the UI → the bug is in core. Diverges → it is the renderer or
  the IPC seam. Same for `format` vs the Format button.

## Testing

- **Core**: unit tests for `validateDiagram` (syntax + structural),
  `formatDot`, `scan-dot`, `dot-vocab`. Move the existing `scan-dot` /
  `structure-lint` / `format` unit tests into `test/core/`.
- **CLI**: unit tests for `validate` / `format` argument parsing, human + `--json`
  output, and exit codes (incl. `--strict`). Extend
  `test/cli/dist.integration.test.ts` to subprocess-run the new commands.
- **Renderer**: update `linting` tests for the combined `{ syntax, structural }`
  shape; update `language` / `autocomplete` tests for the vocabulary parameter.
- **E2E**: confirm the editor still shows both syntax and structural diagnostics
  (now sourced over IPC).

## Documentation

Update `.claude/CLAUDE.md`:
- Module boundaries — `core/` gains `scan-dot`, `dot-vocab`, `structure-lint`,
  `format`, `validate`; the renderer editor modules are parameterized; note the
  new IPC channels and CLI commands.
- The CLI Distributable section — new `validate` / `format` commands.
- "Adding Features" — add the **core → CLI → IPC → UI** workflow and the `--json`
  output convention.

## Risks & sequencing (within the refactor)

- **Async live linting** is a behavior change; verify no perceptible regression at
  the existing debounce.
- **Bootstrap vocabulary fetch** couples editor construction to one IPC
  round-trip; must complete before the editor is built.
- Land the relocation in dependency order so `graph:check` stays green at each
  step: (1) move pure modules into `core/` + repoint their tests; (2) add core
  `validateDiagram` / `formatDot` + IPC channels; (3) migrate renderer consumers
  and delete the local structural lint; (4) add CLI commands; (5) docs.

## Open questions

None. Decisions (a) `--strict`-gated warnings and (b) extend `render:validate` are
settled above.
