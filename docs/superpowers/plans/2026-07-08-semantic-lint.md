# DOT Semantic Lint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (Daniel's standing preference for this repo) to implement this plan task-by-task with two-stage review. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a semantic-lint layer for DOT — invalid values, typo did-you-mean, invalid colors, wrong-context attributes, duplicate/undefined checks — with one-click quick-fixes, built core-first and surfaced through the existing `validateDiagram` oracle and editor linter.

**Architecture:** All logic in `core/` (Node-only, CLI-exercised, unit-tested); the renderer only renders richer diagnostics + wires quick-fix code actions. Quick-fix payloads ride inside the existing `render:validate` diagnostics — **no new IPC channel**. A shared `core/dot-catalog.ts` (attribute contexts + value domains) is the foundation, reused later by IntelliSense and the attribute inspector.

**Tech Stack:** TypeScript (NodeNext ESM in `core/`/`cli/`; Vite in `src/`), Vitest + happy-dom, CodeMirror 6 lint, Biome.

## Global Constraints

- `core/` relative imports carry explicit `.js` extensions (NodeNext); `src/` imports do not.
- Layer rule (build-failing via `graph:check`): the renderer imports `core/` **only** as type-only `core/types`. All new logic lands in `core/`.
- New IPC surface must align across `contract.ts` → `preload.ts` → main handler → `platform/index.ts` (`graph:check` IPC integrity). This plan extends the existing `dot:vocabulary` channel; it adds no new channel.
- After every task: `pnpm test` (all pass), `pnpm typecheck` (clean), `pnpm graph:check` (exit 0), `pnpm docs:check` (exit 0). Run `pnpm graph` and commit regenerated `docs/architecture/` whenever the module graph changes. `pnpm lint:fix` before each commit.
- Biome: 2-space, single quotes, semicolons, trailing commas, 100-col, `const`, no `any`.
- Commit trailers: append the repo's `Co-Authored-By:` + `Claude-Session:` lines (omitted per-task below for brevity).
- **Fail-safe stance:** semantic checks never produce a false positive on valid DOT; when a check is unsure (esp. `wrong-context`), it emits nothing. Quick-fixes attach only to unambiguous single-token replacements; never auto-remove attributes.

---

## File Structure

**New core files:**
- `core/dot-colors.ts` — `DOT_COLORS`, `isColorAttribute` (relocated from `src/editor/dot-data.ts`).
- `core/dot-catalog.ts` — `DotAttributeSpec`, `DOT_ATTRIBUTE_CATALOG`, `findAttribute`.
- `core/edit-distance.ts` — bounded Levenshtein + nearest-match helper.
- `core/semantic-lint.ts` — the five semantic checks → `StructuralDiagnostic[]`.
- `core/apply-fixes.ts` — `applyFixes(source, diagnostics)`.

**Changed core:**
- `core/types.ts` — extend `StructuralDiagnostic` (`code?`, `fix?`), add `DiagnosticFix`, extend `DotVocabulary` (`attributeValues`, `colors`).
- `core/structure-lint.ts` — attach `code: 'unknown-attribute'` + did-you-mean `fix` to the existing unknown-attribute finding.
- `core/validate.ts` — fold semantic diagnostics into `validateDiagram`.

**IPC / renderer:**
- `src/platform/contract.ts`, `electron/preload.ts`, `electron/main.ts`, `src/platform/index.ts` — extend `dot:vocabulary` payload.
- `src/editor/autocomplete.ts` — consume value domains/colors from injected vocab.
- `src/editor/dot-data.ts` — delete relocated exports (keep the file only if snippets remain; else remove).
- `src/editor/linting.ts` — attach CodeMirror `actions` from `diagnostic.fix`.
- `src/main.ts` — vocab fetch already exists; now carries the extra fields.

**CLI:**
- `cli/args.ts` — add `--fix` to `validate`.
- `cli/index.ts` — apply fixes in the `validate` branch.

