# Editor & authoring (v1.2.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four DOT-authoring features to the CodeMirror editor — DOT-aware autocomplete + snippets, exposed/themed find & replace, a safe prettify/format command, and richer local linting — shipped as v1.2.0.

**Architecture:** Renderer-side CodeMirror 6 only (no Electron/IPC changes). A shared vocabulary module (`dot-data.ts`) and a shared literal-aware scanner (`scan-dot.ts`) underpin the features; the formatter and structural linter both route through the scanner so string/HTML-label/comment content is never misread. `basicSetup` already provides the autocomplete engine and search keymap, so those features add a completion *source* and *exposure*, not infrastructure.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`, Bundler resolution), CodeMirror 6 (`@codemirror/autocomplete`, `@codemirror/search`, `@codemirror/lint`, `@codemirror/view`, `@codemirror/state`), Vitest + happy-dom (unit), Playwright (e2e), Biome, electron-builder.

## Global Constraints

- **Biome** (`biome.jsonc`): 2-space indent, single quotes, semicolons always, trailing `es5` commas, 100-char lines, LF. `noExplicitAny` = error. `useConst` = error. `pnpm lint` must be clean.
- **TypeScript** (`tsconfig.json`): `strict: true`, `verbatimModuleSyntax: true` (⇒ type-only imports use `import type`), `moduleResolution: "Bundler"` (extensionless relative imports). `pnpm typecheck` clean.
- **Tests** (`vitest.config.ts`): unit under `test/**/*.test.ts` (happy-dom); e2e under `test/e2e/**` (Playwright, excluded from Vitest). Coverage thresholds 80% lines/functions/statements, 70% branches; `src/main.ts` excluded.
- **pnpm** adds of CodeMirror packages must not trip the build-script gate (they have none) — if `pnpm install` ever exits 1 on an ignored build script, resolve in `pnpm-workspace.yaml` `allowBuilds:` (do not add a `package.json` `pnpm.ignoredBuiltDependencies` field — pnpm 11 reads the workspace file).
- **New toolbar action pattern** (from CLAUDE.md): create `src/toolbar/<name>.ts` with a setup function, add a `<button data-action="…">` to `src/index.html`, wire it in `src/toolbar/actions.ts`.
- **Formatter scope (deliberate):** `formatDot` re-indents by brace depth and normalizes spacing **within code regions only**; it never splits or merges statements and never edits inside strings/HTML labels/comments. It is **idempotent** and **fail-safe** (returns input unchanged when delimiters are unbalanced).
- **Release:** version bumps to `1.2.0` in `package.json`; `CHANGELOG.md` gets a `[1.2.0]` section; installer built via `pnpm build && pnpm package`.

---

## File Structure

- Create: `src/editor/dot-data.ts` (vocabulary), `src/editor/scan-dot.ts` (literal-aware scanner + balance check), `src/editor/format.ts` (`formatDot`), `src/editor/structure-lint.ts` (local diagnostics), `src/editor/autocomplete.ts` (completion source + snippets), `src/editor/search.ts` (search extension), `src/toolbar/find.ts`, `src/toolbar/format.ts`.
- Modify: `src/editor/language.ts` (import vocab from `dot-data`), `src/editor/linting.ts` (combine the structural source), `src/main.ts` (`createTabEditor` extensions + toolbar option wiring), `src/toolbar/actions.ts` (find/format setup), `src/index.html` (Find + Format buttons), `src/styles.css` (search panel theme), `package.json` (deps + version), `CHANGELOG.md`.
- Tests: `test/editor/{dot-data,scan-dot,format,structure-lint,autocomplete}.test.ts`, `test/e2e/editor-authoring.spec.ts`.

---

### Task 1: Shared vocabulary (`dot-data.ts`)

**Files:**
- Create: `src/editor/dot-data.ts`
- Modify: `src/editor/language.ts:5-42` (import `DOT_KEYWORDS`/`DOT_ATTRIBUTES` instead of local arrays)
- Test: `test/editor/dot-data.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DOT_KEYWORDS: readonly string[]`, `DOT_ATTRIBUTES: readonly string[]`, `DOT_ATTR_VALUES: Record<string, readonly string[]>`, `DOT_COLORS: readonly string[]`, `isColorAttribute(attr: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `test/editor/dot-data.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DOT_ATTR_VALUES,
  DOT_ATTRIBUTES,
  DOT_COLORS,
  DOT_KEYWORDS,
  isColorAttribute,
} from '../../src/editor/dot-data';

describe('dot-data', () => {
  it('exposes the DOT keywords', () => {
    expect(DOT_KEYWORDS).toEqual(
      expect.arrayContaining(['graph', 'digraph', 'subgraph', 'node', 'edge', 'strict'])
    );
  });

  it('exposes attributes including shape and rankdir', () => {
    expect(DOT_ATTRIBUTES).toEqual(expect.arrayContaining(['shape', 'rankdir', 'label', 'color']));
  });

  it('maps attribute names to enum values', () => {
    expect(DOT_ATTR_VALUES.shape).toEqual(expect.arrayContaining(['box', 'ellipse', 'record']));
    expect(DOT_ATTR_VALUES.rankdir).toEqual(['TB', 'LR', 'BT', 'RL']);
    expect(DOT_ATTR_VALUES.dir).toEqual(expect.arrayContaining(['forward', 'back', 'both', 'none']));
  });

  it('every DOT_ATTR_VALUES key is a known attribute', () => {
    for (const key of Object.keys(DOT_ATTR_VALUES)) {
      expect(DOT_ATTRIBUTES).toContain(key);
    }
  });

  it('identifies color-valued attributes', () => {
    expect(isColorAttribute('color')).toBe(true);
    expect(isColorAttribute('fillcolor')).toBe(true);
    expect(isColorAttribute('shape')).toBe(false);
    expect(DOT_COLORS).toEqual(expect.arrayContaining(['black', 'white', 'red', 'blue']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/editor/dot-data.test.ts`
Expected: FAIL — cannot find module `dot-data`.

- [ ] **Step 3: Write `dot-data.ts`**

Create `src/editor/dot-data.ts`:

```ts
/** Shared DOT vocabulary — single source of truth for highlighting, autocomplete, linting. */

