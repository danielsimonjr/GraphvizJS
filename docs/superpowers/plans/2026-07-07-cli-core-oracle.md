# CLI-first workflow + validate/format core oracles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate all pure DOT language substance into `core/` and add `graphvizjs validate`/`format` CLI commands, so the CLI and renderer share one implementation and the CLI is a machine-readable oracle for troubleshooting the UI.

**Architecture:** Expand-contract refactor. First add the pure modules to `core/` and the new IPC channels (additive, renderer untouched). Then migrate each renderer consumer to reach core over IPC. Finally delete the now-unused renderer originals. `pnpm graph:check` and the full test suite stay green at every commit.

**Tech Stack:** TypeScript (NodeNext ESM in `core/`+`cli/`, Vite in `src/`), Vitest + happy-dom, Electron IPC, `@hpcc-js/wasm`, Biome.

## Global Constraints

- Relative imports within `core/` and `cli/` MUST carry explicit `.js` extensions (NodeNext). Renderer (`src/`) imports do NOT.
- Layer rule (`tools/dependency-graph/rules.ts`, build-failing): the renderer may import `core/` **only** as a type-only import of `core/types.ts`. No other `core/` import — not even type-only — is allowed from `src/`.
- Every new IPC method must line up across `src/platform/contract.ts`, `electron/preload.ts`, the `electron/main.ts` handler, and `src/platform/index.ts`, or `graph:check` fails (IPC integrity).
- Code style: Biome — 2-space indent, single quotes, semicolons, trailing commas (ES5), 100-col, `const` over `let`, no `any`. Run `pnpm lint:fix` before each commit.
- After every task: `pnpm test` (all pass), `pnpm typecheck` (clean), `pnpm graph:check` (exit 0). A task is not done until all three are green.
- Commit messages end with the two trailer lines used across this repo (`Co-Authored-By:` + `Claude-Session:`); omitted from the per-task snippets below for brevity — append them.

---

## File Structure

**New core files (pure, no DOM, no Node natives):**
- `core/scan-dot.ts` — literal-aware span scanner (`scanDot`, `checkBalance`, `Span`, `SpanKind`).
- `core/dot-vocab.ts` — `DOT_ATTRIBUTES`, `DOT_KEYWORDS`.
- `core/structure-lint.ts` — `structuralDiagnostics`, `StructuralDiagnostic`.
- `core/format.ts` — `formatDot`, `FormatOptions`.
- `core/validate.ts` — `validateDiagram`, `DiagramDiagnostics` (orchestrator).

**Changed core:**
- `core/types.ts` — add `DotVocabulary` (so both layers may type-only import the shape).

**IPC (4-point wiring each):**
- `src/platform/contract.ts`, `electron/preload.ts`, `electron/main.ts`, `src/platform/index.ts`.

**Renderer migration:**
- `src/toolbar/format.ts` — call `formatDot` IPC (async).
- `src/editor/language.ts`, `src/editor/autocomplete.ts` — take vocab as a parameter.
- `src/editor/linting.ts` — consume `{ syntax, structural }`; drop `createStructureLintSource`.
- `src/main.ts` — bootstrap fetches vocab, passes it into the editor build.
- `src/editor/dot-data.ts` — keep snippets only.

**Deletions (final task of Phase 3):**
- `src/editor/scan-dot.ts`, `src/editor/format.ts`, `src/editor/structure-lint.ts` and their `test/editor/*` tests.

**CLI:**
- `cli/args.ts`, `cli/index.ts`, `test/cli/*`.

---

## Phase 1 — Core gains the pure language substance (additive)

### Task 1: `core/scan-dot.ts`

**Files:**
- Create: `core/scan-dot.ts`
- Test: `test/core/scan-dot.test.ts`

**Interfaces:**
- Produces: `scanDot(source: string): Span[]`, `checkBalance(source): { balanced: boolean; error?: { pos: number; message: string } }`, `interface Span { kind: SpanKind; from: number; to: number; closed: boolean }`, `type SpanKind = 'code' | 'string' | 'html' | 'comment'`.

- [ ] **Step 1: Copy the module verbatim.** Copy the entire current contents of `src/editor/scan-dot.ts` into a new `core/scan-dot.ts`, byte-for-byte. It imports nothing internal, so no edits are needed. (The renderer original stays in place for now — this is the expand phase.)

- [ ] **Step 2: Copy the tests.** Copy `test/editor/scan-dot.test.ts` to `test/core/scan-dot.test.ts`; change the import specifier from `'../../src/editor/scan-dot'` to `'../../core/scan-dot'`.

- [ ] **Step 3: Run the copied tests.**
Run: `npx vitest run test/core/scan-dot.test.ts`
Expected: PASS (all cases, identical to the editor copy).

- [ ] **Step 4: Verify guards.**
Run: `pnpm typecheck && pnpm graph:check`
Expected: both exit 0 (a new intra-core module; renderer still uses its own copy).

