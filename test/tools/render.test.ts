import { describe, expect, it } from 'vitest';
import { renderJson, renderMarkdown, renderMermaid } from '../../tools/dependency-graph/render';
import type { Analysis } from '../../tools/dependency-graph/types';

const analysis = (): Analysis => ({
  files: [{ path: 'src/preview/render.ts', internalDeps: [], exports: ['render'], loc: 10 }],
  testFiles: [],
  modules: new Map([['preview', ['src/preview/render.ts']]]),
  moduleEdges: new Map([['toolbar', new Set(['preview'])]]),
  cycles: { runtime: [], typeOnly: [] },
  unused: { unusedFiles: [], dormantFiles: [], unusedExports: [] },
  coverage: [{ file: 'src/preview/render.ts', testFiles: ['test/preview/render.test.ts'] }],
  ipc: {
    fullyWired: [
      {
        channel: 'app:info',
        method: 'appInfo',
        hasContract: true,
        hasPreload: true,
        hasHandler: true,
      },
    ],
    missingContract: [],
    missingHandlers: [],
    orphanHandlers: [],
  },
  layerViolations: [],
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

  it('marks a channel with no contract', () => {
    const a = analysis();
    a.ipc.missingContract = [
      {
        channel: 'app:driftedChannel',
        method: 'drifted',
        hasContract: false,
        hasPreload: true,
        hasHandler: true,
      },
    ];
    const md = renderMarkdown(a);
    expect(md).toContain('app:driftedChannel');
    expect(md).toMatch(/no contract/i);
  });

  it('renders the architecture rules section: clean vs. a violation', () => {
    expect(renderMarkdown(analysis())).toMatch(/Architecture rules[\s\S]*respected ✅/);
    const a = analysis();
    a.layerViolations = [
      {
        from: 'src/preview/render.ts',
        to: 'core/render.ts',
        spec: '../../core/render',
        typeOnly: false,
        rule: 'renderer may import core only as type-only core/types (renderer purity)',
      },
    ];
    const md = renderMarkdown(a);
    expect(md).toContain('⛔');
    expect(md).toContain('`src/preview/render.ts` → `core/render.ts`');
  });

  it('renders "none" for dormant files when there are none, and lists them when present', () => {
    expect(renderMarkdown(analysis())).toMatch(/Dormant files.*none ✅/);
    const a = analysis();
    a.unused.dormantFiles = ['src/dead/leaf.ts'];
    const md = renderMarkdown(a);
    expect(md).toContain('Dormant files');
    expect(md).toContain('`src/dead/leaf.ts`');
  });
});