export const DOT_KEYWORDS = ['graph', 'digraph', 'subgraph', 'node', 'edge', 'strict'] as const;

export const DOT_ATTRIBUTES = [
  'label', 'color', 'bgcolor', 'fillcolor', 'fontcolor', 'fontname', 'fontsize', 'shape', 'style',
  'width', 'height', 'rank', 'rankdir', 'size', 'ratio', 'margin', 'pad', 'splines', 'overlap',
  'concentrate', 'compound', 'arrowhead', 'arrowtail', 'dir', 'headlabel', 'taillabel', 'penwidth',
  'pos', 'xlabel', 'tooltip', 'URL', 'href',
] as const;

export const DOT_ATTR_VALUES: Record<string, readonly string[]> = {
  shape: [
    'box', 'polygon', 'ellipse', 'oval', 'circle', 'point', 'egg', 'triangle', 'plaintext',
    'plain', 'diamond', 'trapezium', 'parallelogram', 'house', 'pentagon', 'hexagon', 'septagon',
    'octagon', 'doublecircle', 'doubleoctagon', 'invtriangle', 'invtrapezium', 'record', 'Mrecord',
    'note', 'tab', 'folder', 'box3d', 'component', 'cylinder', 'star', 'none',
  ],
  style: [
    'filled', 'invisible', 'invis', 'diagonals', 'rounded', 'dashed', 'dotted', 'solid', 'bold',
    'wedged', 'striped', 'radial',
  ],
  rankdir: ['TB', 'LR', 'BT', 'RL'],
  dir: ['forward', 'back', 'both', 'none'],
  arrowhead: ['normal', 'inv', 'dot', 'invdot', 'odot', 'invodot', 'none', 'tee', 'empty', 'diamond', 'ediamond', 'box', 'open', 'crow', 'vee'],
  arrowtail: ['normal', 'inv', 'dot', 'invdot', 'odot', 'invodot', 'none', 'tee', 'empty', 'diamond', 'ediamond', 'box', 'open', 'crow', 'vee'],
  rank: ['same', 'min', 'source', 'max', 'sink'],
  splines: ['true', 'false', 'none', 'line', 'polyline', 'curved', 'ortho', 'spline'],
  overlap: ['true', 'false', 'scale', 'prism', 'compress', 'vpsc'],
  ratio: ['fill', 'compress', 'expand', 'auto'],
};

export const DOT_COLORS = [
  'black', 'white', 'gray', 'grey', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink',
  'brown', 'cyan', 'magenta', 'lightgray', 'lightgrey', 'lightblue', 'darkgreen', 'navy', 'gold',
  'silver', 'transparent',
] as const;

const COLOR_ATTRIBUTES = new Set(['color', 'bgcolor', 'fillcolor', 'fontcolor']);

