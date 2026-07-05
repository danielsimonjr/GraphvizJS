import { describe, expect, it } from 'vitest';
import {
  isSourceFile,
  parseFile,
  resolveCandidates,
  resolveImport,
} from '../../tools/dependency-graph/scan';

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

  it('records dynamic import() dependencies (destructured names and bare)', () => {
    const f = parseFile(
      'test/x.test.ts',
      "const { a, b } = await import('../src/foo');\nawait import('./bare');\n"
    );
    expect(f.internalDeps).toContainEqual({
      file: '../src/foo',
      imports: ['a', 'b'],
      typeOnly: false,
    });
    // A bare dynamic import binds nothing by name → treat as wildcard (consumes all).
    expect(f.internalDeps).toContainEqual({ file: './bare', imports: ['*'], typeOnly: false });
  });

  it('resolves the imported name before a rename in a dynamic import', () => {
    const f = parseFile(
      'test/x.test.ts',
      "const { createPreview: cp } = await import('../src/p');"
    );
    expect(f.internalDeps).toContainEqual({
      file: '../src/p',
      imports: ['createPreview'],
      typeOnly: false,
    });
  });

  it('ignores non-relative dynamic imports', () => {
    const f = parseFile('src/a.ts', "const x = await import('node:fs');\n");
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

  it('counts lines without over-counting a trailing newline', () => {
    expect(parseFile('src/a.ts', 'a\nb\nc\n').loc).toBe(3);
    expect(parseFile('src/a.ts', 'a\nb\nc').loc).toBe(3);
    expect(parseFile('src/a.ts', '').loc).toBe(0);
  });

  it('records both bindings of a combined default + named import', () => {
    const f = parseFile('src/a.ts', "import Store, { type Options } from './store';\n");
    expect(f.internalDeps[0].imports).toEqual(['Options', 'Store']);
    // one binding is a runtime default → the whole import is a runtime import
    expect(f.internalDeps[0].typeOnly).toBe(false);
  });

  it('treats a mixed `{ type A, B }` import as runtime (not type-only)', () => {
    const f = parseFile('src/a.ts', "import { type A, B } from './c';\n");
    expect(f.internalDeps[0].typeOnly).toBe(false);
  });
});

describe('resolveImport', () => {
  it('resolves a sibling module to a .ts path', () => {
    expect(resolveImport('src/preview/render.ts', './graphviz')).toBe('src/preview/graphviz.ts');
  });
  it('resolves a parent-relative module', () => {
    expect(resolveImport('src/preview/render.ts', '../utils/debounce')).toBe(
      'src/utils/debounce.ts'
    );
  });
  it('resolves a test file importing into src', () => {
    expect(resolveImport('test/preview/render.test.ts', '../../src/preview/render')).toBe(
      'src/preview/render.ts'
    );
  });
  it('returns null for non-relative specifiers', () => {
    expect(resolveImport('src/a.ts', '@hpcc-js/wasm')).toBeNull();
  });
  it('prefers the ".ts" source sibling for a TS-ESM ".js" specifier', () => {
    expect(resolveImport('cli/index.ts', '../core/export.js')).toBe('core/export.ts');
  });
});

describe('resolveCandidates', () => {
  it('offers a directory index.ts candidate', () => {
    expect(resolveCandidates('src/toolbar/actions.ts', '../tabs')).toContain('src/tabs/index.ts');
  });
  it('offers both the ".ts" sibling and the real ".js" for a ".js" specifier', () => {
    // TS-ESM writes `./x.js` for `x.ts`; a hand-authored `x.js` must still resolve.
    // The .find(known.has) caller picks whichever file actually exists.
    expect(resolveCandidates('cli/index.ts', '../core/export.js')).toEqual([
      'core/export.ts',
      'core/export.js',
    ]);
  });
  it('offers js/jsx/mjs source candidates for an extensionless specifier', () => {
    const c = resolveCandidates('src/a.ts', './b');
    expect(c).toContain('src/b.ts');
    expect(c).toContain('src/b.js');
    expect(c).toContain('src/b.mjs');
    expect(c).toContain('src/b/index.js');
  });
});

describe('isSourceFile', () => {
  it('accepts every TS/JS source extension', () => {
    for (const name of ['a.ts', 'a.tsx', 'a.mts', 'a.cts', 'a.js', 'a.jsx', 'a.mjs', 'a.cjs']) {
      expect(isSourceFile(name)).toBe(true);
    }
  });
  it('rejects declarations and non-source files', () => {
    for (const name of ['a.d.ts', 'a.css', 'a.json', 'a.dot', 'README.md']) {
      expect(isSourceFile(name)).toBe(false);
    }
  });
});
