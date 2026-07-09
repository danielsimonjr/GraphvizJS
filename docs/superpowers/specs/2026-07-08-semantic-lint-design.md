# Semantic lint for DOT (full scope + quick-fixes)

**Date:** 2026-07-08
**Status:** Approved (design) — pending implementation plan
**Author:** Daniel Simon Jr. (with Claude)

## Problem

GraphvizJS today catches only two classes of DOT problem: Graphviz **syntax** errors
(`core/render.ts` `validateDot`) and a thin **structural** pass (`core/structure-lint.ts`
`structuralDiagnostics`) that checks delimiter balance and unknown attribute *names*. It
does not understand DOT *semantics*: an invalid attribute value (`shape=blorp`), an
attribute used in the wrong place (a node-only attribute on an edge), a mistyped color, a
reference to an undefined cluster, or a duplicate attribute. Engineers hit these
constantly, and Graphviz frequently ignores them silently rather than erroring — so the
editor never surfaces them.

This spec adds a **semantic lint** layer, core-first, that flows through the existing
`validateDiagram` oracle and the editor's linter, plus **quick-fixes** the user can apply
with one click (and the CLI can apply headlessly).

## Decisions (confirmed)

- **Full scope.** Five rule families: invalid values, typo did-you-mean, invalid color,
  wrong-context attributes, duplicate/undefined checks.
- **Quick-fixes in v1.** Diagnostics carry a machine-readable fix payload; the CLI applies
  fixes via `validate --fix`; the editor exposes CodeMirror code actions.
- **Catalog depth: common attributes first.** v1 encodes the common ~40–50 attributes with
  full metadata (contexts + value domains); the rest stay name-only in `dot-vocab`. The
  catalog grows over time. Guarded by an internal-consistency test.
- **Wrong-context: conservative heuristic.** Detect statement context from the existing
  scanner (no full DOT parser); only flag when confident — never a false positive on valid
  DOT, matching the current structural-lint's fail-safe stance.

## Architecture

The layering is unchanged: all logic lands in `core/` (Node-only, testable, CLI-exposed);
the renderer consumes richer diagnostics over the existing `render:validate` IPC and adds
only presentation (code actions). No new IPC channel.

### 1. The attribute catalog — `core/dot-catalog.ts`

The shared source of truth for attribute metadata (reused later by IntelliSense and the
attribute inspector). Pure data + lookup helpers.

```ts
export type AttrContext = 'graph' | 'node' | 'edge' | 'cluster' | 'subgraph';
export type AttrType = 'enum' | 'color' | 'int' | 'double' | 'bool' | 'string' | 'point' | 'other';

export interface DotAttributeSpec {
  name: string;
  contexts: AttrContext[];   // Graphviz "used by" (G/N/E/C/S)
  type: AttrType;
  values?: string[];         // enum domain (present when type === 'enum')
  default?: string;
}

export const DOT_ATTRIBUTE_CATALOG: readonly DotAttributeSpec[];
export function findAttribute(name: string): DotAttributeSpec | undefined;  // case-insensitive
```

- **Sourcing.** Transcribe once from the canonical Graphviz attributes table. v1 populates
  the common ~40–50 (`shape`, `label`, `color`, `fillcolor`, `style`, `rankdir`, `dir`,
  `arrowhead`/`arrowtail`, `rank`, `splines`, `overlap`, `ratio`, `fontcolor`, `fontname`,
  `fontsize`, `penwidth`, `weight`, `constraint`, `lhead`/`ltail`, `peripheries`, `sides`,
  `nodesep`, `ranksep`, …). Attributes not in the catalog remain valid names via
  `DOT_ATTRIBUTES` (`dot-vocab`) but get no value/context checks.
- **Relocation.** The renderer's value-domain data moves into core and folds into the
  catalog: `DOT_ATTR_VALUES` → the catalog's `values`; `DOT_COLORS` and `isColorAttribute`
  → a `core/dot-colors.ts` (or catalog `type: 'color'`). This mirrors the v2.6.0 vocab
  relocation. The renderer's `dot-data.ts` autocomplete keeps consuming them — over the
  existing `dot:vocabulary` IPC, extended to carry value domains, OR the renderer's
  autocomplete is refactored to fetch them (decided in the plan; either keeps renderer
  purity).
- **Consistency test** (`test/core/dot-catalog.test.ts`): every catalog `name` ∈
  `DOT_ATTRIBUTES`; every `enum` spec has non-empty `values`; every relocated
  `DOT_ATTR_VALUES` key resolves to a catalog `enum` attribute. This is the guard against
  transcription drift.

### 2. Semantic checks — `core/semantic-lint.ts`

A pure function returning the extended diagnostics. Composes with the existing
`structuralDiagnostics` (which keeps balance + unknown-name); the new module adds the
semantic rules. Each diagnostic carries a `code` and, where a correction is unambiguous, a
`fix`.

| `code` | Detects | Fix (when unambiguous) |
|---|---|---|
| `unknown-attribute` | attribute name not in `DOT_ATTRIBUTES` | did-you-mean nearest catalog name (edit distance ≤ 2) |
| `invalid-value` | value ∉ the attribute's enum domain | nearest valid value (edit distance ≤ 2) |
| `invalid-color` | `color`-typed attribute with unrecognized color | nearest known color, if close |
| `wrong-context` | attribute's `contexts` exclude the current statement context | none (removal is too destructive to auto-apply) |
| `duplicate-attribute` | same attribute repeated in one `[…]` list | none (ambiguous which wins) |
| `undefined-cluster` | `lhead`/`ltail=clusterX` with no `subgraph clusterX {…}` | none |