- [ ] **Step 5: Commit.**
```bash
pnpm lint:fix
git add core/scan-dot.ts test/core/scan-dot.test.ts
git commit -m "refactor(core): add core/scan-dot (copy of renderer scanner)"
```

### Task 2: `core/dot-vocab.ts` + `DotVocabulary` type

**Files:**
- Create: `core/dot-vocab.ts`
- Modify: `core/types.ts` (append)
- Test: `test/core/dot-vocab.test.ts`

**Interfaces:**
- Produces: `DOT_KEYWORDS: readonly string[]`, `DOT_ATTRIBUTES: readonly string[]` (in `core/dot-vocab.ts`); `interface DotVocabulary { keywords: string[]; attributes: string[] }` (in `core/types.ts`).

- [ ] **Step 1: Create `core/dot-vocab.ts`.** Copy the `DOT_KEYWORDS` and `DOT_ATTRIBUTES` array declarations verbatim from `src/editor/dot-data.ts` (only those two exports; leave the snippet data behind). Header comment: `/** Canonical DOT vocabulary — single source of truth for highlighting, autocomplete, linting. */`.

- [ ] **Step 2: Add the shape to `core/types.ts`.** Append:
```ts
/** DOT vocabulary handed to the renderer over IPC for highlighting/autocomplete. */
export interface DotVocabulary {
  keywords: string[];
  attributes: string[];
}
```

- [ ] **Step 3: Write the test.** `test/core/dot-vocab.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DOT_ATTRIBUTES, DOT_KEYWORDS } from '../../core/dot-vocab';

describe('dot-vocab', () => {
  it('exposes the core DOT keywords', () => {
    expect(DOT_KEYWORDS).toContain('digraph');
    expect(DOT_KEYWORDS).toContain('subgraph');
  });
  it('exposes common DOT attributes, lowercased-unique', () => {
    expect(DOT_ATTRIBUTES).toContain('color');
    expect(DOT_ATTRIBUTES).toContain('label');
    const lower = DOT_ATTRIBUTES.map((a) => a.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });
});
```

- [ ] **Step 4: Run + guards.**
Run: `npx vitest run test/core/dot-vocab.test.ts && pnpm typecheck && pnpm graph:check`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit.**
```bash
pnpm lint:fix
git add core/dot-vocab.ts core/types.ts test/core/dot-vocab.test.ts
git commit -m "refactor(core): add core/dot-vocab + DotVocabulary type"
```

### Task 3: `core/structure-lint.ts`

**Files:**
- Create: `core/structure-lint.ts`
- Test: `test/core/structure-lint.test.ts`

**Interfaces:**
- Consumes: `core/scan-dot` (`scanDot`, `checkBalance`), `core/dot-vocab` (`DOT_ATTRIBUTES`).
- Produces: `structuralDiagnostics(source: string): StructuralDiagnostic[]`, `interface StructuralDiagnostic { from: number; to: number; severity: 'error' | 'warning'; message: string }`.

- [ ] **Step 1: Copy the pure logic.** Copy the contents of `src/editor/structure-lint.ts` into `core/structure-lint.ts`, but include ONLY: the `StructuralDiagnostic` interface, `ATTR_SET`, `structuralDiagnostics`, the `AttrEntry` interface, and `parseAttrEntries`. **Omit** the CodeMirror-dependent `createStructureLintSource` and its `Diagnostic`/`LintSource`/`EditorView` imports. Change the two internal imports to core with `.js` extensions:
```ts
import { DOT_ATTRIBUTES } from './dot-vocab.js';
import { checkBalance, scanDot } from './scan-dot.js';
```

