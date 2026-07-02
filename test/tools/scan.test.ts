import { describe, expect, it } from 'vitest';
import { parseFile, resolveCandidates, resolveImport } from '../../tools/dependency-graph/scan';

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
});

describe('resolveCandidates', () => {
  it('offers a directory index.ts candidate', () => {
    expect(resolveCandidates('src/toolbar/actions.ts', '../tabs')).toContain('src/tabs/index.ts');
  });
});
