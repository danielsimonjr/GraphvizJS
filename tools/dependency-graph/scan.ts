import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { InternalDep, ParsedFile } from './types';

const EXCLUDE_DIRS = new Set([
  'dist',
  'dist-cli',
  'dist-electron',
  'node_modules',
  'coverage',
  'e2e',
]);

/** TS or JS source extensions the graph understands (declaration files excluded). */
const SOURCE_EXT_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/** A scannable source file: any TS/JS module, but not a `.d.ts` declaration. */
export function isSourceFile(name: string): boolean {
  return !name.endsWith('.d.ts') && SOURCE_EXT_RE.test(name);
}

/** Recursively collect repo-relative POSIX paths of source files under `${root}/${subdir}`. */
function walk(root: string, dirAbs: string, out: string[]): void {
  for (const entry of readdirSync(dirAbs)) {
    const abs = path.join(dirAbs, entry);
    if (statSync(abs).isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry)) walk(root, abs, out);
      continue;
    }
    if (!isSourceFile(entry)) continue;
    out.push(path.relative(root, abs).split(path.sep).join('/'));
  }
}

export function scanDir(root: string, subdir: string): ParsedFile[] {
  const files: string[] = [];
  walk(root, path.join(root, subdir), files);
  return files.map((rel) => parseFile(rel, readFileSync(path.join(root, rel), 'utf-8')));
}

// import type { ... } | import { type X, Y } | import D from | import * as NS from
// | import D, { Named } from  (combined default + named)
const IMPORT_RE =
  /import\s+(type\s+)?(?:(?:{([^}]+)}|(\w+)|\*\s+as\s+(\w+))(?:\s*,\s*(?:{([^}]+)}|(\w+)))?)\s+from\s+['"]([^'"]+)['"]/g;

// Dynamic import: an optional destructuring assignment in front of `import('x')`
// / `await import('x')`. Group 1 = destructured bindings (if any), group 2 = spec.
// Static `import ... from` never contains `import(`, so this can't match those.
const DYNAMIC_IMPORT_RE =
  /(?:\{\s*([^}]+?)\s*\}\s*=\s*)?(?:await\s+)?import\(\s*['"]([^'"]+)['"]\s*\)/g;

function parseDynamicImports(content: string): InternalDep[] {
  const deps: InternalDep[] = [];
  let m: RegExpExecArray | null;
  DYNAMIC_IMPORT_RE.lastIndex = 0;
  while ((m = DYNAMIC_IMPORT_RE.exec(content)) !== null) {
    const source = m[2];
    if (!source.startsWith('.')) continue; // internal (relative) only
    const imports = m[1]
      ? m[1]
          .split(',')
          // `{ foo: local }` imports `foo`; strip the rename and `type` modifier.
          .map((raw) =>
            raw
              .replace(/^type\s+/, '')
              .split(':')[0]
              .trim()
          )
          .filter(Boolean)
      : ['*']; // bare `import('x')` binds nothing by name → treat as wildcard
    deps.push({ file: source, imports, typeOnly: false });
  }
  return deps;
}

function parseImports(content: string): InternalDep[] {
  const deps: InternalDep[] = [];
  let m: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const isTypeOnly = !!m[1];
    const named = m[2] ?? m[5] ?? '';
    const def = m[3] ?? m[6] ?? '';
    const ns = m[4] ?? '';
    const source = m[7];
    if (!source.startsWith('.')) continue; // internal (relative) only

    const imports: string[] = [];
    let hasNamedRuntime = false;
    if (named) {
      for (const raw of named.split(',')) {
        const item = raw.trim();
        if (!item) continue;
        const inlineType = item.startsWith('type ');
        const name = item
          .replace(/^type\s+/, '')
          .split(' as ')[0]
          .trim();
        if (name) {
          imports.push(name);
          if (!inlineType) hasNamedRuntime = true;
        }
      }
    }
    if (def) imports.push(def);
    if (ns) imports.push(`* as ${ns}`);

    const hasRuntime = !isTypeOnly && (hasNamedRuntime || !!def || !!ns);
    const typeOnly = isTypeOnly || (imports.length > 0 && !hasRuntime);
    deps.push({ file: source, imports, typeOnly });
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

function countLoc(content: string): number {
  if (content === '') return 0;
  const lines = content.split('\n');
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

export function parseFile(relPath: string, content: string): ParsedFile {
  return {
    path: relPath,
    internalDeps: [...parseImports(content), ...parseDynamicImports(content)],
    exports: parseExports(content),
    loc: countLoc(content),
  };
}

// Source extensions to try for an extensionless specifier, TS first (this is a
// TS-first repo; the .find(known.has) caller picks whichever file exists).
const RESOLVE_EXTS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];

// An explicit ESM ".js"-family specifier maps first to its TS source sibling
// (TS-ESM writes `./x.js` for `x.ts`), then to a real same-name JS file.
const JS_TO_TS: Record<string, string> = { js: 'ts', jsx: 'tsx', mjs: 'mts', cjs: 'cts' };

/** Ordered candidate targets for a normalized relative path (file first, then dir-index). */
function candidatesFor(joined: string): string[] {
  const jsMatch = joined.match(/\.(js|jsx|mjs|cjs)$/);
  if (jsMatch) {
    const base = joined.slice(0, -jsMatch[0].length);
    return [`${base}.${JS_TO_TS[jsMatch[1]]}`, joined]; // .ts sibling, then the real .js
  }
  if (/\.(ts|tsx|mts|cts)$/.test(joined)) return [joined];
  return [
    ...RESOLVE_EXTS.map((e) => `${joined}.${e}`),
    ...RESOLVE_EXTS.map((e) => `${joined}/index.${e}`),
  ];
}

/** Resolve a relative specifier to a repo-relative POSIX source path (best-guess), or null. */
export function resolveImport(fromRelPath: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const fromDir = path.posix.dirname(fromRelPath);
  const joined = path.posix.normalize(path.posix.join(fromDir, spec));
  return candidatesFor(joined)[0] ?? null;
}

/** All candidate targets for a relative specifier, in resolution priority order. */
export function resolveCandidates(fromRelPath: string, spec: string): string[] {
  if (!spec.startsWith('.')) return [];
  const fromDir = path.posix.dirname(fromRelPath);
  const joined = path.posix.normalize(path.posix.join(fromDir, spec));
  return candidatesFor(joined);
}