---

## Increment 1 — Attribute catalog + relocate value/color data to core

### Task 1: `core/dot-colors.ts`

**Files:** Create `core/dot-colors.ts`; Test `test/core/dot-colors.test.ts`.
**Interfaces — Produces:** `DOT_COLORS: readonly string[]`, `isColorAttribute(attr: string): boolean`.

- [ ] **Step 1: Create the module** — copy `DOT_COLORS`, `COLOR_ATTRIBUTES`, and `isColorAttribute` verbatim from `src/editor/dot-data.ts` into `core/dot-colors.ts` (no internal imports; no `.js` changes needed). Leave the originals in `dot-data.ts` for now (expand-contract).
- [ ] **Step 2: Test** — `test/core/dot-colors.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DOT_COLORS, isColorAttribute } from '../../core/dot-colors';
describe('dot-colors', () => {
  it('knows common colors', () => { expect(DOT_COLORS).toEqual(expect.arrayContaining(['black','red','blue'])); });
  it('identifies color-valued attributes', () => {
    expect(isColorAttribute('fillcolor')).toBe(true);
    expect(isColorAttribute('shape')).toBe(false);
  });
});
```
- [ ] **Step 3:** `npx vitest run test/core/dot-colors.test.ts` → PASS; `pnpm typecheck && pnpm graph && pnpm graph:check` → green.
- [ ] **Step 4: Commit** — `refactor(core): add core/dot-colors (relocated from renderer)`.

### Task 2: `core/dot-catalog.ts` + consistency test

**Files:** Create `core/dot-catalog.ts`; Test `test/core/dot-catalog.test.ts`.
**Interfaces:**
- Consumes: `core/dot-vocab` (`DOT_ATTRIBUTES`).
- Produces:
```ts
export type AttrContext = 'graph' | 'node' | 'edge' | 'cluster' | 'subgraph';
export type AttrType = 'enum' | 'color' | 'int' | 'double' | 'bool' | 'string' | 'point' | 'other';
export interface DotAttributeSpec {
  name: string; contexts: AttrContext[]; type: AttrType; values?: string[]; default?: string;
}
export const DOT_ATTRIBUTE_CATALOG: readonly DotAttributeSpec[];
export function findAttribute(name: string): DotAttributeSpec | undefined;  // case-insensitive
```

