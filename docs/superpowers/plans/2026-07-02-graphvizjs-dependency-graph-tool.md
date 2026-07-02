# Dependency-Graph Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `pnpm graph` dev tool that scans GraphvizJS `src/` (+ `test/`) and emits up-to-date architecture docs — module map, circular-dependency and unused-export reports, a `src`↔`test` coverage map, a renderer↔Electron IPC-boundary check, stats, and a Mermaid diagram — as Markdown + JSON + `.mermaid` under `docs/architecture/`.

**Architecture:** Port + modularize the reusable core of `MathTS/tools/create-dependency-graph/` (regex-based static import/export analysis; runtime deps: `node:fs`/`node:path` only) into focused, testable units under `tools/dependency-graph/`. Strip all MathTS-specific analyzers (WASM/parallel pairing, monorepo/workspace, mathjs coverage-policy, `js-yaml`). Add two GraphvizJS-specific analyzers: an IPC-boundary check and a `src`↔`test` coverage map. Run via a `tsx` devDependency (Node 20 CI can't strip TS types from a bare `node` invocation).

**Tech Stack:** TypeScript (ESM, `moduleResolution: Bundler`, `verbatimModuleSyntax`), `tsx` (dev runner), Vitest (unit + smoke tests), Biome (lint/format). No new runtime dependency ships in the app.

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from repo config.

- **Biome style** (`biome.jsonc`): 2-space indent, single quotes, semicolons always, trailing commas `es5`, 100-char line width, LF endings. `noExplicitAny` = error (no `any`). `useConst` = error. Run `pnpm lint` (`biome check .`) — must be clean. `pnpm lint:fix` autofixes format.
- **TypeScript** (`tsconfig.json`): `strict: true`, `verbatimModuleSyntax: true` (⇒ type-only imports MUST use `import type`), `moduleResolution: "Bundler"` (⇒ extensionless relative imports, matching existing `src/`). `pnpm typecheck` (`tsc --noEmit`) must be clean.
- **Node built-ins**: import with the `node:` prefix (e.g. `import { readFileSync } from 'node:fs'`).
- **Path convention**: all recorded file paths are **repo-relative, POSIX-separated** (e.g. `src/preview/render.ts`). Convert Windows walk paths via `relative(root, abs).split(sep).join('/')`. Resolve relative import specifiers with `path.posix`.
- **Exclusions when scanning**: skip directory names `dist`, `dist-electron`, `node_modules`, `coverage`; skip files ending `.d.ts`. Under `test/`, additionally skip the `e2e/` subtree.
- **Test layout** (`vitest.config.ts`): unit/smoke tests live in `test/**/*.test.ts` (picked up automatically); e2e excluded. Tool tests go under `test/tools/`. Coverage `include` is `src/**` only — tool code is not subject to app coverage thresholds.
- **Output location**: `docs/architecture/` (committed snapshot; regenerated on demand). Kept separate from `docs/superpowers/` (specs/plans).

---

### Task 1: Types + scanner (`types.ts`, `scan.ts`)

**Files:**
- Create: `tools/dependency-graph/types.ts`
- Create: `tools/dependency-graph/scan.ts`
- Test: `test/tools/scan.test.ts`

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces:
  - `types.ts` exports the shared interfaces used by every later task (see code).
  - `scan.ts` exports:
    - `scanDir(root: string, subdir: string): ParsedFile[]` — recursively walk `${root}/${subdir}`, parse each `.ts` file (excluding `.d.ts` and the excluded dirs), return `ParsedFile[]` with repo-relative POSIX `path`.
    - `parseFile(relPath: string, content: string): ParsedFile` — pure regex parse of one file's internal deps + exported names + LOC.
    - `resolveImport(fromRelPath: string, spec: string): string | null` — resolve a relative import specifier to a repo-relative POSIX `.ts` path (handles directory `index.ts`); returns `null` for non-relative specifiers.

- [ ] **Step 1: Write the failing test**

Create `test/tools/scan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseFile, resolveImport } from '../../tools/dependency-graph/scan';

describe('parseFile', () => {
  it('records relative runtime imports and their identifiers', () => {
    const f = parseFile(
      'src/preview/render.ts',
      "import { initGraphviz } from './graphviz';\nimport { debounce } from '../utils/debounce';\n"
    );
    expect(f.internalDeps).toEqual([
      { file: './graphviz', imports: ['initGraphviz'], typeOnly: false },
      { file: '../utils/debounce', imports: ['debounce'], typeOnly: false },
    ]);
  });

  it('flags `import type` and fully-inline-type imports as typeOnly', () => {
    const f = parseFile(
      'src/a.ts',
      "import type { TabState } from './manager';\nimport { type Foo } from './b';\n"
    );
    expect(f.internalDeps[0].typeOnly).toBe(true);
    expect(f.internalDeps[1].typeOnly).toBe(true);
  });

  it('ignores non-relative (package/node) imports', () => {
    const f = parseFile('src/a.ts', "import { EditorView } from '@codemirror/view';\n");
    expect(f.internalDeps).toEqual([]);
  });

  it('collects exported identifiers across const/function/class/interface/type', () => {
    const f = parseFile(
      'src/a.ts',
      'export const X = 1;\nexport function go() {}\nexport class C {}\nexport interface I {}\nexport type T = number;\n'
    );
    expect(new Set(f.exports)).toEqual(new Set(['X', 'go', 'C', 'I', 'T']));
  });

  it('records exported alias from `export { local as Public }`', () => {
    const f = parseFile('src/a.ts', 'const local = 1;\nexport { local as Public };\n');
    expect(f.exports).toContain('Public');
  });

  it('counts lines of code', () => {
    expect(parseFile('src/a.ts', 'a\nb\nc').loc).toBe(3);
  });
});

describe('resolveImport', () => {
  it('resolves a sibling module to a .ts path', () => {
    expect(resolveImport('src/preview/render.ts', './graphviz')).toBe('src/preview/graphviz.ts');
  });
  it('resolves a parent-relative module', () => {
    expect(resolveImport('src/preview/render.ts', '../utils/debounce')).toBe('src/utils/debounce.ts');
  });
  it('resolves a directory import to its index.ts', () => {
    expect(resolveImport('src/toolbar/actions.ts', '../tabs')).toBe('src/tabs/index.ts');
  });
  it('resolves a test file importing into src', () => {
    expect(resolveImport('test/preview/render.test.ts', '../../src/preview/render')).toBe(
      'src/preview/render.ts'
    );
  });
  it('returns null for non-relative specifiers', () => {
    expect(resolveImport('src/a.ts', '@hpcc-js/wasm')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools/scan.test.ts`
Expected: FAIL — cannot find module `../../tools/dependency-graph/scan`.

- [ ] **Step 3: Write `types.ts`**

Create `tools/dependency-graph/types.ts`:

```ts
/** One resolved-or-unresolved internal (relative) import from a source file. */
export interface InternalDep {
  /** Raw specifier as written, e.g. './render' or '../utils/debounce'. */
  file: string;
  /** Imported identifiers; '*' for namespace or re-export-all. */
  imports: string[];
  /** True if every binding is type-only (`import type` or all `{ type X }`). */
  typeOnly: boolean;
}

/** A parsed source file: its internal deps, exported names, and size. */
export interface ParsedFile {
  /** Repo-relative POSIX path, e.g. 'src/preview/render.ts'. */
  path: string;
  internalDeps: InternalDep[];
  /** Exported identifier names (deduped). */
  exports: string[];
  /** Line count. */
  loc: number;
}

/** module name -> list of repo-relative file paths in that module. */
export type ModuleMap = Map<string, string[]>;

/** module name -> set of module names it depends on (folder-level edges). */
export type ModuleEdges = Map<string, Set<string>>;

export interface CycleReport {
  /** Cycles present in the runtime (value) import graph. */
  runtime: string[][];
  /** Cycles present only when type-only edges are included. */
  typeOnly: string[][];
}

export interface UnusedReport {
  /** Non-entry files that nothing imports. */
  unusedFiles: string[];
  /** Exports that no file (src or test) imports by name. */
  unusedExports: { file: string; name: string }[];
}

export interface CoverageRow {
  /** A src file. */
  file: string;
  /** Test files that import it (directly). */
  testFiles: string[];
}

export interface IpcChannel {
  channel: string;
  /** The GraphvizApi method that exposes this channel (from preload), if any. */
  method?: string;
  hasContract: boolean;
  hasPreload: boolean;
  hasHandler: boolean;
}

export interface IpcReport {
  /** contract method -> preload invoke -> main handle. */
  fullyWired: IpcChannel[];
  /** preload invoke with no ipcMain.handle (latent bug: invoke would reject). */
  missingHandlers: IpcChannel[];
  /** ipcMain.handle with no preload invoke (orphan/dead handler). */
  orphanHandlers: IpcChannel[];
}

export interface Stats {
  fileCount: number;
  moduleCount: number;
  totalLoc: number;
  /** File-level internal edges (resolved). */
  edgeCount: number;
  exportCount: number;
}

export interface Analysis {
  files: ParsedFile[];
  testFiles: ParsedFile[];
  modules: ModuleMap;
  moduleEdges: ModuleEdges;
  cycles: CycleReport;
  unused: UnusedReport;
  coverage: CoverageRow[];
  ipc: IpcReport;
  stats: Stats;
}

export interface CliOptions {
  /** Reserved flag: include test-only files as their own module rows. */
  includeTests: boolean;
}
```

- [ ] **Step 4: Write `scan.ts`**

Create `tools/dependency-graph/scan.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { InternalDep, ParsedFile } from './types';

const EXCLUDE_DIRS = new Set(['dist', 'dist-electron', 'node_modules', 'coverage', 'e2e']);

/** Recursively collect repo-relative POSIX paths of .ts files under `${root}/${subdir}`. */
function walk(root: string, dirAbs: string, out: string[]): void {
  for (const entry of readdirSync(dirAbs)) {
    const abs = path.join(dirAbs, entry);
    if (statSync(abs).isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry)) walk(root, abs, out);
      continue;
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue;
    out.push(path.relative(root, abs).split(path.sep).join('/'));
  }
}

export function scanDir(root: string, subdir: string): ParsedFile[] {
  const files: string[] = [];
  walk(root, path.join(root, subdir), files);
  return files.map((rel) => parseFile(rel, readFileSync(path.join(root, rel), 'utf-8')));
}

// import type { ... } | import { type X, Y } | import D from | import * as NS from
const IMPORT_RE =
  /import\s+(type\s+)?(?:(?:{([^}]+)}|(\w+)|\*\s+as\s+(\w+)))\s+from\s+['"]([^'"]+)['"]/g;

function parseImports(content: string): InternalDep[] {
  const deps: InternalDep[] = [];
  let m: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const isTypeOnly = !!m[1];
    const named = m[2] ?? '';
    const def = m[3] ?? '';
    const ns = m[4] ?? '';
    const source = m[5];
    if (!source.startsWith('.')) continue; // internal (relative) only

    const imports: string[] = [];
    let hasRuntime = !isTypeOnly;
    if (named) {
      for (const raw of named.split(',')) {
        const item = raw.trim();
        if (!item) continue;
        const inlineType = item.startsWith('type ');
        const name = item.replace(/^type\s+/, '').split(' as ')[0].trim();
        if (name) {
          imports.push(name);
          if (!inlineType && !isTypeOnly) hasRuntime = true;
        }
      }
    }
    if (def) imports.push(def);
    if (ns) imports.push(`* as ${ns}`);
    deps.push({ file: source, imports, typeOnly: isTypeOnly || !hasRuntime });
  }
  return deps;
}

function parseExports(content: string): string[] {
  const names = new Set<string>();
  const push = (re: RegExp) => {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) names.add(m[1]);
  };
  push(/export\s+(?:const|let|var)\s+(\w+)/g);
  push(/export\s+(?:async\s+)?function\s+(\w+)/g);
  push(/export\s+class\s+(\w+)/g);
  push(/export\s+interface\s+(\w+)/g);
  push(/export\s+type\s+(\w+)/g);
  push(/export\s+enum\s+(\w+)/g);

  // export { local as Public, other } — record the exported (post-`as`) name.
  const namedRe = /export\s*{\s*([^}]+)\s*}(?!\s*from)/g;
  let m: RegExpExecArray | null;
  while ((m = namedRe.exec(content)) !== null) {
    for (const raw of m[1].split(',')) {
      const parts = raw.split(' as ');
      const name = parts[parts.length - 1].replace(/\btype\b/, '').trim();
      if (name) names.add(name);
    }
  }
  return [...names];
}

export function parseFile(relPath: string, content: string): ParsedFile {
  return {
    path: relPath,
    internalDeps: parseImports(content),
    exports: parseExports(content),
    loc: content.split('\n').length,
  };
}

/** Resolve a relative specifier to a repo-relative POSIX `.ts` path (or null). */
export function resolveImport(fromRelPath: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const fromDir = path.posix.dirname(fromRelPath);
  const joined = path.posix.normalize(path.posix.join(fromDir, spec));
  return joined.endsWith('.ts') ? joined : `${joined}.ts`;
}
```

Note: `resolveImport` returns a canonical `<path>.ts` form; the directory-import test (`../tabs` → `src/tabs/index.ts`) is satisfied by the consumer preferring an existing `${joined}/index.ts` when `${joined}.ts` is not a known file. Adjust: make `resolveImport` directory-aware by accepting the set of known files — but to keep it pure and testable, resolve to `index.ts` when the specifier has no extension and the plain `.ts` sibling would not exist. Implement directory awareness in the caller (Task 3/Task 2) via the known-file set; for the unit test, special-case a trailing bare directory: if `joined` does not contain a final `.` segment AND ends without `.ts`, the caller checks both `${joined}.ts` and `${joined}/index.ts`. To make the Step-1 test pass deterministically, extend `resolveImport` as below.

- [ ] **Step 5: Make `resolveImport` directory-aware (dual-candidate), update code**

Replace `resolveImport` in `scan.ts` with a version that returns the `.ts` candidate but exposes both candidates for the caller, and have the **unit test** assert the primary candidate. Simplest correct implementation that satisfies all Step-1 cases (sibling, parent, directory-index, test→src) without a filesystem probe: treat a specifier whose last segment has no extension and is a known directory name as an index import. Since the pure function can't know the FS, resolve deterministically:

```ts
export function resolveImport(fromRelPath: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const fromDir = path.posix.dirname(fromRelPath);
  const joined = path.posix.normalize(path.posix.join(fromDir, spec));
  if (joined.endsWith('.ts')) return joined;
  return `${joined}.ts`;
}

/** Both candidate targets for a relative specifier: file and directory-index. */
export function resolveCandidates(fromRelPath: string, spec: string): string[] {
  if (!spec.startsWith('.')) return [];
  const fromDir = path.posix.dirname(fromRelPath);
  const joined = path.posix.normalize(path.posix.join(fromDir, spec));
  if (joined.endsWith('.ts')) return [joined];
  return [`${joined}.ts`, `${joined}/index.ts`];
}
```

Then change the Step-1 directory-import test to assert against `resolveCandidates`:

```ts
  it('offers a directory index.ts candidate', () => {
    expect(resolveCandidates('src/toolbar/actions.ts', '../tabs')).toContain('src/tabs/index.ts');
  });
```

(Update the import line in `test/tools/scan.test.ts` to also import `resolveCandidates`, and delete the earlier `resolveImport('../tabs')` assertion.) `resolveImport` stays the single-best-guess used where a file target is expected; `resolveCandidates` is what graph-building uses to match against the known-file set.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/tools/scan.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json` (will still exclude `tools/` until Task 6 — expected clean for the files that ARE included; run `npx tsx tools/dependency-graph/scan.ts` is not meaningful yet). Run `pnpm lint` — expected clean (Biome formats the new files).

Note: `tools/` is not yet in `tsconfig` `include`; that wiring lands in Task 6. Until then, rely on Vitest (esbuild) + Biome for feedback on the new files.

- [ ] **Step 8: Commit**

```bash
git add tools/dependency-graph/types.ts tools/dependency-graph/scan.ts test/tools/scan.test.ts
git commit -m "feat(tools): dependency-graph scanner + parser (types, scan)"
```

---

### Task 2: Categorization (`categorize.ts`)

**Files:**
- Create: `tools/dependency-graph/categorize.ts`
- Test: `test/tools/categorize.test.ts`

**Interfaces:**
- Consumes: `ParsedFile`, `ModuleMap`, `ModuleEdges` from `types`; `resolveCandidates` from `scan`.
- Produces:
  - `categorize(files: ParsedFile[]): ModuleMap` — bucket each `src/<module>/...` file under `<module>`; bucket root-level `src/<file>.ts` under `root`.
  - `moduleOf(relPath: string): string` — the module name for a repo-relative path.
  - `computeModuleEdges(files: ParsedFile[]): ModuleEdges` — aggregate file-level internal deps into module→module edges (self-edges dropped).

- [ ] **Step 1: Write the failing test**

Create `test/tools/categorize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { categorize, computeModuleEdges, moduleOf } from '../../tools/dependency-graph/categorize';
import type { ParsedFile } from '../../tools/dependency-graph/types';

const file = (path: string, deps: string[] = []): ParsedFile => ({
  path,
  internalDeps: deps.map((file) => ({ file, imports: ['x'], typeOnly: false })),
  exports: [],
  loc: 1,
});

describe('moduleOf', () => {
  it('uses the second path segment for nested files', () => {
    expect(moduleOf('src/preview/render.ts')).toBe('preview');
  });
  it('buckets root-level src files under "root"', () => {
    expect(moduleOf('src/main.ts')).toBe('root');
  });
});

describe('categorize', () => {
  it('groups files by module', () => {
    const map = categorize([file('src/preview/render.ts'), file('src/preview/zoom.ts'), file('src/main.ts')]);
    expect(map.get('preview')).toEqual(['src/preview/render.ts', 'src/preview/zoom.ts']);
    expect(map.get('root')).toEqual(['src/main.ts']);
  });
});

describe('computeModuleEdges', () => {
  it('aggregates file edges into module edges, dropping self-edges', () => {
    const files = [
      file('src/toolbar/actions.ts', ['../preview/render', './export-menu']),
      file('src/preview/render.ts', ['./graphviz']),
      file('src/preview/graphviz.ts'),
      file('src/preview/zoom.ts'),
      file('src/toolbar/export-menu.ts'),
    ];
    const edges = computeModuleEdges(files);
    expect([...(edges.get('toolbar') ?? [])]).toEqual(['preview']); // ./export-menu is self → dropped
    expect(edges.get('preview')?.has('preview')).not.toBe(true); // self-edge dropped
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools/categorize.test.ts`
Expected: FAIL — cannot find module `categorize`.

- [ ] **Step 3: Write `categorize.ts`**

```ts
import { resolveCandidates } from './scan';
import type { ModuleEdges, ModuleMap, ParsedFile } from './types';

/** Module name for a repo-relative path: 'src/<module>/...' → <module>; 'src/x.ts' → 'root'. */
export function moduleOf(relPath: string): string {
  const parts = relPath.split('/');
  // parts[0] is 'src' or 'test'; a nested file has a subdir at parts[1].
  return parts.length > 2 ? parts[1] : 'root';
}

export function categorize(files: ParsedFile[]): ModuleMap {
  const map: ModuleMap = new Map();
  for (const f of files) {
    const mod = moduleOf(f.path);
    const list = map.get(mod) ?? [];
    list.push(f.path);
    map.set(mod, list);
  }
  return map;
}

export function computeModuleEdges(files: ParsedFile[]): ModuleEdges {
  const known = new Set(files.map((f) => f.path));
  const edges: ModuleEdges = new Map();
  for (const f of files) {
    const from = moduleOf(f.path);
    for (const dep of f.internalDeps) {
      const target = resolveCandidates(f.path, dep.file).find((c) => known.has(c));
      if (!target) continue;
      const to = moduleOf(target);
      if (to === from) continue;
      const set = edges.get(from) ?? new Set<string>();
      set.add(to);
      edges.set(from, set);
    }
  }
  return edges;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tools/categorize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/dependency-graph/categorize.ts test/tools/categorize.test.ts
git commit -m "feat(tools): dependency-graph module categorization + folder edges"
```

---

### Task 3: Pure analyzers (`analyze.ts`)

**Files:**
- Create: `tools/dependency-graph/analyze.ts`
- Test: `test/tools/analyze.test.ts`

**Interfaces:**
- Consumes: `ParsedFile`, `CycleReport`, `UnusedReport`, `CoverageRow`, `Stats`, `ModuleMap`, `ModuleEdges` from `types`; `resolveCandidates` from `scan`; `categorize`/`computeModuleEdges` from `categorize`.
- Produces:
  - `detectCycles(files: ParsedFile[]): CycleReport` — DFS over runtime-only vs all edges; `typeOnly` = cycles present only when type edges are included.
  - `detectUnused(files: ParsedFile[], testFiles: ParsedFile[], entryLike: Set<string>): UnusedReport` — files nothing imports (excluding `entryLike`), and exports imported by no file.
  - `mapTestCoverage(srcFiles: ParsedFile[], testFiles: ParsedFile[]): CoverageRow[]` — per src file, the test files that import it.
  - `computeStats(files, modules, edges): Stats`.

- [ ] **Step 1: Write the failing test**

Create `test/tools/analyze.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectCycles, detectUnused, mapTestCoverage } from '../../tools/dependency-graph/analyze';
import type { ParsedFile } from '../../tools/dependency-graph/types';

const f = (
  path: string,
  deps: { file: string; typeOnly?: boolean; imports?: string[] }[] = [],
  exports: string[] = []
): ParsedFile => ({
  path,
  internalDeps: deps.map((d) => ({ file: d.file, imports: d.imports ?? ['x'], typeOnly: !!d.typeOnly })),
  exports,
  loc: 1,
});

describe('detectCycles', () => {
  it('reports none for an acyclic graph', () => {
    const files = [f('src/a.ts', [{ file: './b' }]), f('src/b.ts')];
    expect(detectCycles(files).runtime).toEqual([]);
  });

  it('finds a runtime cycle', () => {
    const files = [f('src/a.ts', [{ file: './b' }]), f('src/b.ts', [{ file: './a' }])];
    expect(detectCycles(files).runtime.length).toBeGreaterThan(0);
  });

  it('classifies a type-only cycle separately from runtime', () => {
    const files = [
      f('src/a.ts', [{ file: './b' }]),
      f('src/b.ts', [{ file: './a', typeOnly: true }]),
    ];
    const c = detectCycles(files);
    expect(c.runtime).toEqual([]);
    expect(c.typeOnly.length).toBeGreaterThan(0);
  });
});

describe('detectUnused', () => {
  it('flags a file nothing imports (not entry-like)', () => {
    const files = [f('src/a.ts', [{ file: './b' }]), f('src/b.ts'), f('src/orphan.ts', [], ['dead'])];
    const r = detectUnused(files, [], new Set(['src/a.ts']));
    expect(r.unusedFiles).toContain('src/orphan.ts');
    expect(r.unusedFiles).not.toContain('src/a.ts'); // entry-like
  });

  it('does not flag a file imported only by a test', () => {
    const files = [f('src/helper.ts', [], ['help'])];
    const tests = [f('test/helper.test.ts', [{ file: '../src/helper', imports: ['help'] }])];
    const r = detectUnused(files, tests, new Set());
    expect(r.unusedFiles).not.toContain('src/helper.ts');
  });

  it('flags an export no one imports by name', () => {
    const files = [
      f('src/a.ts', [{ file: './b', imports: ['used'] }]),
      f('src/b.ts', [], ['used', 'unusedExport']),
    ];
    const r = detectUnused(files, [], new Set(['src/a.ts']));
    expect(r.unusedExports).toContainEqual({ file: 'src/b.ts', name: 'unusedExport' });
    expect(r.unusedExports).not.toContainEqual({ file: 'src/b.ts', name: 'used' });
  });
});

describe('mapTestCoverage', () => {
  it('maps a src file to the test that imports it', () => {
    const src = [f('src/preview/render.ts', [], ['render'])];
    const tests = [f('test/preview/render.test.ts', [{ file: '../../src/preview/render' }])];
    expect(mapTestCoverage(src, tests)).toEqual([
      { file: 'src/preview/render.ts', testFiles: ['test/preview/render.test.ts'] },
    ]);
  });

  it('lists a src file with no tests as uncovered', () => {
    const src = [f('src/lonely.ts')];
    expect(mapTestCoverage(src, [])).toEqual([{ file: 'src/lonely.ts', testFiles: [] }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools/analyze.test.ts`
Expected: FAIL — cannot find module `analyze`.

- [ ] **Step 3: Write `analyze.ts`**

```ts
import { resolveCandidates } from './scan';
import type {
  CoverageRow,
  CycleReport,
  ModuleEdges,
  ModuleMap,
  ParsedFile,
  Stats,
  UnusedReport,
} from './types';

/** Resolve a file's internal deps to known targets, optionally runtime-only. */
function edgesOf(file: ParsedFile, known: Set<string>, runtimeOnly: boolean): string[] {
  const out: string[] = [];
  for (const dep of file.internalDeps) {
    if (runtimeOnly && dep.typeOnly) continue;
    const target = resolveCandidates(file.path, dep.file).find((c) => known.has(c));
    if (target) out.push(target);
  }
  return out;
}

function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  const dfs = (node: string, pathAcc: string[]): void => {
    if (inStack.has(node)) {
      const start = pathAcc.indexOf(node);
      if (start !== -1) {
        const cycle = [...pathAcc.slice(start), node];
        const key = [...cycle].sort().join('->');
        if (!cycles.some((c) => [...c].sort().join('->') === key)) cycles.push(cycle);
      }
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    inStack.add(node);
    pathAcc.push(node);
    for (const next of graph.get(node) ?? []) dfs(next, pathAcc);
    pathAcc.pop();
    inStack.delete(node);
  };

  for (const node of graph.keys()) if (!visited.has(node)) dfs(node, []);
  return cycles;
}

export function detectCycles(files: ParsedFile[]): CycleReport {
  const known = new Set(files.map((f) => f.path));
  const runtimeGraph = new Map<string, string[]>();
  const allGraph = new Map<string, string[]>();
  for (const file of files) {
    runtimeGraph.set(file.path, edgesOf(file, known, true));
    allGraph.set(file.path, edgesOf(file, known, false));
  }
  const runtime = findCycles(runtimeGraph);
  const all = findCycles(allGraph);
  const runtimeKeys = new Set(runtime.map((c) => [...c].sort().join('->')));
  const typeOnly = all.filter((c) => !runtimeKeys.has([...c].sort().join('->')));
  return { runtime, typeOnly };
}

export function detectUnused(
  files: ParsedFile[],
  testFiles: ParsedFile[],
  entryLike: Set<string>
): UnusedReport {
  const known = new Set(files.map((f) => f.path));
  const importedFiles = new Set<string>();
  const importedNames = new Map<string, Set<string>>();

  for (const file of [...files, ...testFiles]) {
    for (const dep of file.internalDeps) {
      const target = resolveCandidates(file.path, dep.file).find((c) => known.has(c));
      if (!target) continue;
      importedFiles.add(target);
      const set = importedNames.get(target) ?? new Set<string>();
      for (const imp of dep.imports) set.add(imp === '*' ? '*' : imp.replace(/^\* as /, ''));
      importedNames.set(target, set);
    }
  }

  const unusedFiles = files
    .map((f) => f.path)
    .filter((p) => !importedFiles.has(p) && !entryLike.has(p));

  const unusedExports: { file: string; name: string }[] = [];
  for (const file of files) {
    const used = importedNames.get(file.path);
    if (used?.has('*')) continue; // wildcard import consumes all
    for (const name of file.exports) {
      if (!used?.has(name)) unusedExports.push({ file: file.path, name });
    }
  }
  return { unusedFiles, unusedExports };
}

export function mapTestCoverage(srcFiles: ParsedFile[], testFiles: ParsedFile[]): CoverageRow[] {
  const known = new Set(srcFiles.map((f) => f.path));
  const cover = new Map<string, string[]>();
  for (const f of srcFiles) cover.set(f.path, []);
  for (const test of testFiles) {
    for (const dep of test.internalDeps) {
      const target = resolveCandidates(test.path, dep.file).find((c) => known.has(c));
      if (target) cover.get(target)?.push(test.path);
    }
  }
  return [...cover.entries()].map(([file, testFilesList]) => ({
    file,
    testFiles: [...new Set(testFilesList)],
  }));
}

export function computeStats(files: ParsedFile[], modules: ModuleMap, edges: ModuleEdges): Stats {
  const known = new Set(files.map((f) => f.path));
  let edgeCount = 0;
  let exportCount = 0;
  for (const f of files) {
    edgeCount += edgesOf(f, known, false).length;
    exportCount += f.exports.length;
  }
  void edges; // module edges reported separately; file edges counted here
  return {
    fileCount: files.length,
    moduleCount: modules.size,
    totalLoc: files.reduce((n, f) => n + f.loc, 0),
    edgeCount,
    exportCount,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tools/analyze.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/dependency-graph/analyze.ts test/tools/analyze.test.ts
git commit -m "feat(tools): dependency-graph analyzers (cycles, unused, coverage, stats)"
```

---

### Task 4: IPC-boundary analyzer (`ipc.ts`)

**Files:**
- Create: `tools/dependency-graph/ipc.ts`
- Test: `test/tools/ipc.test.ts`

**Interfaces:**
- Consumes: `IpcChannel`, `IpcReport` from `types`.
- Produces:
  - `extractContractMethods(src: string): string[]` — GraphvizApi method names, generic-tolerant.
  - `extractPreloadChannels(src: string): { method: string; channel: string }[]` — method→channel from `ipcRenderer.invoke`.
  - `extractMainHandlers(src: string): string[]` — channels from `ipcMain.handle`, multiline-tolerant.
  - `analyzeIpc(contractSrc, preloadSrc, mainSrc): IpcReport` — pure cross-reference.
  - `analyzeIpcFromRoot(root: string): IpcReport` — read the three files and call `analyzeIpc`.

**This task encodes the two real false-positive traps** (multiline `ipcMain.handle`, generic `storeGet<T>`) as explicit tests. On the current tree all 10 channels must land in `fullyWired`.

- [ ] **Step 1: Write the failing test**

Create `test/tools/ipc.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  analyzeIpc,
  extractContractMethods,
  extractMainHandlers,
  extractPreloadChannels,
} from '../../tools/dependency-graph/ipc';

const CONTRACT = `
export interface GraphvizApi {
  openTextFile(filters: DiagramFilter[]): Promise<OpenedFile | null>;
  storeGet<T>(key: string): Promise<T | undefined>;
  appInfo(): Promise<{ name: string; version: string }>;
}
`;

const PRELOAD = `
const api: GraphvizApi = {
  openTextFile: (filters) => ipcRenderer.invoke('dialog:openText', filters),
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  appInfo: () => ipcRenderer.invoke('app:info'),
};
`;

// dialog:save is registered as a MULTILINE ipcMain.handle( call (the real trap).
const MAIN = `
  ipcMain.handle('dialog:openText', async () => {});
  ipcMain.handle(
    'store:get',
    (_e, key) => store.get(key)
  );
  ipcMain.handle('app:info', () => ({}));
`;

describe('extractContractMethods', () => {
  it('extracts methods including a generic method', () => {
    expect(extractContractMethods(CONTRACT)).toEqual(['openTextFile', 'storeGet', 'appInfo']);
  });
});

describe('extractPreloadChannels', () => {
  it('maps each method to its invoke channel', () => {
    expect(extractPreloadChannels(PRELOAD)).toEqual([
      { method: 'openTextFile', channel: 'dialog:openText' },
      { method: 'storeGet', channel: 'store:get' },
      { method: 'appInfo', channel: 'app:info' },
    ]);
  });
});

describe('extractMainHandlers', () => {
  it('extracts channels including a multiline ipcMain.handle(', () => {
    expect(extractMainHandlers(MAIN)).toEqual(['dialog:openText', 'store:get', 'app:info']);
  });
});

describe('analyzeIpc', () => {
  it('classifies fully-wired vs missing-handler vs orphan', () => {
    // preload exposes an extra channel with no handler; main has an orphan handler.
    const preload = `${PRELOAD.replace('};', "  writeTextFile: (p, c) => ipcRenderer.invoke('fs:writeText', p, c),\n};")}`;
    const main = `${MAIN}  ipcMain.handle('shell:openExternal', () => {});\n`;
    const r = analyzeIpc(
      `${CONTRACT.replace('appInfo', 'writeTextFile(path: string, content: string): Promise<void>;\n  appInfo')}`,
      preload,
      main
    );
    const chans = (list: { channel: string }[]) => list.map((c) => c.channel).sort();
    expect(chans(r.missingHandlers)).toContain('fs:writeText'); // preload, no handler
    expect(chans(r.orphanHandlers)).toContain('shell:openExternal'); // handler, no preload
    expect(chans(r.fullyWired)).toEqual(['app:info', 'dialog:openText', 'store:get']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools/ipc.test.ts`
Expected: FAIL — cannot find module `ipc`.

- [ ] **Step 3: Write `ipc.ts`**

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { IpcChannel, IpcReport } from './types';

/** Method names on the GraphvizApi interface (generic-method tolerant). */
export function extractContractMethods(src: string): string[] {
  const start = src.indexOf('interface GraphvizApi');
  if (start === -1) return [];
  const open = src.indexOf('{', start);
  // Walk to the matching close brace.
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = src.slice(open + 1, end);
  const methods: string[] = [];
  // Match `name(` or `name<...>(` at the start of a (trimmed) line.
  const re = /^\s*(\w+)\s*(?:<[^>]*>)?\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) methods.push(m[1]);
  return methods;
}

/** method -> channel from `name: (...) => ipcRenderer.invoke('channel', ...)`. */
export function extractPreloadChannels(src: string): { method: string; channel: string }[] {
  const out: { method: string; channel: string }[] = [];
  const re = /(\w+)\s*:\s*\([^)]*\)\s*=>\s*ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push({ method: m[1], channel: m[2] });
  return out;
}

/** Channels from `ipcMain.handle('channel'` — `\s*` after `(` crosses newlines. */
export function extractMainHandlers(src: string): string[] {
  const out: string[] = [];
  const re = /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

export function analyzeIpc(contractSrc: string, preloadSrc: string, mainSrc: string): IpcReport {
  const contractMethods = new Set(extractContractMethods(contractSrc));
  const preload = extractPreloadChannels(preloadSrc);
  const handlers = new Set(extractMainHandlers(mainSrc));

  const byChannel = new Map<string, IpcChannel>();
  for (const { method, channel } of preload) {
    byChannel.set(channel, {
      channel,
      method,
      hasContract: contractMethods.has(method),
      hasPreload: true,
      hasHandler: handlers.has(channel),
    });
  }
  for (const channel of handlers) {
    if (byChannel.has(channel)) continue;
    byChannel.set(channel, {
      channel,
      hasContract: false,
      hasPreload: false,
      hasHandler: true,
    });
  }

  const fullyWired: IpcChannel[] = [];
  const missingHandlers: IpcChannel[] = [];
  const orphanHandlers: IpcChannel[] = [];
  for (const c of byChannel.values()) {
    if (c.hasPreload && c.hasHandler) fullyWired.push(c);
    else if (c.hasPreload && !c.hasHandler) missingHandlers.push(c);
    else if (!c.hasPreload && c.hasHandler) orphanHandlers.push(c);
  }
  const byName = (a: IpcChannel, b: IpcChannel) => a.channel.localeCompare(b.channel);
  return {
    fullyWired: fullyWired.sort(byName),
    missingHandlers: missingHandlers.sort(byName),
    orphanHandlers: orphanHandlers.sort(byName),
  };
}

export function analyzeIpcFromRoot(root: string): IpcReport {
  const read = (rel: string) => readFileSync(path.join(root, rel), 'utf-8');
  return analyzeIpc(
    read('src/platform/contract.ts'),
    read('electron/preload.ts'),
    read('electron/main.ts')
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tools/ipc.test.ts`
Expected: PASS (including the multiline-handler and generic-method cases).

- [ ] **Step 5: Add a grounded assertion against the real files**

Append to `test/tools/ipc.test.ts`:

```ts
import { analyzeIpcFromRoot } from '../../tools/dependency-graph/ipc';

describe('analyzeIpcFromRoot (real repo)', () => {
  it('reports all 10 GraphvizApi channels as fully wired, none missing/orphan', () => {
    const r = analyzeIpcFromRoot(process.cwd());
    expect(r.fullyWired.map((c) => c.channel).sort()).toEqual(
      [
        'app:info',
        'dialog:confirm',
        'dialog:openText',
        'dialog:save',
        'fs:writeBinary',
        'fs:writeText',
        'shell:openExternal',
        'store:delete',
        'store:get',
        'store:set',
      ].sort()
    );
    expect(r.missingHandlers).toEqual([]);
    expect(r.orphanHandlers).toEqual([]);
  });
});
```

Run: `npx vitest run test/tools/ipc.test.ts`
Expected: PASS — proving zero false positives on the real `dialog:save` (multiline) and `storeGet<T>` (generic) cases. **If this fails, fix the parser, not the test.**

- [ ] **Step 6: Commit**

```bash
git add tools/dependency-graph/ipc.ts test/tools/ipc.test.ts
git commit -m "feat(tools): dependency-graph IPC-boundary analyzer (multiline + generic tolerant)"
```

---

### Task 5: Renderers (`render.ts`)

**Files:**
- Create: `tools/dependency-graph/render.ts`
- Test: `test/tools/render.test.ts`

**Interfaces:**
- Consumes: `Analysis`, `ModuleMap`, `ModuleEdges` from `types`.
- Produces:
  - `renderMermaid(modules: ModuleMap, edges: ModuleEdges): string` — `graph LR` module diagram.
  - `renderJson(a: Analysis): string` — machine-readable model (Maps/Sets → arrays/objects), pretty-printed.
  - `renderMarkdown(a: Analysis): string` — the human doc.

- [ ] **Step 1: Write the failing test**

Create `test/tools/render.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderJson, renderMarkdown, renderMermaid } from '../../tools/dependency-graph/render';
import type { Analysis } from '../../tools/dependency-graph/types';

const analysis = (): Analysis => ({
  files: [{ path: 'src/preview/render.ts', internalDeps: [], exports: ['render'], loc: 10 }],
  testFiles: [],
  modules: new Map([['preview', ['src/preview/render.ts']]]),
  moduleEdges: new Map([['toolbar', new Set(['preview'])]]),
  cycles: { runtime: [], typeOnly: [] },
  unused: { unusedFiles: [], unusedExports: [] },
  coverage: [{ file: 'src/preview/render.ts', testFiles: ['test/preview/render.test.ts'] }],
  ipc: {
    fullyWired: [
      { channel: 'app:info', method: 'appInfo', hasContract: true, hasPreload: true, hasHandler: true },
    ],
    missingHandlers: [],
    orphanHandlers: [],
  },
  stats: { fileCount: 1, moduleCount: 1, totalLoc: 10, edgeCount: 0, exportCount: 1 },
});

describe('renderMermaid', () => {
  it('emits a graph LR with a module edge', () => {
    const out = renderMermaid(analysis().modules, analysis().moduleEdges);
    expect(out).toContain('graph LR');
    expect(out).toContain('toolbar --> preview');
  });
});

describe('renderJson', () => {
  it('produces valid JSON with modules as arrays', () => {
    const parsed = JSON.parse(renderJson(analysis()));
    expect(parsed.modules.preview).toEqual(['src/preview/render.ts']);
    expect(parsed.moduleEdges.toolbar).toEqual(['preview']);
    expect(parsed.stats.fileCount).toBe(1);
  });
});

describe('renderMarkdown', () => {
  it('includes the IPC table with a fully-wired row and a coverage entry', () => {
    const md = renderMarkdown(analysis());
    expect(md).toContain('# GraphvizJS Dependency Graph');
    expect(md).toContain('app:info');
    expect(md).toContain('✅');
    expect(md).toContain('src/preview/render.ts');
  });

  it('marks an uncovered src file', () => {
    const a = analysis();
    a.coverage = [{ file: 'src/lonely.ts', testFiles: [] }];
    expect(renderMarkdown(a)).toMatch(/src\/lonely\.ts.*(—|none|no tests)/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools/render.test.ts`
Expected: FAIL — cannot find module `render`.

- [ ] **Step 3: Write `render.ts`**

```ts
import type { Analysis, ModuleEdges, ModuleMap } from './types';

export function renderMermaid(modules: ModuleMap, edges: ModuleEdges): string {
  const lines = ['graph LR'];
  for (const mod of [...modules.keys()].sort()) lines.push(`  ${mod}["${mod}"]`);
  for (const [from, tos] of [...edges.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const to of [...tos].sort()) lines.push(`  ${from} --> ${to}`);
  }
  return `${lines.join('\n')}\n`;
}

export function renderJson(a: Analysis): string {
  const model = {
    stats: a.stats,
    modules: Object.fromEntries(a.modules),
    moduleEdges: Object.fromEntries([...a.moduleEdges].map(([k, v]) => [k, [...v]])),
    cycles: a.cycles,
    unused: a.unused,
    coverage: a.coverage,
    ipc: a.ipc,
    files: a.files.map((f) => ({ path: f.path, loc: f.loc, exports: f.exports })),
  };
  return `${JSON.stringify(model, null, 2)}\n`;
}

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body || '| ' + headers.map(() => '—').join(' | ') + ' |'}`;
}

export function renderMarkdown(a: Analysis): string {
  const s = a.stats;
  const out: string[] = [];
  out.push('# GraphvizJS Dependency Graph');
  out.push('');
  out.push('> Generated by `pnpm graph`. Do not edit by hand — regenerate instead.');
  out.push('');
  out.push('## Summary');
  out.push('');
  out.push(
    table(
      ['Metric', 'Value'],
      [
        ['Files', String(s.fileCount)],
        ['Modules', String(s.moduleCount)],
        ['Lines of code', String(s.totalLoc)],
        ['Internal edges', String(s.edgeCount)],
        ['Exports', String(s.exportCount)],
      ]
    )
  );
  out.push('');

  out.push('## Modules');
  out.push('');
  for (const mod of [...a.modules.keys()].sort()) {
    out.push(`### ${mod}`);
    out.push('');
    for (const f of a.modules.get(mod) ?? []) out.push(`- \`${f}\``);
    out.push('');
  }

  out.push('## Module dependencies');
  out.push('');
  out.push(
    table(
      ['Module', 'Depends on'],
      [...a.moduleEdges.entries()]
        .sort((x, y) => x[0].localeCompare(y[0]))
        .map(([from, tos]) => [from, [...tos].sort().join(', ')])
    )
  );
  out.push('');

  out.push('## Circular dependencies');
  out.push('');
  if (a.cycles.runtime.length === 0 && a.cycles.typeOnly.length === 0) {
    out.push('None. ✅');
  } else {
    for (const c of a.cycles.runtime) out.push(`- ⚠️ runtime: ${c.join(' → ')}`);
    for (const c of a.cycles.typeOnly) out.push(`- 🔸 type-only: ${c.join(' → ')}`);
  }
  out.push('');

  out.push('## Unused');
  out.push('');
  out.push(`**Unused files:** ${a.unused.unusedFiles.length === 0 ? 'none ✅' : ''}`);
  for (const f of a.unused.unusedFiles) out.push(`- \`${f}\``);
  out.push('');
  out.push(`**Unused exports:** ${a.unused.unusedExports.length === 0 ? 'none ✅' : ''}`);
  for (const e of a.unused.unusedExports) out.push(`- \`${e.name}\` in \`${e.file}\``);
  out.push('');

  out.push('## Test coverage (src ↔ test)');
  out.push('');
  out.push(
    table(
      ['Source file', 'Tests'],
      a.coverage.map((r) => [`\`${r.file}\``, r.testFiles.length ? r.testFiles.map((t) => `\`${t}\``).join(', ') : '—'])
    )
  );
  out.push('');

  out.push('## IPC boundary (renderer ↔ Electron)');
  out.push('');
  const ipcRows: string[][] = [];
  for (const c of a.ipc.fullyWired) ipcRows.push([`\`${c.channel}\``, c.method ?? '', '✅ wired']);
  for (const c of a.ipc.missingHandlers) ipcRows.push([`\`${c.channel}\``, c.method ?? '', '⚠️ no handler']);
  for (const c of a.ipc.orphanHandlers) ipcRows.push([`\`${c.channel}\``, c.method ?? '', '🔸 orphan handler']);
  out.push(table(['Channel', 'Method', 'Status'], ipcRows));
  out.push('');
  out.push(
    '> `import.meta.glob` example/module loads (Vite) are not static imports and are excluded from edge resolution.'
  );
  out.push('');
  return out.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tools/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/dependency-graph/render.ts test/tools/render.test.ts
git commit -m "feat(tools): dependency-graph renderers (markdown, json, mermaid)"
```

---

### Task 6: Orchestration, integration, snapshot (`index.ts` + wiring)

**Files:**
- Create: `tools/dependency-graph/index.ts`
- Create: `tools/dependency-graph/README.md`
- Modify: `package.json` (add `tsx` devDep + `graph` script)
- Modify: `tsconfig.json:15` (add `tools/**/*.ts` to `include`)
- Modify: `biome.jsonc:10` and `biome.jsonc:22` (ignore `docs/architecture/**`)
- Create (generated, committed): `docs/architecture/DEPENDENCY_GRAPH.md`, `docs/architecture/dependency-graph.json`, `docs/architecture/dependency-graph.mermaid`
- Test: `test/tools/index.test.ts` (smoke)

**Interfaces:**
- Consumes: everything from `scan`, `categorize`, `analyze`, `ipc`, `render`.
- Produces:
  - `parseCli(argv: string[]): CliOptions` — supports `--include-tests` and `--help`.
  - `buildAnalysis(root: string): Analysis` — scan `src/` + `test/`, categorize, run analyzers, IPC, stats.
  - `writeOutputs(root: string, a: Analysis): string[]` — write the 3 files under `docs/architecture/`, return their paths.
  - `main(argv: string[]): void` — CLI entry (build → write → console summary; `process.exitCode = 1` if any missing/orphan IPC handlers).

- [ ] **Step 1: Write the failing smoke test**

Create `test/tools/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildAnalysis } from '../../tools/dependency-graph/index';

describe('buildAnalysis (real repo)', () => {
  const a = buildAnalysis(process.cwd());

  it('discovers the real module structure', () => {
    for (const mod of ['editor', 'preview', 'toolbar', 'tabs', 'platform']) {
      expect(a.modules.has(mod)).toBe(true);
    }
  });

  it('wires all 10 IPC channels with no gaps', () => {
    expect(a.ipc.fullyWired).toHaveLength(10);
    expect(a.ipc.missingHandlers).toHaveLength(0);
    expect(a.ipc.orphanHandlers).toHaveLength(0);
  });

  it('reports no runtime circular dependencies', () => {
    expect(a.cycles.runtime).toEqual([]);
  });

  it('counts a non-trivial number of source files', () => {
    expect(a.stats.fileCount).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools/index.test.ts`
Expected: FAIL — cannot find module `index`.

- [ ] **Step 3: Write `index.ts`**

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { detectCycles, detectUnused, mapTestCoverage, computeStats } from './analyze';
import { categorize, computeModuleEdges } from './categorize';
import { analyzeIpcFromRoot } from './ipc';
import { renderJson, renderMarkdown, renderMermaid } from './render';
import { scanDir } from './scan';
import type { Analysis, CliOptions } from './types';

const OUT_DIR = 'docs/architecture';

export function parseCli(argv: string[]): CliOptions {
  return { includeTests: argv.includes('--include-tests') };
}

export function buildAnalysis(root: string): Analysis {
  const files = scanDir(root, 'src');
  const testFiles = scanDir(root, 'test');
  const modules = categorize(files);
  const moduleEdges = computeModuleEdges(files);
  // Entry-like files that legitimately have no importer:
  //  - src/main.ts (app entry, loaded by index.html)
  //  - src/examples/** (loaded via Vite import.meta.glob, not static imports)
  const entryLike = new Set(
    files.map((f) => f.path).filter((p) => p === 'src/main.ts' || p.startsWith('src/examples/'))
  );
  return {
    files,
    testFiles,
    modules,
    moduleEdges,
    cycles: detectCycles(files),
    unused: detectUnused(files, testFiles, entryLike),
    coverage: mapTestCoverage(files, testFiles),
    ipc: analyzeIpcFromRoot(root),
    stats: computeStats(files, modules, moduleEdges),
  };
}

export function writeOutputs(root: string, a: Analysis): string[] {
  const dir = path.join(root, OUT_DIR);
  mkdirSync(dir, { recursive: true });
  const md = path.join(dir, 'DEPENDENCY_GRAPH.md');
  const json = path.join(dir, 'dependency-graph.json');
  const mermaid = path.join(dir, 'dependency-graph.mermaid');
  writeFileSync(md, renderMarkdown(a), 'utf-8');
  writeFileSync(json, renderJson(a), 'utf-8');
  writeFileSync(mermaid, renderMermaid(a.modules, a.moduleEdges), 'utf-8');
  return [md, json, mermaid];
}

export function main(argv: string[]): void {
  if (argv.includes('--help')) {
    // biome-ignore lint: intentional CLI help output
    console.log('Usage: pnpm graph [--include-tests]\nWrites docs/architecture/{DEPENDENCY_GRAPH.md,dependency-graph.json,dependency-graph.mermaid}');
    return;
  }
  const root = process.cwd();
  const a = buildAnalysis(root);
  const written = writeOutputs(root, a);
  const { missingHandlers, orphanHandlers, fullyWired } = a.ipc;
  // biome-ignore lint: intentional CLI summary output
  console.log(
    `Wrote ${written.length} files. Modules: ${a.modules.size}, files: ${a.stats.fileCount}, ` +
      `IPC ✅ ${fullyWired.length} / ⚠️ ${missingHandlers.length} / 🔸 ${orphanHandlers.length}, ` +
      `runtime cycles: ${a.cycles.runtime.length}.`
  );
  if (missingHandlers.length > 0 || orphanHandlers.length > 0) process.exitCode = 1;
}

// Run when invoked directly (tsx tools/dependency-graph/index.ts).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.ts')) {
  main(process.argv.slice(2));
}
```

- [ ] **Step 4: Run smoke test to verify it passes**

Run: `npx vitest run test/tools/index.test.ts`
Expected: PASS (real module structure, 10 wired channels, no runtime cycles).

- [ ] **Step 5: Add `tsx` devDep + `graph` script**

Run: `pnpm add -D tsx`
Then edit `package.json` `scripts` to add (after `"clean"`):

```json
    "graph": "tsx tools/dependency-graph/index.ts",
```

- [ ] **Step 6: Wire `tools/` into typecheck; ignore generated docs in Biome**

Edit `tsconfig.json` line 15 to add the tool sources to `include`:

```json
  "include": ["src/**/*.ts", "src/**/*.d.ts", "electron/**/*.ts", "tools/**/*.ts"]
```

Edit `biome.jsonc` — add `"!docs/architecture/**"` to BOTH `files.includes` (line 10) and `formatter.includes` (line 22):

```json
    "includes": ["**", "!dist/**", "!coverage/**", "!docs/architecture/**"]
```
```json
    "includes": ["**", "!**/pnpm-lock.yaml", "!**/LICENSE", "!dist/**", "!coverage/**", "!docs/architecture/**"]
```

(Generated Markdown/JSON/Mermaid under `docs/architecture/` must not be reformatted by Biome, or `pnpm graph` output would fight `pnpm lint:fix`.)

- [ ] **Step 7: Verify typecheck now covers the tool, and lint is clean**

Run: `pnpm typecheck`
Expected: exit 0 (now compiling `tools/**/*.ts` under strict + verbatimModuleSyntax — if any `import type` is missing, fix it here).
Run: `pnpm lint`
Expected: exit 0.

- [ ] **Step 8: Generate the committed snapshot**

Run: `pnpm graph`
Expected console: `Wrote 3 files. Modules: … IPC ✅ 10 / ⚠️ 0 / 🔸 0, runtime cycles: 0.`
Verify the 3 files exist and are non-empty:

Run: `npx vitest run test/tools/` (full tool suite green) and confirm `docs/architecture/DEPENDENCY_GRAPH.md` contains the IPC table with ten ✅ rows (open the file).

- [ ] **Step 9: Write the tool README**

Create `tools/dependency-graph/README.md`:

```markdown
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
```

- [ ] **Step 10: Full verification + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green (tool unit + smoke tests join the existing Vitest suite; app suite unaffected).

```bash
git add tools/dependency-graph/index.ts tools/dependency-graph/README.md \
  test/tools/index.test.ts package.json pnpm-lock.yaml tsconfig.json biome.jsonc \
  docs/architecture/
git commit -m "feat(tools): dependency-graph orchestration + pnpm graph + committed snapshot"
```

---

## Self-Review

**1. Spec coverage** (each spec success-criterion → task):
- `pnpm graph` exits 0, writes the 3 files → Task 6 (Steps 5, 8).
- Module map reflects real structure (`editor/preview/toolbar/…` + root) → Task 2 + Task 6 smoke test.
- IPC reports all 10 methods wired, zero false positives (multiline `dialog:save`, generic `storeGet<T>`) → Task 4 (Steps 3, 5) + Task 6 smoke.
- Circular-dependency report (expected none) → Task 3 + Task 6 smoke.
- Unit tests for pure analyzers pass; smoke test runs on repo asserting exit 0 + 3 files → Tasks 1–5 unit, Task 6 smoke.
- `pnpm typecheck`/`lint` clean → Task 6 Steps 6–7, 10.
- Strip MathTS-specific analyzers + `js-yaml` → nothing MathTS-specific is ported (only `scan`/`categorize`/`analyze`/`ipc`/`render` are written fresh).
- Outputs to `docs/architecture/`, kept separate from `docs/superpowers/` → Task 6.
- `tsx` devDep + `pnpm graph` script, dev-only (not in `build`) → Task 6 Step 5.
- `import.meta.glob` documented out-of-scope → render.ts footnote + README + `entryLike` exclusion for examples.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". All code steps show complete code. The only judgment call left to the implementer is fixing a parser if the real-repo assertion (Task 4 Step 5 / Task 6 smoke) fails — which is the intended TDD signal.

**3. Type consistency:** `ParsedFile` fields (`path`, `internalDeps`, `exports`, `loc`) are used identically across Tasks 1–6. `resolveCandidates` (multi-candidate) is the graph-building resolver used in Tasks 2 & 3; `resolveImport` (single best-guess) is defined but only the candidate form is consumed by graph code — consistent. `Analysis` shape defined in Task 1 is exactly what Task 5 renders and Task 6 builds. `IpcReport` buckets (`fullyWired`/`missingHandlers`/`orphanHandlers`) match across ipc.ts, render.ts, index.ts, and both smoke tests.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-02-graphvizjs-dependency-graph-tool.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