export function isColorAttribute(attr: string): boolean {
  return COLOR_ATTRIBUTES.has(attr.toLowerCase());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/editor/dot-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `language.ts` to consume the shared vocab**

In `src/editor/language.ts`, delete the local `DOT_KEYWORDS` (line 5) and `DOT_ATTRIBUTES` (lines 9-42) arrays and import them instead. At the top, add:

```ts
import { DOT_ATTRIBUTES, DOT_KEYWORDS } from './dot-data';
```

Keep the existing `export type DotKeyword = (typeof DOT_KEYWORDS)[number];` line working — since `DOT_KEYWORDS` is now imported, that type alias still resolves. Leave the rest of `language.ts` unchanged (the `keywordSet`/`attributeSet` construction at lines 47-48 still works).

- [ ] **Step 6: Verify existing language + full unit suite still pass**

Run: `npx vitest run test/editor/ test/preview/` and `npx vitest run` (full)
Expected: PASS (no behavior change to highlighting). Run `pnpm lint` — clean.

- [ ] **Step 7: Commit**

```bash
git add src/editor/dot-data.ts src/editor/language.ts test/editor/dot-data.test.ts
git commit -m "feat(editor): shared DOT vocabulary (dot-data) consumed by language mode"
```

---

### Task 2: Literal-aware scanner (`scan-dot.ts`)

**Files:**
- Create: `src/editor/scan-dot.ts`
- Test: `test/editor/scan-dot.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SpanKind = 'code' | 'string' | 'html' | 'comment'`
  - `interface Span { kind: SpanKind; from: number; to: number; closed: boolean }`
  - `scanDot(source: string): Span[]` — contiguous non-overlapping spans covering `[0, source.length)`; literal spans (`string`/`html`/`comment`) isolate content that must never be reformatted; `closed=false` marks a literal that ran to EOF.
  - `interface BalanceResult { balanced: boolean; error?: { pos: number; message: string } }`
  - `checkBalance(source: string): BalanceResult` — `{}`/`[]` balance + literal termination, ignoring delimiters inside literals.

- [ ] **Step 1: Write the failing test**

Create `test/editor/scan-dot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkBalance, scanDot } from '../../src/editor/scan-dot';

const kinds = (src: string) => scanDot(src).map((s) => `${s.kind}:${src.slice(s.from, s.to)}`);

describe('scanDot', () => {
  it('separates code from a double-quoted string', () => {
    expect(kinds('a="x{y}"')).toEqual(['code:a=', 'string:"x{y}"']);
  });

  it('treats <...> as an HTML label (depth-counted)', () => {
    expect(kinds('l=<a<b>c>')).toEqual(['code:l=', 'html:<a<b>c>']);
  });

  it('captures // and # and /* */ comments', () => {
    expect(kinds('a // c\n')).toEqual(['code:a ', 'comment:// c', 'code:\n']);
    expect(kinds('x /* c */ y')).toEqual(['code:x ', 'comment:/* c */', 'code: y']);
    expect(kinds('# c\n')).toEqual(['comment:# c', 'code:\n']);
  });

  it('marks an unterminated string as not closed', () => {
    const spans = scanDot('a="oops');
    const str = spans.find((s) => s.kind === 'string');
    expect(str?.closed).toBe(false);
  });

  it('honors escaped quotes inside strings', () => {
    expect(kinds('"a\\"b"')).toEqual(['string:"a\\"b"']);
  });
});

describe('checkBalance', () => {
  it('accepts balanced braces and brackets', () => {
    expect(checkBalance('digraph { a [shape=box]; }').balanced).toBe(true);
  });

  it('ignores braces inside strings and comments', () => {
    expect(checkBalance('a="{"; // }\n').balanced).toBe(true);
  });

  it('reports an unclosed brace', () => {
    const r = checkBalance('digraph { a');
    expect(r.balanced).toBe(false);
    expect(r.error?.message).toMatch(/Unclosed/);
  });

  it('reports a mismatched closer', () => {
    expect(checkBalance('a[ }').balanced).toBe(false);
  });

  it('reports an unterminated string', () => {
    const r = checkBalance('a="oops');
    expect(r.balanced).toBe(false);
    expect(r.error?.message).toMatch(/Unterminated string/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/editor/scan-dot.test.ts`
Expected: FAIL — cannot find module `scan-dot`.

- [ ] **Step 3: Write `scan-dot.ts`**

Create `src/editor/scan-dot.ts`:

```ts
export type SpanKind = 'code' | 'string' | 'html' | 'comment';

export interface Span {
  kind: SpanKind;
  from: number;
  to: number;
  closed: boolean;
}

/** Split DOT source into contiguous spans, isolating literal regions from code. */
export function scanDot(source: string): Span[] {
  const spans: Span[] = [];
  const n = source.length;
  let i = 0;
  let codeStart = 0;

  const flushCode = (to: number): void => {
    if (to > codeStart) spans.push({ kind: 'code', from: codeStart, to, closed: true });
  };

  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];

    if (c === '"') {
      flushCode(i);
      const from = i;
      i++;
      let closed = false;
      while (i < n) {
        const ch = source[i];
        if (ch === '\\') {
          i += 2;
          continue;
        }
        i++;
        if (ch === '"') {
          closed = true;
          break;
        }
      }
      spans.push({ kind: 'string', from, to: i, closed });
      codeStart = i;
      continue;
    }

    if (c === '<') {
      flushCode(i);
      const from = i;
      i++;
      let depth = 1;
      while (i < n && depth > 0) {
        const ch = source[i];
        if (ch === '<') depth++;
        else if (ch === '>') depth--;
        i++;
      }
      spans.push({ kind: 'html', from, to: i, closed: depth === 0 });
      codeStart = i;
      continue;
    }

    if ((c === '/' && c2 === '/') || c === '#') {
      flushCode(i);
      const from = i;
      while (i < n && source[i] !== '\n') i++;
      spans.push({ kind: 'comment', from, to: i, closed: true });
      codeStart = i;
      continue;
    }

    if (c === '/' && c2 === '*') {
      flushCode(i);
      const from = i;
      i += 2;
      let closed = false;
      while (i < n) {
        if (source[i] === '*' && source[i + 1] === '/') {
          i += 2;
          closed = true;
          break;
        }
        i++;
      }
      spans.push({ kind: 'comment', from, to: i, closed });
      codeStart = i;
      continue;
    }

    i++;
  }
  flushCode(n);
  return spans;
}

export interface BalanceResult {
  balanced: boolean;
  error?: { pos: number; message: string };
}

const CLOSERS: Record<string, string> = { '}': '{', ']': '[' };

/** Check {} / [] balance and literal termination, ignoring delimiters inside literals. */
export function checkBalance(source: string): BalanceResult {
  const stack: { ch: string; pos: number }[] = [];
  for (const span of scanDot(source)) {
    if (span.kind !== 'code') {
      if (!span.closed) {
        return { balanced: false, error: { pos: span.from, message: `Unterminated ${span.kind}` } };
      }
      continue;
    }
    for (let i = span.from; i < span.to; i++) {
      const ch = source[i];
      if (ch === '{' || ch === '[') {
        stack.push({ ch, pos: i });
      } else if (ch === '}' || ch === ']') {
        const open = stack.pop();
        if (!open || open.ch !== CLOSERS[ch]) {
          return { balanced: false, error: { pos: i, message: `Unmatched '${ch}'` } };
        }
      }
    }
  }
  if (stack.length > 0) {
    const top = stack[stack.length - 1];
    return { balanced: false, error: { pos: top.pos, message: `Unclosed '${top.ch}'` } };
  }
  return { balanced: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/editor/scan-dot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/scan-dot.ts test/editor/scan-dot.test.ts
git commit -m "feat(editor): literal-aware DOT scanner + delimiter balance check"
```

---

### Task 3: Prettify / format (`format.ts`)

**Files:**
- Create: `src/editor/format.ts`
- Test: `test/editor/format.test.ts`

**Interfaces:**
- Consumes: `scanDot`, `checkBalance` from `scan-dot`.
- Produces: `formatDot(source: string, opts?: { indent?: string }): string` — reindent by `{}` depth, normalize spacing in code regions, preserve literals verbatim; **idempotent**; returns `source` unchanged when `checkBalance` fails.

- [ ] **Step 1: Write the failing test**

Create `test/editor/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDot } from '../../src/editor/format';

describe('formatDot', () => {
  it('reindents by brace depth with 2 spaces', () => {
    const out = formatDot('digraph G {\na->b;\n}');
    expect(out).toBe('digraph G {\n  a -> b;\n}');
  });

  it('dedents the closing brace to its block level', () => {
    const out = formatDot('digraph {\nsubgraph c {\nx;\n}\n}');
    expect(out).toBe('digraph {\n  subgraph c {\n    x;\n  }\n}');
  });

  it('normalizes spacing around -> and -- but not inside strings', () => {
    expect(formatDot('a->b')).toBe('a -> b');
    expect(formatDot('a--b')).toBe('a -- b');
    expect(formatDot('n [label="a->b"]')).toBe('n [label="a->b"]');
  });

  it('is idempotent', () => {
    const messy = 'digraph{a->b;subgraph s{c--d}}';
    const once = formatDot(messy);
    expect(formatDot(once)).toBe(once);
  });

  it('preserves a multi-line HTML label verbatim', () => {
    const src = 'n [label=<\n  <b>hi</b>\n>];';
    expect(formatDot(src)).toContain('<b>hi</b>');
  });

  it('collapses runs of blank lines to one', () => {
    expect(formatDot('a;\n\n\n\nb;')).toBe('a;\n\nb;');
  });

  it('returns the input unchanged when braces are unbalanced (fail-safe)', () => {
    const broken = 'digraph { a';
    expect(formatDot(broken)).toBe(broken);
  });

  it('preserves a single trailing newline', () => {
    expect(formatDot('a;\n')).toBe('a;\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/editor/format.test.ts`
Expected: FAIL — cannot find module `format`.

- [ ] **Step 3: Write `format.ts`**

Create `src/editor/format.ts`:

```ts
import { checkBalance, scanDot, type Span } from './scan-dot';

/** True if `offset` falls strictly inside a non-code (literal) span. */
function insideLiteral(spans: Span[], offset: number): boolean {
  return spans.some((s) => s.kind !== 'code' && offset > s.from && offset < s.to);
}

/** Normalize spacing in the code portions of a single line; literals pass through verbatim. */
function normalizeLine(line: string, lineStart: number, spans: Span[]): string {
  let out = '';
  for (let i = 0; i < line.length; ) {
    const abs = lineStart + i;
    const span = spans.find((s) => abs >= s.from && abs < s.to);
    if (span && span.kind !== 'code') {
      const end = Math.min(span.to - lineStart, line.length);
      out += line.slice(i, end);
      i = end;
      continue;
    }
    out += line[i];
    i++;
  }
  // Code-only transforms (literals already copied verbatim above are unaffected
  // because they contain no bare -> / -- / runs we target; guard below re-checks).
  return out
    .replace(/\s*(->|--)\s*/g, (m, op, idx) => (isInLiteral(out, idx) ? m : ` ${op} `))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/g, '');
}

/** Best-effort check whether a match index sits inside a quoted/HTML region of `s`. */
function isInLiteral(s: string, idx: number): boolean {
  let inStr = false;
  let inHtml = 0;
  for (let i = 0; i < idx; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (inHtml > 0) {
      if (c === '<') inHtml++;
      else if (c === '>') inHtml--;
    } else if (c === '"') inStr = true;
    else if (c === '<') inHtml++;
  }
  return inStr || inHtml > 0;
}

/** Count net code-level brace depth change on a line and its leading dedent. */
function braceDelta(line: string, lineStart: number, spans: Span[]): { open: number; leadingClose: number } {
  let open = 0;
  let leadingClose = 0;
  let seenNonClose = false;
  for (let i = 0; i < line.length; i++) {
    const abs = lineStart + i;
    const span = spans.find((s) => abs >= s.from && abs < s.to);
    if (span && span.kind !== 'code') continue;
    const ch = line[i];
    if (ch === '{') {
      open++;
      seenNonClose = true;
    } else if (ch === '}') {
      open--;
      if (!seenNonClose) leadingClose++;
    } else if (!/\s/.test(ch)) {
      seenNonClose = true;
    }
  }
  return { open, leadingClose };
}

export function formatDot(source: string, opts: { indent?: string } = {}): string {
  if (!checkBalance(source).balanced) return source; // fail-safe

  const indentUnit = opts.indent ?? '  ';
  const spans = scanDot(source);
  const lines = source.split('\n');
  const lineStarts: number[] = [];
  {
    let off = 0;
    for (const ln of lines) {
      lineStarts.push(off);
      off += ln.length + 1;
    }
  }

  const out: string[] = [];
  let depth = 0;
  let pendingBlank = false;
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const start = lineStarts[li];

    if (insideLiteral(spans, start)) {
      out.push(raw); // continuation line of a multi-line literal — verbatim
      pendingBlank = false;
      continue;
    }

    if (raw.trim() === '') {
      pendingBlank = true;
      continue;
    }
    if (pendingBlank && out.length > 0) out.push('');
    pendingBlank = false;

    const { open, leadingClose } = braceDelta(raw, start, spans);
    const lineDepth = Math.max(0, depth - leadingClose);
    out.push(indentUnit.repeat(lineDepth) + normalizeLine(raw, start, spans).trim());
    depth = Math.max(0, depth + open);
  }

  let result = out.join('\n');
  if (source.endsWith('\n') && !result.endsWith('\n')) result += '\n';
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/editor/format.test.ts`
Expected: PASS. If the idempotency or multi-line-literal test fails, fix `formatDot` (do not weaken the test) — those two properties are the point of this task.

- [ ] **Step 5: Commit**

```bash
git add src/editor/format.ts test/editor/format.test.ts
git commit -m "feat(editor): idempotent, literal-safe DOT formatter (formatDot)"
```

---

### Task 4: Richer structural linting (`structure-lint.ts` + `linting.ts`)

**Files:**
- Create: `src/editor/structure-lint.ts`
- Modify: `src/editor/linting.ts` (combine the structural source into the returned extension)
- Test: `test/editor/structure-lint.test.ts`

**Interfaces:**
- Consumes: `checkBalance`, `scanDot` from `scan-dot`; `DOT_ATTRIBUTES` from `dot-data`.
- Produces: `structuralDiagnostics(source: string): { from: number; to: number; severity: 'error' | 'warning'; message: string }[]` (pure — position-based diagnostics, framework-agnostic). `createStructureLintSource()` in `structure-lint.ts` adapts it to a CodeMirror `LintSource`. `linting.ts` `createDotLinter` returns `Extension[]` (engine linter + structural linter).

- [ ] **Step 1: Write the failing test**

Create `test/editor/structure-lint.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { structuralDiagnostics } from '../../src/editor/structure-lint';

const messages = (src: string) => structuralDiagnostics(src).map((d) => d.message);

describe('structuralDiagnostics', () => {
  it('reports nothing for valid DOT', () => {
    expect(structuralDiagnostics('digraph { a -> b; a [shape=box]; }')).toEqual([]);
  });

  it('flags an unclosed brace', () => {
    expect(messages('digraph { a').some((m) => /Unclosed/.test(m))).toBe(true);
  });

  it('flags an unknown attribute name', () => {
    expect(messages('a [shp=box];').some((m) => /Unknown attribute 'shp'/.test(m))).toBe(true);
  });

  it('does not flag a known attribute', () => {
    expect(messages('a [shape=box];')).toEqual([]);
  });

  it('flags a missing = in an attribute list', () => {
    expect(messages('a [shape box];').some((m) => /missing '='/i.test(m))).toBe(true);
  });

  it('ignores attribute-looking text inside strings', () => {
    expect(structuralDiagnostics('a [label="shp=1"];')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/editor/structure-lint.test.ts`
Expected: FAIL — cannot find module `structure-lint`.

- [ ] **Step 3: Write `structure-lint.ts`**

Create `src/editor/structure-lint.ts`:

```ts
import type { Diagnostic, LintSource } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import { DOT_ATTRIBUTES } from './dot-data';
import { checkBalance, scanDot } from './scan-dot';

export interface StructuralDiagnostic {
  from: number;
  to: number;
  severity: 'error' | 'warning';
  message: string;
}

const ATTR_SET = new Set(DOT_ATTRIBUTES.map((a) => a.toLowerCase()));

/** Pure structural analysis: delimiter balance + attribute-list sanity. */
export function structuralDiagnostics(source: string): StructuralDiagnostic[] {
  const out: StructuralDiagnostic[] = [];

  const balance = checkBalance(source);
  if (!balance.balanced && balance.error) {
    out.push({
      from: balance.error.pos,
      to: Math.min(balance.error.pos + 1, source.length),
      severity: 'error',
      message: balance.error.message,
    });
    return out; // don't attribute-scan structurally broken input
  }

  // Walk code spans, find attribute lists [ ... ], check each entry.
  for (const span of scanDot(source)) {
    if (span.kind !== 'code') continue;
    const text = source.slice(span.from, span.to);
    const listRe = /\[([^\]]*)\]/g;
    let m: RegExpExecArray | null;
    while ((m = listRe.exec(text)) !== null) {
      const listStart = span.from + m.index + 1;
      for (const entry of splitTopLevel(m[1])) {
        const trimmed = entry.text.trim();
        if (trimmed === '') continue;
        const at = listStart + entry.offset + (entry.text.length - entry.text.trimStart().length);
        const eq = trimmed.indexOf('=');
        if (eq === -1) {
          out.push({
            from: at,
            to: at + trimmed.length,
            severity: 'warning',
            message: `Attribute '${trimmed}' is missing '=' value`,
          });
          continue;
        }
        const name = trimmed.slice(0, eq).trim();
        if (name && /^[A-Za-z_]\w*$/.test(name) && !ATTR_SET.has(name.toLowerCase())) {
          out.push({
            from: at,
            to: at + name.length,
            severity: 'warning',
            message: `Unknown attribute '${name}'`,
          });
        }
      }
    }
  }
  return out;
}

/** Split an attribute-list body on commas and semicolons, tracking each entry's offset. */
function splitTopLevel(body: string): { text: string; offset: number }[] {
  const parts: { text: string; offset: number }[] = [];
  let start = 0;
  for (let i = 0; i <= body.length; i++) {
    const ch = body[i];
    if (i === body.length || ch === ',' || ch === ';') {
      parts.push({ text: body.slice(start, i), offset: start });
      start = i + 1;
    }
  }
  return parts;
}

/** CodeMirror LintSource wrapping the pure structural analysis. */
export function createStructureLintSource(): LintSource {
  return (view: EditorView): Diagnostic[] =>
    structuralDiagnostics(view.state.doc.toString()).map((d) => ({
      from: d.from,
      to: d.to,
      severity: d.severity,
      message: d.message,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/editor/structure-lint.test.ts`
Expected: PASS.

- [ ] **Step 5: Combine the structural linter in `linting.ts`**

In `src/editor/linting.ts`, change `createDotLinter` to return both linters. Add the import at the top:

```ts
import { createStructureLintSource } from './structure-lint';
```

Replace the `createDotLinter` body (currently returns a single `linter(...)`) with:

```ts
export function createDotLinter(options: DotLinterOptions): Extension {
  const delay = options.delay ?? DEFAULT_LINT_DELAY;
  return [
    linter(createDotLintSource(options), { delay }),
    linter(createStructureLintSource(), { delay: 200 }),
  ];
}
```

(`Extension` already accepts an array; `main.ts` uses the return value directly in its extensions list, so no caller change is needed. The existing engine linter is unchanged.)

- [ ] **Step 6: Verify linting + full suite**

Run: `npx vitest run test/editor/ ` then `npx vitest run` (full)
Expected: PASS. `pnpm lint` clean.

- [ ] **Step 7: Commit**

```bash
git add src/editor/structure-lint.ts src/editor/linting.ts test/editor/structure-lint.test.ts
git commit -m "feat(editor): local structural DOT linting (balance, unknown/malformed attrs)"
```

---

### Task 5: DOT autocomplete + snippets (`autocomplete.ts`)

**Files:**
- Create: `src/editor/autocomplete.ts`
- Modify: `package.json` (add `@codemirror/autocomplete` dependency)
- Test: `test/editor/autocomplete.test.ts`

**Interfaces:**
- Consumes: `DOT_KEYWORDS`, `DOT_ATTRIBUTES`, `DOT_ATTR_VALUES`, `DOT_COLORS`, `isColorAttribute` from `dot-data`.
- Produces: `dotCompletionSource(ctx: CompletionContext): CompletionResult | null` (pure, testable), and `createDotAutocomplete(): Extension` = `autocompletion({ override: [dotCompletionSource], activateOnTyping: true })`.

- [ ] **Step 1: Add the dependency**

Run: `pnpm add @codemirror/autocomplete`
Expected: installs (already present transitively via `codemirror`; this promotes it to a direct dep so `import` resolves under pnpm). `pnpm install` exits 0.

- [ ] **Step 2: Write the failing test**

Create `test/editor/autocomplete.test.ts`:

```ts
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { describe, expect, it } from 'vitest';
import { dotCompletionSource } from '../../src/editor/autocomplete';

/** Build a completion context at the end of `doc` (caret at |, or end if absent). */
function contextAt(doc: string): CompletionContext {
  const pos = doc.includes('|') ? doc.indexOf('|') : doc.length;
  const text = doc.replace('|', '');
  const state = EditorState.create({ doc: text });
  return new CompletionContext(state, pos, true);
}

const labels = (doc: string): string[] => {
  const r = dotCompletionSource(contextAt(doc));
  return r ? r.options.map((o) => o.label) : [];
};

describe('dotCompletionSource', () => {
  it('offers keywords and snippets at statement start', () => {
    const out = labels('digraph G {\n  ');
    expect(out).toEqual(expect.arrayContaining(['subgraph', 'node', 'edge']));
  });

  it('offers attribute names inside an attribute list', () => {
    expect(labels('a [')).toEqual(expect.arrayContaining(['shape', 'label', 'color']));
  });

  it('offers enum values after shape=', () => {
    expect(labels('a [shape=')).toEqual(expect.arrayContaining(['box', 'ellipse', 'record']));
  });

  it('offers colors after fillcolor=', () => {
    expect(labels('a [fillcolor=')).toEqual(expect.arrayContaining(['red', 'blue']));
  });

  it('returns null in the middle of a plain identifier', () => {
    expect(dotCompletionSource(contextAt('mynode'))).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/editor/autocomplete.test.ts`
Expected: FAIL — cannot find module `autocomplete`.

- [ ] **Step 4: Write `autocomplete.ts`**

Create `src/editor/autocomplete.ts`:

```ts
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  snippetCompletion,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import {
  DOT_ATTR_VALUES,
  DOT_ATTRIBUTES,
  DOT_COLORS,
  DOT_KEYWORDS,
  isColorAttribute,
} from './dot-data';

const SNIPPETS: Completion[] = [
  snippetCompletion('subgraph cluster_${1:name} {\n\t${2}\n}', {
    label: 'subgraph cluster',
    type: 'snippet',
  }),
  snippetCompletion('${1:node} [label="${2}", shape=${3:box}];', {
    label: 'node with attributes',
    type: 'snippet',
  }),
  snippetCompletion('${1:a} -> ${2:b};', { label: 'edge', type: 'snippet' }),
];

const KEYWORD_OPTIONS: Completion[] = DOT_KEYWORDS.map((label) => ({ label, type: 'keyword' }));
const ATTR_OPTIONS: Completion[] = DOT_ATTRIBUTES.map((label) => ({ label, type: 'property' }));

function valueOptions(values: readonly string[]): Completion[] {
  return values.map((label) => ({ label, type: 'enum' }));
}

export function dotCompletionSource(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);

  // 1. Attribute value: `attr=` (optionally an opening quote) just before caret.
  const valueMatch = before.match(/(\w+)\s*=\s*"?(\w*)$/);
  if (valueMatch) {
    const attr = valueMatch[1].toLowerCase();
    const values = isColorAttribute(attr) ? DOT_COLORS : DOT_ATTR_VALUES[attr];
    if (values) {
      const word = ctx.matchBefore(/\w*$/);
      return { from: word ? word.from : ctx.pos, options: valueOptions(values), validFor: /\w*/ };
    }
    return null;
  }

  // 2. Attribute name: caret inside an unclosed `[ … ` on this line.
  const lastOpen = before.lastIndexOf('[');
  const lastClose = before.lastIndexOf(']');
  if (lastOpen > lastClose) {
    const word = ctx.matchBefore(/\w*$/);
    return { from: word ? word.from : ctx.pos, options: ATTR_OPTIONS, validFor: /\w*/ };
  }

  // 3. Statement start: keywords + snippets (line so far is blank or ends in { or ;).
  if (/(^|[{;])\s*\w*$/.test(before)) {
    const word = ctx.matchBefore(/\w*$/);
    if (word && word.from === word.to && !ctx.explicit) return null; // nothing typed, implicit
    return {
      from: word ? word.from : ctx.pos,
      options: [...KEYWORD_OPTIONS, ...SNIPPETS],
      validFor: /\w*/,
    };
  }

  return null;
}

export function createDotAutocomplete(): Extension {
  return autocompletion({ override: [dotCompletionSource], activateOnTyping: true });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/editor/autocomplete.test.ts`
Expected: PASS. (If the statement-start test fails because the implicit-empty guard rejects it, note the test uses `explicit: true` via the `CompletionContext(..., true)` constructor, so the guard is bypassed — keep the guard.)

- [ ] **Step 6: Commit**

```bash
git add src/editor/autocomplete.ts package.json pnpm-lock.yaml test/editor/autocomplete.test.ts
git commit -m "feat(editor): DOT-aware autocomplete source + snippets"
```

---

### Task 6: Wire features into the editor + toolbar (search, format, find; e2e)

**Files:**
- Create: `src/editor/search.ts`, `src/toolbar/find.ts`, `src/toolbar/format.ts`
- Modify: `src/main.ts` (`createTabEditor` extensions + toolbar options), `src/toolbar/actions.ts` (find/format wiring + options), `src/index.html` (Find + Format buttons), `src/styles.css` (search panel theme), `package.json` (add `@codemirror/search`)
- Test: `test/e2e/editor-authoring.spec.ts`

**Interfaces:**
- Consumes: `createDotAutocomplete` (Task 5), `formatDot` (Task 3), `@codemirror/search` (`search`, `openSearchPanel`).
- Produces: `createSearch(): Extension`; `setupFind({ button, getEditor })`; `setupFormat({ button, getEditor, onFormat })`; `formatKeymap` binding for Shift-Alt-F.

- [ ] **Step 1: Add the dependency**

Run: `pnpm add @codemirror/search`
Expected: `pnpm install` exits 0.

- [ ] **Step 2: Create `search.ts`**

Create `src/editor/search.ts`:

```ts
import { search } from '@codemirror/search';
import type { Extension } from '@codemirror/state';

/** Search with the panel docked at the top of the editor. */
export function createSearch(): Extension {
  return search({ top: true });
}
```

- [ ] **Step 3: Create the Find toolbar action**

Create `src/toolbar/find.ts`:

```ts
import { openSearchPanel } from '@codemirror/search';
import type { EditorView } from 'codemirror';

export interface FindActionOptions {
  button: HTMLButtonElement | null;
  getEditor: () => EditorView;
}

export function setupFind({ button, getEditor }: FindActionOptions): void {
  if (!button) return;
  button.addEventListener('click', () => {
    const view = getEditor();
    openSearchPanel(view);
    view.focus();
  });
}
```

- [ ] **Step 4: Create the Format toolbar action + keymap**

Create `src/toolbar/format.ts`:

```ts
import type { KeyBinding } from '@codemirror/view';
import type { EditorView } from 'codemirror';
import { formatDot } from '../editor/format';

/** Reformat the given editor's document in a single transaction. */
export function formatView(view: EditorView): boolean {
  const current = view.state.doc.toString();
  const next = formatDot(current);
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
  button.addEventListener('click', () => {
    const view = getEditor();
    if (formatView(view)) onFormat(view.state.doc.toString());
    view.focus();
  });
}

/** Shift-Alt-F keybinding; the run handler reformats and returns true if handled. */
export function makeFormatKeymap(onFormat: (doc: string) => void): KeyBinding {
  return {
    key: 'Shift-Alt-f',
    run: (view) => {
      const changed = formatView(view);
      if (changed) onFormat(view.state.doc.toString());
      return true;
    },
  };
}
```

- [ ] **Step 5: Add the toolbar buttons to `index.html`**

In `src/index.html`, immediately after the Save button block (ends at line 53, before the `<div class="toolbar-separator">` at line 54), insert:

```html
            <button
              type="button"
              class="toolbar-button icon-button"
              aria-label="Find and replace"
              data-action="find"
              data-tooltip="Find (Ctrl+F)"
            >
              <i class="ri-search-line" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              class="toolbar-button icon-button"
              aria-label="Format document"
              data-action="format"
              data-tooltip="Format (Shift+Alt+F)"
            >
              <i class="ri-code-line" aria-hidden="true"></i>
            </button>
```

- [ ] **Step 6: Wire buttons in `actions.ts`**

In `src/toolbar/actions.ts`: add imports and two options fields, and call the setups.

At the top with the other imports:

```ts
import { setupFind } from './find';
import { setupFormat } from './format';
```

In `ToolbarActionsOptions`, add:

```ts
  findButton: HTMLButtonElement | null;
  formatButton: HTMLButtonElement | null;
  onFormat: (doc: string) => void;
```

In `setupToolbarActions`, after the `setupSaveDiagramAction({...})` call, add:

```ts
  setupFind({ button: options.findButton, getEditor });
  setupFormat({ button: options.formatButton, getEditor, onFormat: options.onFormat });
```

- [ ] **Step 7: Wire extensions + options in `main.ts`**

In `src/main.ts`:
- Add imports near the other editor imports (after line 10):

```ts
import { createDotAutocomplete } from './editor/autocomplete';
import { createSearch } from './editor/search';
import { makeFormatKeymap } from './toolbar/format';
```

- In `createTabEditor`'s `extensions` array (lines 128-147), add these three entries (e.g. right after `DOT_LANGUAGE` on line 130):

```ts
      createDotAutocomplete(),
      createSearch(),
      keymap.of([makeFormatKeymap((doc) => schedulePreviewRender(doc))]),
```

(`keymap` is already imported in main.ts — it's used at line 135. `schedulePreviewRender` is already in scope.)

- Where `setupToolbarActions({...})` is called in `main.ts`, add the three new options. Query the buttons alongside the existing button lookups and pass:

```ts
    findButton: document.querySelector<HTMLButtonElement>('[data-action="find"]'),
    formatButton: document.querySelector<HTMLButtonElement>('[data-action="format"]'),
    onFormat: (doc) => {
      const tab = tabManager.getActiveTab();
      if (tab) handleDocChange(tab, doc);
      schedulePreviewRender(doc);
    },
```

(Match the existing `document.querySelector` style used for the other toolbar buttons in main.ts. If buttons are looked up via a helper, follow that pattern instead.)

- [ ] **Step 8: Theme the search panel in `styles.css`**

Append to `src/styles.css` (mirror the toolbar/dialog token usage already in the file — background, border, radius, and input styling consistent with `.toolbar-button`/`.help-dialog`):

```css
/* CodeMirror find/replace panel — themed to match the app toolbar. */
.cm-panels.cm-panels-top {
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.cm-search {
  padding: 6px 8px;
  background: var(--panel-bg, #f8fafc);
  font: inherit;
}
.cm-search .cm-textfield {
  padding: 2px 6px;
  border: 1px solid var(--border, #cbd5e1);
  border-radius: 6px;
  background: var(--input-bg, #fff);
  color: inherit;
}
.cm-search .cm-button {
  padding: 2px 8px;
  margin-left: 4px;
  border-radius: 6px;
  border: 1px solid var(--border, #cbd5e1);
  background: var(--button-bg, #fff);
  cursor: pointer;
}
```

(Use the actual CSS variable names the app already defines; if it uses fixed colors rather than variables, match the values used by `.help-dialog` / `.toolbar-button`.)

- [ ] **Step 9: Write the e2e test**

Create `test/e2e/editor-authoring.spec.ts`:

```ts
import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { launchApp, selectors, setEditorContent, waitForAppReady } from './helpers';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  ({ app, page } = await launchApp());
  await waitForAppReady(page);
});
test.afterEach(async () => {
  await app.close();
});

test.describe('Editor authoring', () => {
  test('Find button opens the search panel', async () => {
    await page.locator('[data-action="find"]').click();
    await expect(page.locator('.cm-search')).toBeVisible();
  });

  test('Ctrl+F opens the search panel', async () => {
    await page.locator(selectors.editor).first().click();
    await page.keyboard.press('Control+f');
    await expect(page.locator('.cm-search')).toBeVisible();
  });

  test('Format button reindents a messy diagram', async () => {
    await setEditorContent(page, 'digraph G {\na->b;\n}');
    await page.locator('[data-action="format"]').click();
    const text = await page.locator(selectors.editor).first().innerText();
    expect(text).toContain('  a -> b;');
  });
});
```

(If `selectors.editor`/`setEditorContent`/`waitForAppReady` differ in `test/e2e/helpers.ts`, match the existing helper names used by `export.spec.ts`.)

- [ ] **Step 10: Verify + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: unit suite green.
Run: `pnpm test:e2e -- editor-authoring.spec.ts` (or the full e2e run)
Expected: the 3 new e2e tests pass.

```bash
git add src/editor/search.ts src/toolbar/find.ts src/toolbar/format.ts src/main.ts \
  src/toolbar/actions.ts src/index.html src/styles.css package.json pnpm-lock.yaml \
  test/e2e/editor-authoring.spec.ts
git commit -m "feat(editor): wire autocomplete, find/replace, and format into editor + toolbar"
```

---

### Task 7: Release v1.2.0

**Files:**
- Modify: `package.json` (version `1.1.0` → `1.2.0`), `CHANGELOG.md`

**Interfaces:** none.

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "1.1.0"` to `"version": "1.2.0"`.

- [ ] **Step 2: Add the CHANGELOG entry**

In `CHANGELOG.md`, add a new section directly above `## [1.1.0]`:

```markdown
## [1.2.0] - 2026-07-02

### Added

- DOT-aware autocomplete with snippets: keyword, attribute-name, and
  attribute-value (enum/color) completions, plus subgraph/node/edge snippet
  templates (Ctrl+Space or type to trigger).
- Find & replace: a themed search panel (Ctrl+F / Ctrl+H, F3 to cycle) plus a
  toolbar Find button.
- Format document: reindents by brace depth and normalizes spacing without
  touching string/HTML-label/comment content (toolbar Format button or
  Shift+Alt+F). Idempotent and fail-safe on unbalanced input.
- Richer linting: fast local diagnostics for unbalanced delimiters, unknown
  attribute names, and attribute entries missing a value — alongside the
  existing Graphviz engine validation.
```

- [ ] **Step 3: Full gate + build**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.
Run: `pnpm build && pnpm package`
Expected: `dist/`/`dist-electron/` built and a Windows NSIS installer produced under `release/` (e.g. `GraphvizJS Setup 1.2.0.exe`).

- [ ] **Step 4: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): 1.2.0 (editor & authoring)"
```

---

## Self-Review

**1. Spec coverage:**
- Shared `dot-data.ts` → Task 1. Shared `scan-dot.ts` → Task 2 (spec's risk-mitigation "one shared scanner" — used by Task 3 formatter and Task 4 linter). ✓
- Autocomplete + snippets (keywords/attr names/enum+color values, contexts) → Task 5. ✓
- Find & replace exposed + themed → Task 6 (search.ts + find.ts + styles). ✓
- Prettify/format (idempotent, literal-safe, fail-safe) → Task 3 + wiring in Task 6. **Deviation from spec:** the spec said "one statement per line"; the plan scopes the formatter to reindent + spacing only and does **not** split statements (statement-splitting without a parser risks corruption and non-idempotency). Flagged for the human at plan approval; success criteria updated to reindent/spacing/idempotent/literal-safe.
- Richer linting (balance, unknown attr, missing `=`, advisory, combined with engine) → Task 4. ✓
- Release v1.2.0 (version, CHANGELOG, installer) → Task 7. ✓
- Deps as direct runtime dependencies → Task 5 (`@codemirror/autocomplete`), Task 6 (`@codemirror/search`). ✓

**2. Placeholder scan:** No TBD/"handle edge cases"/"similar to Task N". Each code step shows complete code; wiring steps that depend on repo-specific names (main.ts button lookup style, styles.css variables, e2e helper names) explicitly instruct "match the existing pattern" with the concrete pattern named — these are integration adaptations, not placeholders.

**3. Type consistency:** `scanDot`/`checkBalance`/`Span` (Task 2) are consumed with the same signatures in Tasks 3 & 4. `formatDot(source, opts?)` (Task 3) is called by `formatView` (Task 6). `dotCompletionSource(ctx)`/`createDotAutocomplete()` (Task 5) consumed in Task 6's `main.ts`. `structuralDiagnostics`/`createStructureLintSource` (Task 4) — `createDotLinter` returns `Extension[]`, and `main.ts` already spreads its result into an extensions array (array-of-extensions is valid). `setupFind`/`setupFormat`/`makeFormatKeymap` (Task 6) names match their `actions.ts`/`main.ts` call sites.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-02-graphvizjs-editor-authoring.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks.
2. **Inline Execution** — execute in this session with checkpoints.

Which approach?