- [ ] **Step 1: Write the consistency test first** (`test/core/dot-catalog.test.ts`) — this guards the transcription:
```ts
import { describe, expect, it } from 'vitest';
import { DOT_ATTRIBUTES } from '../../core/dot-vocab';
import { DOT_ATTRIBUTE_CATALOG, findAttribute } from '../../core/dot-catalog';
describe('dot-catalog', () => {
  it('every catalog attribute is a known DOT attribute', () => {
    const attrs = new Set(DOT_ATTRIBUTES.map((a) => a.toLowerCase()));
    for (const s of DOT_ATTRIBUTE_CATALOG) expect(attrs.has(s.name.toLowerCase())).toBe(true);
  });
  it('enum specs carry a non-empty value domain; non-enum do not', () => {
    for (const s of DOT_ATTRIBUTE_CATALOG) {
      if (s.type === 'enum') expect(s.values && s.values.length > 0).toBe(true);
      else expect(s.values).toBeUndefined();
    }
  });
  it('every spec has at least one context', () => {
    for (const s of DOT_ATTRIBUTE_CATALOG) expect(s.contexts.length).toBeGreaterThan(0);
  });
  it('findAttribute is case-insensitive', () => {
    expect(findAttribute('SHAPE')?.name.toLowerCase()).toBe('shape');
    expect(findAttribute('definitely-not-an-attr')).toBeUndefined();
  });
  it('covers the common enum attributes with their domains', () => {
    expect(findAttribute('shape')?.values).toEqual(expect.arrayContaining(['box','ellipse','record']));
    expect(findAttribute('rankdir')?.values).toEqual(['TB','LR','BT','RL']);
    expect(findAttribute('dir')?.contexts).toContain('edge');
  });
});
```
- [ ] **Step 2: Run → FAIL** (module absent).
- [ ] **Step 3: Implement `core/dot-catalog.ts`.** Populate the common ~40–50 attributes with accurate `contexts`/`type`/`values`, transcribed from the Graphviz attributes table (https://graphviz.org/doc/info/attrs.html — "used by" column → contexts). Move the enum domains from `src/editor/dot-data.ts` `DOT_ATTR_VALUES` into the matching specs' `values`. Include at minimum: the 9 enum attrs from `DOT_ATTR_VALUES` (`shape`/N, `style`/NEC, `rankdir`/G, `dir`/E, `arrowhead`/E, `arrowtail`/E, `rank`/S, `splines`/G, `overlap`/G, `ratio`/G); the color attrs (`color`/NEC, `fillcolor`/NEC, `bgcolor`/GC, `fontcolor`/GNEC as `type:'color'`); and common non-enum attrs (`label`/GNEC string, `fontname`/GNEC string, `fontsize`/GNEC double, `penwidth`/NEC double, `weight`/E int, `constraint`/E bool, `lhead`/E string, `ltail`/E string, `peripheries`/NC int, `sides`/N int, `nodesep`/G double, `ranksep`/G string, `width`/N double, `height`/N double). `findAttribute` = case-insensitive `.find`.
- [ ] **Step 4: Run → PASS**; `pnpm typecheck && pnpm graph && pnpm graph:check` → green.
- [ ] **Step 5: Commit** — `feat(core): add DOT attribute catalog (contexts + value domains)`.

### Task 3: Extend `dot:vocabulary` with value domains + colors; migrate renderer; delete `dot-data` originals

**Files:** Modify `core/types.ts`, `electron/main.ts`, `electron/preload.ts`, `src/platform/contract.ts`, `src/platform/index.ts`, `src/editor/autocomplete.ts`, `src/editor/dot-data.ts`; Tests `test/platform/index.test.ts`, `test/editor/autocomplete.test.ts`, `test/editor/dot-data.test.ts`.
**Interfaces — Produces:** `DotVocabulary` gains `attributeValues: Record<string, string[]>` and `colors: string[]`.

- [ ] **Step 1: Extend the type** (`core/types.ts`):
```ts
export interface DotVocabulary {
  keywords: string[];
  attributes: string[];
  attributeValues: Record<string, string[]>;  // enum attr name → domain
  colors: string[];
}
```
- [ ] **Step 2: Main handler** (`electron/main.ts`) — build the extra fields from the catalog + colors:
```ts
import { DOT_ATTRIBUTE_CATALOG } from '../core/dot-catalog';
import { DOT_COLORS } from '../core/dot-colors';
// in the dot:vocabulary handler:
ipcMain.handle('dot:vocabulary', () => ({
  keywords: [...DOT_KEYWORDS],
  attributes: [...DOT_ATTRIBUTES],
  attributeValues: Object.fromEntries(
    DOT_ATTRIBUTE_CATALOG.filter((s) => s.type === 'enum' && s.values).map((s) => [s.name, [...s.values!]])
  ),
  colors: [...DOT_COLORS],
}));
```
(`preload.ts` / `contract.ts` need no change beyond the return type flowing through `DotVocabulary`; the channel signature is unchanged.)
- [ ] **Step 3: Migrate autocomplete** (`src/editor/autocomplete.ts`) — replace the `import { DOT_ATTR_VALUES, DOT_COLORS, isColorAttribute } from './dot-data'` with use of `vocab.attributeValues`, `vocab.colors`, and a local `isColorAttribute` (a color attr is one whose name is in a small renderer set, or expose it via the catalog — simplest: keep an `isColorAttribute` helper reading `vocab.colors` is wrong; instead pass color-attr detection by checking `vocab.attributeValues` has no entry AND the name is a known color attr). **Concretely:** the completion source, when at a value position, looks up `vocab.attributeValues[attr]`; for color attrs (name ∈ a `COLOR_ATTRS` constant kept locally, or derived) offer `vocab.colors`. Thread `vocab` (already a parameter of `makeDotCompletionSource`).
- [ ] **Step 4: Update tests** — `test/editor/autocomplete.test.ts`: build the test `VOCAB` with `attributeValues`/`colors` (import from `core/dot-catalog`/`core/dot-colors`). `test/platform/index.test.ts`: `dotVocabulary` mock returns the new shape.
- [ ] **Step 5: Delete relocated originals** from `src/editor/dot-data.ts` (`DOT_ATTR_VALUES`, `DOT_COLORS`, `COLOR_ATTRIBUTES`, `isColorAttribute`). If nothing remains, `git rm src/editor/dot-data.ts` and drop `test/editor/dot-data.test.ts` (its assertions moved to `test/core/dot-catalog.test.ts` + `test/core/dot-colors.test.ts`); otherwise trim.
- [ ] **Step 6: Gate** — `pnpm test && pnpm typecheck && pnpm graph && pnpm graph:check` green. Confirm no `src/` file imports the deleted `dot-data` symbols (`git grep -n "DOT_ATTR_VALUES\|DOT_COLORS\|isColorAttribute" -- src/`).
- [ ] **Step 7: Commit** — `refactor: relocate DOT value domains + colors to core; dot:vocabulary carries them`.

---

## Increment 2 — Semantic checks + fix application (pure core)

### Task 4: `core/edit-distance.ts`

**Files:** Create `core/edit-distance.ts`; Test `test/core/edit-distance.test.ts`.
**Interfaces — Produces:** `editDistance(a: string, b: string): number`; `nearest(word: string, candidates: readonly string[], maxDistance?: number): string | undefined` (returns the unique nearest within `maxDistance` (default 2); `undefined` if none or a tie).

- [ ] **Step 1: Write failing tests** — distance basics (`editDistance('shp','shape')` small; identical = 0); `nearest('shp', ['shape','style','color'])` → `'shape'`; `nearest('zzzz', ['shape'])` → `undefined` (beyond max); tie → `undefined`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — standard iterative Levenshtein (bounded), and `nearest` scanning candidates for the min distance ≤ `maxDistance`, returning `undefined` on no match or a tie (two candidates at the same min distance).
- [ ] **Step 4: Run → PASS**; typecheck + graph green.
- [ ] **Step 5: Commit** — `feat(core): add bounded edit-distance + nearest-match helper`.

### Task 5: extend the diagnostic model + `core/apply-fixes.ts`

**Files:** Modify `core/types.ts`; Create `core/apply-fixes.ts`; Test `test/core/apply-fixes.test.ts`.
**Interfaces — Produces:**
```ts
// core/types.ts
export interface DiagnosticFix { from: number; to: number; text: string; label: string; }
export interface StructuralDiagnostic {
  from: number; to: number; severity: 'error' | 'warning'; message: string;
  code?: string; fix?: DiagnosticFix;
}
// core/apply-fixes.ts
export function applyFixes(source: string, diagnostics: StructuralDiagnostic[]): string;
```

- [ ] **Step 1: Extend `StructuralDiagnostic`** in `core/types.ts` with optional `code` and `fix`, and add `DiagnosticFix`. (Optional → backward compatible; `structure-lint`/`validate`/renderer keep compiling.)
- [ ] **Step 2: Write failing tests** for `applyFixes`:
```ts
import { describe, expect, it } from 'vitest';
import { applyFixes } from '../../core/apply-fixes';
const d = (from, to, text) => ({ from, to, severity: 'warning' as const, message: '', code: 'x', fix: { from, to, text, label: '' } });
describe('applyFixes', () => {
  it('applies a single fix', () => { expect(applyFixes('a [shp=box]', [d(3,6,'shape')])).toBe('a [shape=box]'); });
  it('applies multiple non-overlapping fixes regardless of order', () => {
    const s = 'a [shp=box, dirr=both]';
    const out = applyFixes(s, [d(3,6,'shape'), d(11,15,'dir')]);
    expect(out).toBe('a [shape=box, dir=both]');
  });
  it('skips overlapping fixes (first-wins by start offset)', () => {
    const out = applyFixes('abcdef', [d(1,4,'X'), d(2,5,'Y')]);
    expect(out).toBe('aXef');
  });
  it('ignores diagnostics without a fix', () => { expect(applyFixes('abc', [{from:0,to:1,severity:'warning',message:'',code:'x'}])).toBe('abc'); });
});
```
- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implement `applyFixes`** — collect `d.fix` payloads, sort by `from` ascending, drop any whose range overlaps an already-accepted fix, then apply the accepted set right-to-left (descending `from`) so earlier offsets stay valid.
- [ ] **Step 5: Run → PASS**; typecheck + graph green.
- [ ] **Step 6: Commit** — `feat(core): quick-fix payload on diagnostics + applyFixes`.

### Task 6: `core/semantic-lint.ts` — value / color / typo checks

**Files:** Create `core/semantic-lint.ts`; Test `test/core/semantic-lint.test.ts`.
**Interfaces:**
- Consumes: `core/scan-dot`, `core/dot-catalog`, `core/dot-colors`, `core/edit-distance`, `core/types`.
- Produces: `semanticDiagnostics(source: string): StructuralDiagnostic[]`.

- [ ] **Step 1: Write failing tests** (fixtures):
  - `invalid-value`: `a [shape=blorp]` → a `warning` `code:'invalid-value'` on `blorp`; if near a valid value, a `fix` to it. `a [shape=box]` → none.
  - `invalid-color`: `a [color=rd]` → `code:'invalid-color'`; `a [color=red]` → none; `a [color="#ff0000"]` → none (hex allowed).
  - typo value did-you-mean: `a [rankdir=TP]` → suggestion `TB` via `fix`.
  - No false positive: `a [label="anything goes"]` (string type) → none.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement value/color/typo rules** — reuse `structure-lint`'s attribute-list walk (extract the shared span/attr-entry scan into a small helper or import `parseAttrEntries` if exported; otherwise re-walk with `scanDot`). For each `attr=value` entry where `findAttribute(attr)` is an `enum`: if `value` ∉ `values`, emit `invalid-value` with `fix` = `nearest(value, values)` when found. For `color`-typed attrs (or `isColorAttribute`): accept hex (`/^#[0-9a-fA-F]{3,8}$/`), `rgb(...)`, HSV triples, or a name in `DOT_COLORS`; else `invalid-color` with `nearest(value, DOT_COLORS)`. Values that are quoted strings/HTML are exempt for string-typed attrs. Fail-safe: unknown attr or unknown type → no value check here.
- [ ] **Step 4: Run → PASS**; typecheck + graph green.
- [ ] **Step 5: Commit** — `feat(core): semantic-lint value/color/typo checks`.

### Task 7: `core/semantic-lint.ts` — wrong-context (conservative heuristic)

**Files:** Modify `core/semantic-lint.ts`; extend `test/core/semantic-lint.test.ts`.

- [ ] **Step 1: Write failing tests** — positive: `a -> b [shape=box]` → `wrong-context` on `shape` (node-only attr on an edge); `graph [rankdir=LR]` fine; `x [rankdir=LR]` → `wrong-context` (graph-only on a node). **Negative (must stay silent):** valid docs like `digraph { rankdir=LR; a [shape=box]; a -> b [color=red]; subgraph cluster0 { label="c" } }` → **zero** `wrong-context` diagnostics. Ambiguous shapes → silent.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement the heuristic** — classify each `[…]` list's context by its preceding statement token(s) from the scanner: preceded by an edge op (`->`/`--`) chain → `edge`; a leading `node`/`edge`/`graph` keyword → that default context; a bare top-level `attr=val` (no brackets) → `graph`; a plain identifier then `[` → `node`; inside a `subgraph cluster… {` header → `cluster`. For each attribute in a confidently-classified list, if `findAttribute(attr).contexts` excludes that context, emit `wrong-context` (no `fix` — removal is destructive). If classification is uncertain, emit nothing. Add a "valid-DOT corpus → no wrong-context" test with several real diagrams from `src/examples/`.
- [ ] **Step 4: Run → PASS**; typecheck + graph green.
- [ ] **Step 5: Commit** — `feat(core): semantic-lint wrong-context (conservative heuristic)`.

### Task 8: `core/semantic-lint.ts` — duplicate-attribute + undefined-cluster

**Files:** Modify `core/semantic-lint.ts`; extend the test.

- [ ] **Step 1: Write failing tests** — `a [color=red, color=blue]` → `duplicate-attribute` on the second `color`. `a -> b [lhead=cluster9]` with no `subgraph cluster9` → `undefined-cluster`; with `subgraph cluster9 {}` present → none.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — within each attribute list, flag a repeated attribute name (`duplicate-attribute`, no fix — ambiguous which wins). Collect declared cluster/subgraph names (`subgraph <name> {`), then flag any `lhead`/`ltail` value not in that set (`undefined-cluster`, no fix). Fail-safe on parse ambiguity.
- [ ] **Step 4: Run → PASS**; typecheck + graph green.
- [ ] **Step 5: Commit** — `feat(core): semantic-lint duplicate-attribute + undefined-cluster`.

---

## Increment 3 — Fold into the oracle + CLI `--fix`

### Task 9: fold semantic diagnostics into `validateDiagram`

**Files:** Modify `core/validate.ts`; Test `test/core/validate-diagram.test.ts`.

- [ ] **Step 1: Update the test** — `validateDiagram('digraph { a [shape=blorp] }')` → `structural` contains an `invalid-value` diagnostic with a `fix`; a valid diagram → still `structural: []`.
- [ ] **Step 2: Compose** — in `core/validate.ts`, `structural = [...structuralDiagnostics(source), ...semanticDiagnostics(source)]`. (Keep `structuralDiagnostics` as-is; semantic is additive. De-dup only if a case double-reports; otherwise leave.)
- [ ] **Step 3: Run → PASS**; full `pnpm test` + typecheck + graph green.
- [ ] **Step 4: Commit** — `feat(core): validateDiagram includes semantic diagnostics`.

### Task 10: CLI `validate --fix`

**Files:** Modify `cli/args.ts`, `cli/index.ts`; Tests `test/cli/args.test.ts`, `test/cli/cli.integration.test.ts`, `test/cli/dist.integration.test.ts`.

- [ ] **Step 1: Args test first** — `parseArgs(['validate','in.dot','--fix','-o','out.dot'])` → `{ command:'validate', fix:true, output:'out.dot' }`. Add `fix?: boolean` to `ParsedArgs`; accept `--fix` (and `-o` for validate when `--fix`).
- [ ] **Step 2: Integration test** — `main(['validate', warnFile, '--fix', '-o', out])` writes DOT with `shp`→`shape` applied; exit 0. `--json` output includes `code`/`fix` on a diagnostic.
- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implement** — in `cli/index.ts` `validate` branch: after `validateDiagram`, if `parsed.fix`, `const fixed = applyFixes(dot, structural); write to output (-o) or stdout; return 0`. Otherwise the existing report path, now emitting `code`/`fix` in `--json` (extend the `structural.map(...)` to include `code` and `fix`). Update `USAGE`.
- [ ] **Step 5: dist integration** — add a `validate --json` case asserting a `code` is present for a known-bad input.
- [ ] **Step 6: Run → PASS**; full gate green.
- [ ] **Step 7: Commit** — `feat(cli): validate --fix + code/fix in --json`.

---

## Increment 4 — Editor quick-fix code actions

### Task 11: CodeMirror actions in `src/editor/linting.ts`

**Files:** Modify `src/editor/linting.ts`; Test `test/editor/linting.test.ts`.

- [ ] **Step 1: Update the linting test** — a `structural` diagnostic carrying a `fix` produces a CodeMirror `Diagnostic` whose `actions[0]` applies the replacement (assert the doc changes to the fixed text after invoking `actions[0].apply(view, from, to)`); a diagnostic without `fix` yields no actions.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — in `createDotLintSource`, when mapping a structural diagnostic that has `d.fix`, set `actions: [{ name: d.fix.label, apply: (view) => view.dispatch({ changes: { from: d.fix!.from, to: d.fix!.to, insert: d.fix!.text } }) }]` (clamp offsets to current doc length, as the existing structural mapping does).
- [ ] **Step 4: Run → PASS**; full gate green.
- [ ] **Step 5: Commit** — `feat(editor): quick-fix code actions from semantic-lint diagnostics`.

---

## Increment 5 — Documentation

### Task 12: docs + final verification

**Files:** Modify `.claude/CLAUDE.md`, `CHANGELOG.md`, `docs/architecture/COMPONENTS.md` (+ regen), `docs/planning/ROADMAP.md`.

- [ ] **Step 1: CLAUDE.md** — module boundaries: `core/` gains `dot-catalog`, `dot-colors`, `edit-distance`, `semantic-lint`, `apply-fixes`; note `dot:vocabulary` now carries value domains/colors; note `validate --fix`. Add a "New lint rule" recipe under Adding Features.
- [ ] **Step 2: COMPONENTS.md** — document the new core modules (so `docs:check` passes — it requires every module named; the new files are in the `core` module, already named, but add per-file entries for discoverability).
- [ ] **Step 3: CHANGELOG** — `[Unreleased]`: semantic lint (5 rule families) + quick-fixes + `validate --fix`.
- [ ] **Step 4: ROADMAP** — move "Semantic lint" from Backlog Tier 2 to Shipped.
- [ ] **Step 5: Final gate** — `pnpm lint && pnpm typecheck && pnpm test && pnpm graph:check && pnpm docs:check && pnpm build && pnpm build:cli`. Regenerate `pnpm graph` and commit `docs/architecture/`.
- [ ] **Step 6: Commit** — `docs: semantic lint + validate --fix; ROADMAP/CHANGELOG/architecture`.

---

## Self-Review (author)

**Spec coverage:** catalog + relocation (Tasks 1–3) · edit distance (4) · diagnostic model + applyFixes (5) · value/color/typo (6) · wrong-context heuristic (7) · dup/undefined (8) · oracle fold (9) · CLI `--fix` + `code`/`fix` json (10) · editor code actions (11) · docs incl. ROADMAP move (12). Every spec section maps to a task.

**Placeholder scan:** each code step shows concrete code or an exact instruction; catalog *data* is specified by shape + a mandated minimum attribute set + a consistency test that fails until it's populated (not a placeholder — a guarded contract).

**Type consistency:** `StructuralDiagnostic.{code,fix}` and `DiagnosticFix` defined once in `core/types.ts` (Task 5) and consumed by semantic-lint (6–8), applyFixes (5), validate (9), CLI (10), linting (11). `DotVocabulary.{attributeValues,colors}` defined in Task 3 and consumed by the main handler + autocomplete. `semanticDiagnostics`/`applyFixes`/`findAttribute`/`nearest`/`editDistance` names stable across tasks.

**Green-at-every-commit:** Increment 1 uses expand-contract (add core copies, migrate consumers, delete originals in Task 3). Optional `code`/`fix` keep every intermediate compiling. Semantic checks are additive to `validateDiagram` (Task 9), so nothing breaks before the fold.