- [ ] **Step 2: Copy the tests.** Copy `test/editor/structure-lint.test.ts` to `test/core/structure-lint.test.ts`; repoint the import to `'../../core/structure-lint'`. Remove any test of `createStructureLintSource` (that wrapper is renderer-only and is being deleted; if such tests exist, they move to Task 10's linting test). Keep all `structuralDiagnostics` tests.

- [ ] **Step 3: Run + guards.**
Run: `npx vitest run test/core/structure-lint.test.ts && pnpm typecheck && pnpm graph:check`
Expected: PASS, exit 0.

- [ ] **Step 4: Commit.**
```bash
pnpm lint:fix
git add core/structure-lint.ts test/core/structure-lint.test.ts
git commit -m "refactor(core): add core/structure-lint (pure structural analysis)"
```

### Task 4: `core/format.ts`

**Files:**
- Create: `core/format.ts`
- Test: `test/core/format.test.ts`

**Interfaces:**
- Consumes: `core/scan-dot` (`checkBalance`, `scanDot`, `Span`).
- Produces: `formatDot(source: string, opts?: FormatOptions): string`, `interface FormatOptions { indent?: string }`.

- [ ] **Step 1: Copy the module.** Copy `src/editor/format.ts` into `core/format.ts` verbatim, changing only the two import lines to:
```ts
import type { Span } from './scan-dot.js';
import { checkBalance, scanDot } from './scan-dot.js';
```

- [ ] **Step 2: Copy the tests.** Copy `test/editor/format.test.ts` to `test/core/format.test.ts`; repoint the import to `'../../core/format'`.

- [ ] **Step 3: Run + guards.**
Run: `npx vitest run test/core/format.test.ts && pnpm typecheck && pnpm graph:check`
Expected: PASS, exit 0.

- [ ] **Step 4: Commit.**
```bash
pnpm lint:fix
git add core/format.ts test/core/format.test.ts
git commit -m "refactor(core): add core/format (pure DOT formatter)"
```

### Task 5: `core/validate.ts` — the oracle orchestrator

**Files:**
- Create: `core/validate.ts`
- Test: `test/core/validate-diagram.test.ts`

**Interfaces:**
- Consumes: `core/render` (`validateDot`), `core/structure-lint` (`structuralDiagnostics`), `core/types` (`DotValidationError`, `LayoutEngine`).
- Produces: `validateDiagram(source: string, engine?: LayoutEngine): Promise<DiagramDiagnostics>`, `interface DiagramDiagnostics { syntax: DotValidationError | null; structural: StructuralDiagnostic[] }`.

- [ ] **Step 1: Write the failing test.** `test/core/validate-diagram.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import '../mocks/graphviz';
import { configureMockError, resetMockGraphviz } from '../mocks/graphviz';

describe('validateDiagram', () => {
  it('valid DOT with no structural issues → syntax null, structural empty', async () => {
    vi.resetModules();
    resetMockGraphviz();
    const { validateDiagram } = await import('../../core/validate');
    const result = await validateDiagram('digraph { a -> b }');
    expect(result.syntax).toBeNull();
    expect(result.structural).toEqual([]);
  });

  it('surfaces a Graphviz syntax error in syntax, independent of structural', async () => {
    vi.resetModules();
    resetMockGraphviz();
    configureMockError(new Error('Error: <stdin>: syntax error in line 2'));
    const { validateDiagram } = await import('../../core/validate');
    const result = await validateDiagram('digraph { a -> }');
    expect(result.syntax?.line).toBe(2);
  });

  it('reports structural warnings even when syntax is valid', async () => {
    vi.resetModules();
    resetMockGraphviz();
    const { validateDiagram } = await import('../../core/validate');
    const result = await validateDiagram('digraph { a [shp=box] }');
    expect(result.syntax).toBeNull();
    expect(result.structural.some((d) => /Unknown attribute 'shp'/.test(d.message))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run test/core/validate-diagram.test.ts`
Expected: FAIL — cannot find module `../../core/validate`.

- [ ] **Step 3: Implement `core/validate.ts`.**
```ts
import { validateDot } from './render.js';
import { structuralDiagnostics } from './structure-lint.js';
import type { DotValidationError, LayoutEngine } from './types.js';

/** The full diagnostic verdict for a diagram: Graphviz syntax + pure structural checks. */
export interface DiagramDiagnostics {
  syntax: DotValidationError | null;
  structural: ReturnType<typeof structuralDiagnostics>;
}

/**
 * The single source of truth for "what's wrong with this DOT", consumed by both
 * the CLI (`graphvizjs validate`) and the renderer (over the render:validate IPC).
 * Syntax validation requires the Graphviz engine (async); structural analysis is
 * pure. They are independent — structural warnings surface even on valid syntax.
 */
export async function validateDiagram(
  source: string,
  engine: LayoutEngine = 'dot'
): Promise<DiagramDiagnostics> {
  const syntax = await validateDot(source, engine);
  const structural = structuralDiagnostics(source);
  return { syntax, structural };
}
```

- [ ] **Step 4: Run to verify it passes.**
Run: `npx vitest run test/core/validate-diagram.test.ts && pnpm typecheck && pnpm graph:check`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit.**
```bash
pnpm lint:fix
git add core/validate.ts test/core/validate-diagram.test.ts
git commit -m "feat(core): add validateDiagram oracle (syntax + structural)"
```

---

## Phase 2 — Additive IPC channels (`dot:format`, `dot:vocabulary`)

> Both are purely new channels — no existing caller changes, so the renderer stays green. The `render:validate` extension is deferred to Task 10 (done atomically with the linting migration to avoid a broken intermediate).

### Task 6: `dot:format` IPC

**Files:**
- Modify: `src/platform/contract.ts`, `electron/preload.ts`, `electron/main.ts`, `src/platform/index.ts`
- Test: `test/platform/format.test.ts` (or extend an existing platform test if present)

**Interfaces:**
- Produces: `GraphvizApi.formatDot(source: string): Promise<string>`; renderer wrapper `formatDot(source: string): Promise<string>` in `src/platform/index.ts`.

- [ ] **Step 1: Extend the contract.** In `src/platform/contract.ts`, inside `interface GraphvizApi`, add:
```ts
formatDot(source: string): Promise<string>;
```

- [ ] **Step 2: Wire preload.** In `electron/preload.ts`, add to `api`:
```ts
formatDot: (source) => ipcRenderer.invoke('dot:format', source),
```

- [ ] **Step 3: Handle in main.** In `electron/main.ts` `registerIpc()`, add (import `formatDot` from `../core/format.js` at top):
```ts
ipcMain.handle('dot:format', (_e, source: string) => formatDot(source));
```

- [ ] **Step 4: Add the renderer wrapper.** In `src/platform/index.ts`, add a thin wrapper mirroring the existing ones:
```ts
export const formatDot = (source: string): Promise<string> => api().formatDot(source);
```
(Use whatever `api()`/`window.graphviz` accessor pattern the file already uses.)

- [ ] **Step 5: Test the round-trip (mocked).** Add `test/platform/format.test.ts` asserting the wrapper invokes the `dot:format` channel, following the existing platform-test mock pattern (mock `window.graphviz.formatDot`, call the wrapper, assert delegation).

- [ ] **Step 6: Run + guards.**
Run: `pnpm test && pnpm typecheck && pnpm graph:check`
Expected: PASS; `graph:check` exit 0 (new channel present on all four sides).

- [ ] **Step 7: Commit.**
```bash
pnpm lint:fix
git add src/platform/contract.ts electron/preload.ts electron/main.ts src/platform/index.ts test/platform/format.test.ts
git commit -m "feat(ipc): add dot:format channel"
```

### Task 7: `dot:vocabulary` IPC

**Files:** same four IPC files + `test/platform/vocabulary.test.ts`

**Interfaces:**
- Consumes: `core/dot-vocab`, `core/types` (`DotVocabulary`).
- Produces: `GraphvizApi.dotVocabulary(): Promise<DotVocabulary>`; renderer wrapper `dotVocabulary(): Promise<DotVocabulary>`.

- [ ] **Step 1: Contract.** In `contract.ts`, import type `DotVocabulary` from `'../../core/types'` (type-only — allowed) and add:
```ts
dotVocabulary(): Promise<DotVocabulary>;
```

- [ ] **Step 2: Preload.**
```ts
dotVocabulary: () => ipcRenderer.invoke('dot:vocabulary'),
```

- [ ] **Step 3: Main handler.** Import `DOT_ATTRIBUTES, DOT_KEYWORDS` from `../core/dot-vocab.js`; add:
```ts
ipcMain.handle('dot:vocabulary', () => ({
  keywords: [...DOT_KEYWORDS],
  attributes: [...DOT_ATTRIBUTES],
}));
```

- [ ] **Step 4: Renderer wrapper** in `src/platform/index.ts`:
```ts
export const dotVocabulary = (): Promise<DotVocabulary> => api().dotVocabulary();
```
(Import `DotVocabulary` type from `'../../core/types'`.)

- [ ] **Step 5: Test** `test/platform/vocabulary.test.ts` — mock delegation, same pattern as Task 6.

- [ ] **Step 6: Run + guards.**
Run: `pnpm test && pnpm typecheck && pnpm graph:check`
Expected: PASS, exit 0.

- [ ] **Step 7: Commit.**
```bash
pnpm lint:fix
git add src/platform/contract.ts electron/preload.ts electron/main.ts src/platform/index.ts test/platform/vocabulary.test.ts
git commit -m "feat(ipc): add dot:vocabulary channel"
```

---

## Phase 3 — Migrate renderer to core-over-IPC, then delete originals

### Task 8: `toolbar/format.ts` calls the IPC formatter (async)

**Files:**
- Modify: `src/toolbar/format.ts`
- Modify: `test/toolbar/format.test.ts`

**Interfaces:**
- Consumes: `src/platform` (`formatDot`).

- [ ] **Step 1: Update the failing test first.** In `test/toolbar/format.test.ts`, mock `src/platform`'s `formatDot` to return a known formatted string; assert `formatView`/the click handler awaits it and dispatches the change. (Adapt existing assertions to async — `await`, and the keymap returns `true` synchronously while formatting proceeds.)

- [ ] **Step 2: Rewrite `src/toolbar/format.ts`.** Replace the local `formatDot` import with the IPC wrapper and make `formatView` async:
```ts
import type { KeyBinding } from '@codemirror/view';
import type { EditorView } from 'codemirror';
import { formatDot } from '../platform';

/** Reformat the given editor's document in a single transaction. Resolves to true if it changed. */
export async function formatView(view: EditorView): Promise<boolean> {
  const current = view.state.doc.toString();
  const next = await formatDot(current);
  if (next === current) return false;
  view.dispatch({
    changes: { from: 0, to: current.length, insert: next },
    selection: { anchor: Math.min(view.state.selection.main.anchor, next.length) },
  });
  return true;
}

export interface FormatActionOptions {
  button: HTMLButtonElement | null;
  getEditor: () => EditorView;
  onFormat: (doc: string) => void;
}

export function setupFormat({ button, getEditor, onFormat }: FormatActionOptions): void {
  if (!button) return;
  button.addEventListener('click', async () => {
    const view = getEditor();
    if (await formatView(view)) onFormat(view.state.doc.toString());
    view.focus();
  });
}

/** Shift-Alt-F keybinding. Fires the async format and reports handled synchronously. */
export function makeFormatKeymap(onFormat: (doc: string) => void): KeyBinding {
  return {
    key: 'Shift-Alt-f',
    run: (view) => {
      void formatView(view).then((changed) => {
        if (changed) onFormat(view.state.doc.toString());
      });
      return true;
    },
  };
}
```

- [ ] **Step 3: Run + guards.**
Run: `pnpm test && pnpm typecheck && pnpm graph:check`
Expected: PASS, exit 0. (Renderer `editor/format.ts` still exists but is now unused by the toolbar — unused exports are not a hard `graph:check` violation.)

- [ ] **Step 4: Commit.**
```bash
pnpm lint:fix
git add src/toolbar/format.ts test/toolbar/format.test.ts
git commit -m "refactor(renderer): format via dot:format IPC"
```

### Task 9: Parameterize highlighting + autocomplete on injected vocab

**Files:**
- Modify: `src/editor/language.ts`, `src/editor/autocomplete.ts`, `src/main.ts`
- Modify: `test/editor/language.test.ts`, `test/editor/autocomplete.test.ts`

**Interfaces:**
- Produces: `createDotLanguage(vocab: DotVocabulary): Extension`; autocomplete setup accepts `vocab: DotVocabulary`.
- Consumes: `src/platform` (`dotVocabulary`), `core/types` (`DotVocabulary`, type-only).

- [ ] **Step 1: Update tests first.** In `test/editor/language.test.ts` and `test/editor/autocomplete.test.ts`, pass an explicit vocab object, e.g. `{ keywords: ['digraph', 'graph', 'subgraph', 'node', 'edge', 'strict'], attributes: ['color', 'label', 'shape'] }`, into the (now-parameterized) factory and assert highlighting/completion behavior against it.

- [ ] **Step 2: Parameterize `language.ts`.** Change the signature and drop the `dot-data` import:
```ts
import type { StringStream } from '@codemirror/language';
import { StreamLanguage } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import type { DotVocabulary } from '../../core/types';

const ARROW_TOKENS = ['->', '--'];

export function createDotLanguage(vocab: DotVocabulary): Extension {
  const keywordSet = new Set(vocab.keywords.map((w) => w.toLowerCase()));
  const attributeSet = new Set(vocab.attributes.map((a) => a.toLowerCase()));
  // ...remainder of the tokenizer unchanged...
}
```
(Remove the `DotKeyword` type alias; if referenced elsewhere, widen those spots to `string`.)

- [ ] **Step 3: Parameterize `autocomplete.ts`.** Replace its `DOT_ATTRIBUTES`/`DOT_KEYWORDS` imports from `./dot-data` with a `vocab: DotVocabulary` parameter on its setup/factory function; keep importing the snippet data from `./dot-data`. Thread `vocab.attributes`/`vocab.keywords` where the constants were used.

- [ ] **Step 4: Fetch vocab in bootstrap.** In `src/main.ts` `bootstrap()`, before the editor/tab init, add (near the other early `await`s):
```ts
const vocab = await dotVocabulary(); // from '../platform' — falls back handled below
```
Pass `vocab` into `createDotLanguage(vocab)` and the autocomplete setup wherever the editor extensions are assembled. Import `dotVocabulary` from `./platform`.

- [ ] **Step 5: Run + guards.**
Run: `pnpm test && pnpm typecheck && pnpm graph:check`
Expected: PASS, exit 0. (`language.ts`/`autocomplete.ts` no longer import the vocab from `dot-data`.)

- [ ] **Step 6: Commit.**
```bash
pnpm lint:fix
git add src/editor/language.ts src/editor/autocomplete.ts src/main.ts test/editor/language.test.ts test/editor/autocomplete.test.ts
git commit -m "refactor(renderer): inject DOT vocab from core via dot:vocabulary IPC"
```

### Task 10: Extend `render:validate` to `validateDiagram`; rewrite linting (atomic)

**Files:**
- Modify: `src/platform/contract.ts`, `electron/preload.ts`, `electron/main.ts`, `src/platform/index.ts`, `src/editor/linting.ts`
- Modify: `test/editor/linting.test.ts`

**Interfaces:**
- Contract method renamed `validateDot` → `validateDiagram(dot, engine): Promise<DiagramDiagnostics>`; channel string stays `render:validate`.
- `linting.ts`: `DotLinterOptions.validate: (dot, engine) => Promise<DiagramDiagnostics>`; produces one linter that emits both syntax and structural diagnostics.

- [ ] **Step 1: Update the linting test first.** In `test/editor/linting.test.ts`, change the injected `validate` mock to return `{ syntax, structural }`. Add a case asserting a structural warning (e.g. unknown attribute) becomes a `warning`-severity CodeMirror diagnostic at the right offsets, and a syntax error becomes an `error` diagnostic — both from the single lint source.

- [ ] **Step 2: Change the contract.** In `contract.ts`, replace the `validateDot` method with:
```ts
validateDiagram(dot: string, engine: LayoutEngine): Promise<DiagramDiagnostics>;
```
Import `DiagramDiagnostics` type from `'../../core/validate'`? No — type-only imports from `core/` are allowed ONLY for `core/types.ts`. Therefore move/duplicate the `DiagramDiagnostics` interface into `core/types.ts` and import it there (both `core/validate.ts` and the contract import it from `core/types`). Update `core/validate.ts` to `import type { DiagramDiagnostics } from './types.js'` and re-export if convenient.

- [ ] **Step 3: Preload.** Change line 31 to:
```ts
validateDiagram: (dot, engine) => ipcRenderer.invoke('render:validate', dot, engine),
```

- [ ] **Step 4: Main handler.** Replace the `render:validate` handler body to call `validateDiagram` (import from `../core/validate.js`):
```ts
ipcMain.handle('render:validate', (_e, dot: string, engine: LayoutEngine) =>
  validateDiagram(dot, engine)
);
```

- [ ] **Step 5: Renderer wrapper.** In `src/platform/index.ts`, rename the `validateDot` wrapper to `validateDiagram` with the new return type.

- [ ] **Step 6: Rewrite `linting.ts`.** Change `DotLinterOptions.validate` to return `DiagramDiagnostics`. In the lint source, call `validate`, then build diagnostics from BOTH `result.syntax` (as today, error severity) and `result.structural` (map each `{ from, to, severity, message }` straight to a CodeMirror `Diagnostic`). Delete the `createStructureLintSource` import and its second `linter(...)` in `createDotLinter` — there is now a single lint source covering both. Update `main.ts`/callers passing `validate:` to pass `validateDiagram`.

- [ ] **Step 7: Run + guards.**
Run: `pnpm test && pnpm typecheck && pnpm graph:check`
Expected: PASS, exit 0. Confirm `test/core/validate.test.ts` (the existing `validateDot`-on-`render` suite) still passes — `validateDot` in `core/render.ts` is untouched.

- [ ] **Step 8: Commit.**
```bash
pnpm lint:fix
git add src/platform/contract.ts electron/preload.ts electron/main.ts src/platform/index.ts src/editor/linting.ts src/main.ts core/validate.ts core/types.ts test/editor/linting.test.ts
git commit -m "feat(ipc): render:validate returns syntax+structural; linting consumes both"
```

### Task 11: Delete the now-unused renderer originals

**Files:**
- Delete: `src/editor/scan-dot.ts`, `src/editor/format.ts`, `src/editor/structure-lint.ts`
- Delete: `test/editor/scan-dot.test.ts`, `test/editor/format.test.ts`, `test/editor/structure-lint.test.ts`
- Modify: `src/editor/dot-data.ts` (remove the two vocab arrays; keep snippet data)

- [ ] **Step 1: Confirm no remaining importers.**
Run: `git grep -nE "editor/(scan-dot|format|structure-lint)" -- src/ | grep -v "toolbar/format"`
Expected: no output (nothing in `src/` imports the three originals). Also:
Run: `git grep -nE "DOT_ATTRIBUTES|DOT_KEYWORDS" -- src/`
Expected: only `src/editor/autocomplete.ts`/`language.ts` references, if any, should now be gone or via param — if any remain that import from `dot-data`, fix before deleting.

- [ ] **Step 2: Delete the files.**
```bash
git rm src/editor/scan-dot.ts src/editor/format.ts src/editor/structure-lint.ts \
       test/editor/scan-dot.test.ts test/editor/format.test.ts test/editor/structure-lint.test.ts
```

- [ ] **Step 3: Trim `dot-data.ts`.** Remove the `DOT_KEYWORDS` and `DOT_ATTRIBUTES` exports (now owned by `core/dot-vocab.ts`); keep only the autocomplete snippet exports. If the file's header comment claims to be the vocab source of truth, update it to describe snippets only.

- [ ] **Step 4: Run the full gate.**
Run: `pnpm test && pnpm typecheck && pnpm graph:check && pnpm lint`
Expected: all green. `graph:check` should now report the renderer importing zero runtime from core; no duplicate scan-dot/format/structure-lint remains.

- [ ] **Step 5: Commit.**
```bash
git add -A
git commit -m "refactor(renderer): delete relocated language modules (now core-owned)"
```

---

## Phase 4 — CLI commands

### Task 12: `cli/args.ts` — parse `validate` and `format`

**Files:**
- Modify: `cli/args.ts`
- Test: `test/cli/args.test.ts` (extend; create if absent)

**Interfaces:**
- Produces: extend `ParsedArgs.command` union to `'render' | 'validate' | 'format' | 'help' | 'version'`; add fields `json?: boolean`, `strict?: boolean` (validate); `output?` already exists (reused by format, optional → stdout).

- [ ] **Step 1: Write failing tests.** In `test/cli/args.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../cli/args';

describe('parseArgs — validate', () => {
  it('parses `validate in.dot --json`', () => {
    const r = parseArgs(['validate', 'in.dot', '--json']);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.command).toBe('validate');
    expect(r.input).toBe('in.dot');
    expect(r.json).toBe(true);
  });
  it('parses `--engine` and `--strict` for validate', () => {
    const r = parseArgs(['validate', '-', '--engine', 'neato', '--strict']);
    if ('error' in r) throw new Error(r.error);
    expect(r.engine).toBe('neato');
    expect(r.strict).toBe(true);
    expect(r.input).toBe('-');
  });
  it('rejects an unknown engine for validate', () => {
    const r = parseArgs(['validate', 'in.dot', '--engine', 'nope']);
    expect('error' in r).toBe(true);
  });
});

describe('parseArgs — format', () => {
  it('parses `format in.dot -o out.dot`', () => {
    const r = parseArgs(['format', 'in.dot', '-o', 'out.dot']);
    if ('error' in r) throw new Error(r.error);
    expect(r.command).toBe('format');
    expect(r.input).toBe('in.dot');
    expect(r.output).toBe('out.dot');
  });
  it('allows format without -o (stdout)', () => {
    const r = parseArgs(['format', 'in.dot']);
    if ('error' in r) throw new Error(r.error);
    expect(r.command).toBe('format');
    expect(r.output).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure.**
Run: `npx vitest run test/cli/args.test.ts`
Expected: FAIL (unknown command / missing fields).

- [ ] **Step 3: Extend `cli/args.ts`.** Add `'validate'` and `'format'` to the `command` union and `ParsedArgs`; add `json?: boolean` and `strict?: boolean`. Branch on `first === 'validate'` and `first === 'format'` before the `render` branch. For `validate`: accept an input (path or `-`), `--engine` (validated against `ENGINES`), `--json`, `--strict`; `-o`/format/pdf flags are not valid → error. For `format`: accept an input and optional `-o`; no engine/format flags. Reuse the existing input/`-o` parsing helpers. Do not require `-o` for validate/format.

- [ ] **Step 4: Run to verify pass.**
Run: `npx vitest run test/cli/args.test.ts && pnpm typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit.**
```bash
pnpm lint:fix
git add cli/args.ts test/cli/args.test.ts
git commit -m "feat(cli): parse validate and format commands"
```

### Task 13: `cli/index.ts` — `validate` command (human + `--json` + exit codes)

**Files:**
- Modify: `cli/index.ts`
- Test: `test/cli/index.test.ts` (extend; the `main(argv)` function returns an exit code and writes to stdout/stderr — capture via spies)

**Interfaces:**
- Consumes: `core/validate` (`validateDiagram`), the parsed args from Task 12.

- [ ] **Step 1: Write failing tests.** Extend `test/cli/index.test.ts` to call `main(['validate', ...])` with stdout/stderr spies and a fixture. Assert:
  - valid input → exit `0`, and with `--json` the stdout parses to `{ valid: true, syntax: null, structural: [] }`;
  - a structural-only warning → exit `0` by default, exit `1` with `--strict`;
  - a syntax error (mock Graphviz to throw) → exit `1`;
  - unknown flag → exit `2`.
  Follow the mocking pattern already used in the CLI/core tests (`test/mocks/graphviz`).

- [ ] **Step 2: Run to verify failure.**
Run: `npx vitest run test/cli/index.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the `validate` branch in `main()`.** After the `version` branch, before `render`, add handling for `parsed.command === 'validate'`:
```ts
if (parsed.command === 'validate') {
  const dot = await readInput(parsed.input!);
  const { syntax, structural } = await validateDiagram(dot, parsed.engine);
  const hasError = syntax !== null;
  const hasWarn = structural.length > 0;
  const failed = hasError || (parsed.strict === true && hasWarn);
  const name = parsed.input === '-' ? '<stdin>' : parsed.input!;

  if (parsed.json) {
    process.stdout.write(
      `${JSON.stringify({
        input: name,
        engine: parsed.engine,
        valid: !failed,
        syntax,
        structural: structural.map((d) => ({
          severity: d.severity,
          message: d.message,
          ...offsetToLineCol(dot, d.from),
        })),
      })}\n`
    );
  } else {
    if (syntax) {
      const loc = syntax.line ? `:${syntax.line}${syntax.column ? `:${syntax.column}` : ''}` : '';
      process.stderr.write(`${name}${loc}: error: ${syntax.message}\n`);
    }
    for (const d of structural) {
      const { line, column } = offsetToLineCol(dot, d.from);
      process.stderr.write(`${name}:${line}:${column}: ${d.severity}: ${d.message}\n`);
    }
    if (!failed) process.stdout.write(`${name}: ok\n`);
  }
  return failed ? 1 : 0;
}
```
Add a small pure helper (unit-test it directly too):
```ts
/** 1-based line/column for a 0-based character offset. */
export function offsetToLineCol(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let col = 1;
  const end = Math.min(offset, source.length);
  for (let i = 0; i < end; i++) {
    if (source[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, column: col };
}
```
Import `validateDiagram` from `../core/validate.js`. Update the `USAGE` string to include the `validate` line.

- [ ] **Step 4: Run to verify pass.**
Run: `npx vitest run test/cli/index.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
pnpm lint:fix
git add cli/index.ts test/cli/index.test.ts
git commit -m "feat(cli): validate command with --json and exit codes"
```

### Task 14: `cli/index.ts` — `format` command + dist integration

**Files:**
- Modify: `cli/index.ts`
- Test: `test/cli/index.test.ts`, `test/cli/dist.integration.test.ts`

- [ ] **Step 1: Write failing tests.** In `test/cli/index.test.ts`, `main(['format', fixture, '-o', out])` writes a reformatted file; `main(['format', fixture])` writes formatted DOT to stdout. Assert output equals `formatDot(fixtureContents)`.

- [ ] **Step 2: Run to verify failure.**
Run: `npx vitest run test/cli/index.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the `format` branch.**
```ts
if (parsed.command === 'format') {
  const dot = await readInput(parsed.input!);
  const formatted = formatDot(dot);
  if (parsed.output) await writeFile(parsed.output, formatted);
  else process.stdout.write(formatted.endsWith('\n') ? formatted : `${formatted}\n`);
  return 0;
}
```
Import `formatDot` from `../core/format.js`; add the `format` line to `USAGE`.

- [ ] **Step 4: Extend the dist integration test.** In `test/cli/dist.integration.test.ts`, after building, subprocess-run `graphvizjs validate <fixture> --json` and assert exit 0 + parseable JSON with `valid: true`; run `graphvizjs format <fixture>` and assert stdout is non-empty formatted DOT. (Follow the existing build-and-run harness in that file.)

- [ ] **Step 5: Run the gate.**
Run: `pnpm test && pnpm typecheck && pnpm graph:check`
Expected: all green. (The dist test compiles `cli/`+`core/`; NodeNext `.js` extensions on all new core imports are exercised here.)

- [ ] **Step 6: Commit.**
```bash
pnpm lint:fix
git add cli/index.ts test/cli/index.test.ts test/cli/dist.integration.test.ts
git commit -m "feat(cli): format command; dist integration for validate/format"
```

---

## Phase 5 — Documentation

### Task 15: Update CLAUDE.md, CHANGELOG, spec status

**Files:**
- Modify: `.claude/CLAUDE.md`, `CHANGELOG.md` (if present), `docs/superpowers/specs/2026-07-07-cli-core-oracle-design.md`

- [ ] **Step 1: CLAUDE.md — module boundaries.** In the "Module Boundaries" list, note `core/` now owns `scan-dot`, `dot-vocab`, `structure-lint`, `format`, `validate`; update the `editor/` bullet (no longer holds scan-dot/format/structure-lint; language/autocomplete take injected vocab). Add the new IPC channels (`dot:format`, `dot:vocabulary`; `render:validate` now returns `{ syntax, structural }`) to the Electron Integration section.

- [ ] **Step 2: CLAUDE.md — CLI section + Adding Features.** Document `graphvizjs validate` and `format`. Add the **core → CLI → IPC → UI** workflow and the `--json` output convention as a subsection.

- [ ] **Step 3: CHANGELOG.** Add an entry (new minor version) describing the `validate`/`format` CLI commands and the internal relocation.

- [ ] **Step 4: Spec status.** Set the spec's `Status:` to `Implemented`.

- [ ] **Step 5: Final full verification.**
Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm graph:check && pnpm build && pnpm build:cli`
Expected: all succeed (renderer build + CLI build both compile with the relocated modules).

- [ ] **Step 6: Commit.**
```bash
git add .claude/CLAUDE.md CHANGELOG.md docs/superpowers/specs/2026-07-07-cli-core-oracle-design.md
git commit -m "docs: document validate/format CLI + core→CLI→IPC→UI workflow"
```

---

## Self-Review (completed by author)

**Spec coverage:** relocation (Tasks 1–4, 11) · validateDiagram oracle (Task 5) · IPC extend + new channels (Tasks 6, 7, 10) · renderer migration incl. async linting + bootstrap vocab fetch + format-via-IPC (Tasks 8–10) · CLI validate/format with `--json`, exit codes, `--strict` (Tasks 12–14) · docs + workflow + convention (Task 15). All spec sections map to a task.

**Placeholder scan:** no TBD/TODO; every code step shows complete code or an exact verbatim-move instruction with the precise edit.

**Type consistency:** `DiagramDiagnostics` and `DotVocabulary` are declared in `core/types.ts` (Tasks 2, 10) so both the contract and `core/validate.ts` reference the same names; the contract method is consistently `validateDiagram` (Tasks 10) end to end; `structuralDiagnostics`/`StructuralDiagnostic`/`formatDot`/`scanDot`/`checkBalance` names are stable across core, IPC, and CLI tasks.

**Green-at-every-commit:** expand (1–7) never removes a renderer import; contract (8–11) migrates each consumer before Task 11 deletes originals; unused-export windows are not hard `graph:check` violations.