- **Edit distance:** a small Levenshtein in core (`core/edit-distance.ts` or inline);
  suggestions only when distance ≤ 2 and unique, to avoid noisy/wrong fixes.
- **Wrong-context heuristic:** walk statements using `scan-dot` spans; classify each `[…]`
  list's context — edge if it follows a `->`/`--` chain; `node`/`edge`/`graph` keyword
  defaults; bare top-level `attr=val` = graph; otherwise node. Only emit `wrong-context`
  when the classification is confident (unambiguous statement shape); skip otherwise. Never
  flag valid DOT.

### 3. Diagnostic model — extend `StructuralDiagnostic` (`core/types.ts`)

```ts
export interface DiagnosticFix {
  from: number; to: number;  // replacement range (character offsets)
  text: string;              // replacement text
  label: string;             // human action, e.g. "Change 'shp' to 'shape'"
}

export interface StructuralDiagnostic {
  from: number; to: number;
  severity: 'error' | 'warning';
  message: string;
  code?: string;             // NEW — machine-readable rule id
  fix?: DiagnosticFix;       // NEW — quick-fix payload
}
```

New fields are **optional**, so `DiagramDiagnostics` / `render:validate` / `validate --json`
shapes stay backward-compatible; existing consumers ignore the new fields.

### 4. Fix application — `core/apply-fixes.ts`

```ts
export function applyFixes(source: string, diagnostics: StructuralDiagnostic[]): string;
```

Applies all `fix` payloads to `source` (right-to-left by offset so ranges don't shift),
skipping overlapping fixes. Pure and unit-tested — this is the **oracle for quick-fixes**:
the exact same function backs `validate --fix` and (per-diagnostic) the editor code action.

### 5. CLI — enrich `validate`, add `--fix`

- `validate --json` output already carries `structural[]`; each entry now includes `code`
  and optional `fix` (line/column derived as today via `offsetToLineCol`, plus the raw
  offsets for tooling).
- **New flag** `validate <in> --fix [-o <out>]`: runs `validateDiagram`, applies
  `applyFixes`, writes the corrected DOT to `-o` (or stdout). Exit `0` if it wrote,
  regardless of remaining unfixable warnings (or `--strict` semantics as today). This makes
  the fix logic fully CLI-testable before any UI.

### 6. Renderer — CodeMirror code actions (`src/editor/linting.ts`)

`createDotLintSource` already maps `structural[]` → CodeMirror `Diagnostic`s. Extend it: when
a diagnostic has a `fix`, attach `actions: [{ name: fix.label, apply(view) { view.dispatch({
changes: { from: fix.from, to: fix.to, insert: fix.text } }); } }]`. Pure presentation; the
fix payload arrives inside the diagnostic over the existing `render:validate` IPC — **no new
IPC channel, no new vocab fetch.**

## Sequencing (core → CLI → UI increments)

1. **Catalog** — `core/dot-catalog.ts` + relocate value/color data + consistency test.
2. **Checks** — `core/semantic-lint.ts` (5 rules) + `core/apply-fixes.ts`, unit-tested
   against DOT fixtures.
3. **Oracle** — fold semantic checks into `validateDiagram`; enrich `validate --json`; add
   `validate --fix`. CLI + dist integration tests. Ships real value **entirely headless**.
4. **UI** — code actions in `linting.ts`; renderer tests.
5. **Docs** — CLAUDE.md (semantic-lint, `validate --fix`, the catalog), CHANGELOG,
   `docs:check` (new `core` files must appear in COMPONENTS.md), regenerate architecture docs.

Each increment is independently shippable and guarded (`pnpm test`, `graph:check`,
`docs:check`).

## Testing

- **Core:** per-rule fixtures for each `code` (positive + negative, incl. "no false positive
  on valid DOT" for `wrong-context`); `applyFixes` (single, multiple, overlapping, offset
  stability); catalog consistency.
- **CLI:** `validate --json` includes `code`/`fix`; `validate --fix` corrects a known input;
  extend `dist.integration.test.ts`.
- **Renderer:** `linting.test.ts` — a `fix`-bearing diagnostic yields a CodeMirror action
  that applies the replacement.

## Risks & mitigations

- **Catalog accuracy** (transcription): mitigated by the consistency test + starting with the
  common subset; wrong data → a false lint, so conservatism matters.
- **Wrong-context false positives**: mitigated by the confident-only heuristic and a
  dedicated "valid DOT produces no wrong-context" test corpus; when unsure, emit nothing.
- **Fix safety**: only attach `fix` to unambiguous single-token replacements (name/value/
  color typos); never auto-remove attributes. `applyFixes` skips overlaps.
- **Renderer purity**: all logic stays in `core/`; the renderer only wires the fix payload to
  a CodeMirror action — `graph:check` still enforces the boundary.

## Open questions

None blocking. The renderer autocomplete's continued access to value domains after the
`DOT_ATTR_VALUES` relocation (extend `dot:vocabulary` vs a small refactor) is an
implementation detail resolved in the plan; both preserve renderer purity.
