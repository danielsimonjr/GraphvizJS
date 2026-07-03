# GraphvizJS — Editor & authoring (design spec)

**Date:** 2026-07-02
**Status:** Approved design, pending implementation plan
**Cycle:** 2 of the post-1.0 improvement program (cycle 1 = Rendering & Export → PDF export, shipped v1.1.0). Target release: **v1.2.0**.

## Goal

Make writing DOT in GraphvizJS materially faster and less error-prone by adding four editor-authoring features in one release: **DOT-aware autocomplete + snippets**, **find & replace** (exposed + themed), **prettify/format**, and **richer (local, structural) linting**. All four are renderer-side CodeMirror 6 features; none touch the Electron/IPC boundary.

### Non-goals

- No Lezer grammar rewrite. The DOT mode stays a `StreamLanguage` (`src/editor/language.ts`); features that need context inspect the text around the cursor / re-tokenize, they do not consume a syntax tree.
- No semantic formatter (attribute reordering, dedup, canonicalization) — prettify is structural only.
- No replacement of the existing WASM semantic linter — structural linting is additive.
- No multi-file / project-wide search — find & replace is per-document (CodeMirror's panel).

## Success criteria

- `pnpm typecheck` / `pnpm lint` clean; unit + e2e suites green; new features covered by tests.
- Autocomplete offers DOT keywords, attribute names, attribute enum values, and snippets in the right cursor contexts.
- Ctrl-F / Ctrl-H open a working, app-themed search panel; a toolbar **Find** button opens it too.
- `formatDot(src)` is pure and **idempotent** (`formatDot(formatDot(x)) === formatDot(x)`), never corrupts strings/HTML labels/comments, and a Format action (button + Shift-Alt-F) applies it.
- Structural linting flags unbalanced delimiters, unknown attribute names, and malformed attribute assignments as **advisory warnings**, combined with (not replacing) the existing engine-error linter.
- Shipped as **v1.2.0**: version bump, CHANGELOG entry, Windows installer built.

## Current state (grounded)

- Editor extensions are composed per-tab in `src/main.ts` `createTabEditor` (line ~127): `[basicSetup, DOT_LANGUAGE, createDotLinter(...), lintGutter(), lineWrapping, EDITOR_THEME, keymap.of([indentWithTab]), zoomExtension, updateListener]`.
- **`basicSetup` (codemirror@6.0.2) already bundles** `autocompletion()`, `completionKeymap`, `searchKeymap`, and `highlightSelectionMatches` (verified). So the search UI and the completion *engine* are already active; what's missing is a DOT completion **source** and an exposed/ themed search entry point.
- `src/editor/language.ts` is a `StreamLanguage` with hard-coded `DOT_KEYWORDS` (6) and `DOT_ATTRIBUTES` (32) arrays and correct tokenization of `"..."` strings, `<...>` HTML labels, and `//` `/* */` `#` comments.
- `src/editor/linting.ts` lints by calling `validateDot` (Graphviz WASM) — async, one engine error at a time, debounced 500ms.

## Design

### Shared foundation — `src/editor/dot-data.ts` (new)

Single source of truth for DOT vocabulary, extracted from `language.ts` and expanded:

- `DOT_KEYWORDS: readonly string[]` — `graph, digraph, subgraph, node, edge, strict` (moved from language.ts).
- `DOT_ATTRIBUTES: readonly string[]` — the existing 32, kept curated.
- `DOT_ATTR_VALUES: Record<string, readonly string[]>` — enum values keyed by attribute: `shape` (box, ellipse, circle, diamond, record, plaintext, point, triangle, oval, note, tab, folder, component, …), `style` (filled, dashed, dotted, bold, rounded, solid, invis, …), `rankdir` (TB, LR, BT, RL), `dir` (forward, back, both, none), `arrowhead`/`arrowtail` (normal, dot, diamond, vee, box, crow, inv, tee, none, …), `rank` (same, min, max, source, sink), `splines` (true, false, ortho, polyline, curved, none).
- `DOT_COLORS: readonly string[]` — a curated common-color list (X11 subset: black, white, red, green, blue, gray, orange, purple, …) offered for `color`/`fillcolor`/`fontcolor`/`bgcolor`.

`language.ts` imports `DOT_KEYWORDS`/`DOT_ATTRIBUTES` from here (its behavior unchanged). This keeps highlighting, autocomplete, and linting on one vocabulary.

### Feature 1 — Autocomplete + snippets — `src/editor/autocomplete.ts` (new)

The `autocompletion()` engine is already in `basicSetup`; this adds a DOT `CompletionSource` and snippets. Since `StreamLanguage` gives no tree, context is derived from the text before the cursor.

`createDotCompletion(): Extension` returns `autocompletion({ override: [dotCompletionSource] })` merged over basicSetup's config (later extension wins), plus `activateOnTyping: true`.

`dotCompletionSource(ctx: CompletionContext): CompletionResult | null`:

1. `const before = ctx.matchBefore(/[\w=]*/)` and the current line's text up to the cursor (`ctx.state.doc.lineAt(ctx.pos)`).
2. **Attribute value** — if the line-before-cursor matches `(\w+)\s*=\s*"?(\w*)$`, look up `DOT_ATTR_VALUES[attr]` (or `DOT_COLORS` for color attributes) and offer those.
3. **Attribute name** — else if the cursor is inside an unclosed `[ … ` on the line (an `[` after the last `]`), offer `DOT_ATTRIBUTES` (with a `=` apply hint via a snippet `attr=${}`).
4. **Keyword / snippet** — else at statement start (line is empty or ends in `{`/`;` before the token) offer `DOT_KEYWORDS` + snippets.
5. Otherwise return `null` (no completion).

Snippets via `snippetCompletion`:
- `subgraph cluster_${1:name} {\n\t${2}\n}` — labeled "subgraph cluster".
- `${1:node} [label="${2}", shape=${3:box}];` — labeled "node with attributes".
- `${1:a} -> ${2:b};` — labeled "edge".

Completions carry `type` (`keyword`/`property`/`enum`/`snippet`) for icons. Explicit trigger via the existing `completionKeymap` (Ctrl-Space).

### Feature 2 — Find & replace — `src/editor/search.ts` (new) + toolbar wiring

Ctrl-F/Ctrl-H already work (basicSetup `searchKeymap`). Scope: expose + theme.

- `createSearch(): Extension` returns `search({ top: true })` (panel at top; overrides basicSetup's default-bottom via later-wins) with `highlightSelectionMatches` already present.
- Toolbar **Find** action: a new `src/toolbar/find.ts` `setupFind(button, getActiveView)` that calls `openSearchPanel(view)` from `@codemirror/search`. Add a button to `src/index.html` (`data-action="find"`), wired in `src/toolbar/actions.ts` (following the documented "new toolbar action" pattern).
- Panel styling in `src/styles.css` (`.cm-search`, inputs, buttons) to match the app's toolbar/dialog look (mirror the existing `.help-dialog`/toolbar tokens).

### Feature 3 — Prettify / format — `src/editor/format.ts` (new) + toolbar/keymap

Pure function first, wiring second.

`formatDot(source: string, opts?: { indent?: string }): string` (default indent = 2 spaces):
- A hand-written scanner walks the source char-by-char, **skipping over** `"…"` (with `\"` escapes), `<…>` HTML labels (depth-counted), and `//` / `/* */` / `#` comments — emitting them verbatim so their contents are never reflowed or brace-counted.
- Outside those spans: track brace depth on `{`/`}`. Emit one statement per line; a statement ends at `;` or a newline that closes a logical line. Indent each line by `indent × depth`. `}` dedents before emitting. Normalize spacing: exactly one space around `->`, `--`, and top-level `=`; no space inside `[` … `]` edges beyond attribute separators; collapse runs of blank lines to at most one.
- **Idempotent** and **string/label/comment-safe** by construction. On any scanner anomaly (unbalanced braces), it returns the source unchanged rather than emit corrupted output (fail-safe).

Wiring: `src/toolbar/format.ts` `setupFormat(button, getActiveView)` replaces the doc via a single transaction (`view.dispatch({changes:{from:0,to:len,insert:formatDot(doc)}})`), best-effort caret preservation (map to nearest line start). Toolbar button (`data-action="format"`) + `keymap.of([{ key: 'Shift-Alt-f', run: … }])` added to the editor extensions.

### Feature 4 — Richer linting — `src/editor/structure-lint.ts` (new), combined in `linting.ts`

A synchronous, local lint source (no WASM) returning `Diagnostic[]`, combined with the existing async engine linter so both sets of markers show:

- **Unbalanced delimiters** — using the same string/label/comment-skipping scanner as the formatter (shared helper `src/editor/scan-dot.ts`): report an `error` diagnostic at the offending position for unmatched `{}` / `[]` / unterminated `"` / `<>`.
- **Unknown attribute name** — inside an attribute list, a name not in `DOT_ATTRIBUTES` and not followed by a value that makes it a node id → `warning` "Unknown attribute 'foo'".
- **Malformed assignment** — an attribute name inside `[...]` with no `=` before the separator → `warning`.

`createDotLinter` (in `linting.ts`) is extended to accept the structural source and return `[linter(engineSource,{delay}), linter(structuralSource,{delay: 200})]` (structural is fast, shorter delay). `dot-data.ts` supplies the attribute set; `scan-dot.ts` is shared with the formatter.

### Extension wiring (`src/main.ts` `createTabEditor`)

Add to the `extensions` array: `createDotCompletion()`, `createSearch()`, and a `keymap.of([formatKeymap])`. The structural linter is folded into the existing `createDotLinter(...)` call's return. Toolbar buttons (find, format) are wired in `actions.ts` with a `getActiveView` accessor (the active tab's `editorView`).

## File structure

- New: `src/editor/dot-data.ts`, `src/editor/autocomplete.ts`, `src/editor/search.ts`, `src/editor/format.ts`, `src/editor/scan-dot.ts`, `src/editor/structure-lint.ts`, `src/toolbar/find.ts`, `src/toolbar/format.ts`.
- Modify: `src/editor/language.ts` (import vocab from dot-data), `src/editor/linting.ts` (combine structural source), `src/main.ts` (wire extensions), `src/toolbar/actions.ts` (wire buttons), `src/index.html` (Find + Format buttons), `src/styles.css` (search panel theme), `package.json` (version, deps), `CHANGELOG.md`.
- Deps: `@codemirror/autocomplete` and `@codemirror/search` are transitive via `codemirror`/`basicSetup`; add them as **direct runtime `dependencies`** (they ship in the editor bundle) so imports (`autocompletion`, `snippetCompletion`, `search`, `openSearchPanel`) are explicit and version-pinned.

## Testing

- **Unit (pure logic, heaviest coverage):**
  - `format.test.ts` — idempotency; indent by depth; strings/HTML-labels/comments preserved verbatim (incl. braces inside them); spacing normalization around `->`/`--`/`=`; fail-safe on unbalanced input.
  - `scan-dot.test.ts` — the shared scanner yields correct spans for strings/labels/comments; delimiter-balance detection.
  - `autocomplete.test.ts` — `dotCompletionSource` returns keywords at statement start, attribute names inside `[...]`, enum values after `shape=`/`rankdir=`/color attrs, snippets; returns null elsewhere.
  - `structure-lint.test.ts` — flags unbalanced `{`, unknown attribute, missing `=`; clean input → no diagnostics.
  - `dot-data.test.ts` — vocab tables are non-empty and lowercase-consistent; every `DOT_ATTR_VALUES` key is a known attribute.
- **e2e (Playwright):** Ctrl-F opens the search panel; the Find toolbar button opens it; the Format button reformats a messy diagram (assert on resulting text); typing `shape=` shows completion options. (Autocomplete popup interaction is best verified at unit level for the source; e2e asserts the popup appears.)
- Coverage thresholds unchanged (80/70). New pure modules are well within reach.

## Risks & mitigations

- **Formatter corrupting strings/HTML labels/comments** — the single biggest risk. *Mitigation:* one shared, unit-tested `scan-dot.ts` scanner is the only place that distinguishes code from literal spans; the formatter and structural linter both use it; idempotency + literal-preservation are explicit tests; fail-safe returns input unchanged on anomaly.
- **Autocomplete false triggers / noise** — over-eager completion annoys. *Mitigation:* the source returns `null` outside recognized contexts; `activateOnTyping` with a minimal prefix; contexts are unit-tested.
- **Duplicate / conflicting keymaps with basicSetup** — Shift-Alt-F and panel config must not clash. *Mitigation:* later-wins extension ordering; only add keys not already bound by basicSetup.
- **Search panel theming drift** — CodeMirror's default panel markup. *Mitigation:* scope CSS to `.cm-search`; accept default behavior, style only.

## Out of scope (possible later)

Format-on-save, format-selection, multi-cursor snippets from templates, attribute value validation against Graphviz's full schema, project-wide search, and a Lezer grammar (which would enable tree-based autocomplete/formatting) — each a future increment.
