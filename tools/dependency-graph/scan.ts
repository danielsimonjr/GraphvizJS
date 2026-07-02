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

export function parseFile(relPath: string, content: string): ParsedFile {
  return {
    path: relPath,
    internalDeps: parseImports(content),
    exports: parseExports(content),
    loc: content.split('\n').length,
  };
}

/** Resolve a relative specifier to a repo-relative POSIX `.ts` path (best-guess), or null. */
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
