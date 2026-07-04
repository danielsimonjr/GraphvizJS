import { describe, expect, it } from 'vitest';
import { buildAnalysis } from '../../tools/dependency-graph/index';

describe('buildAnalysis (real repo)', () => {
  const a = buildAnalysis(process.cwd());

  it('discovers the real module structure', () => {
    for (const mod of ['editor', 'preview', 'toolbar', 'tabs', 'platform']) {
      expect(a.modules.has(mod)).toBe(true);
    }
  });

  it('wires all 12 IPC channels with no gaps', () => {
    expect(a.ipc.fullyWired).toHaveLength(12);
    expect(a.ipc.missingHandlers).toHaveLength(0);
    expect(a.ipc.orphanHandlers).toHaveLength(0);
    expect(a.ipc.missingContract).toHaveLength(0);
  });

  it('reports no runtime circular dependencies', () => {
    expect(a.cycles.runtime).toEqual([]);
  });

  it('counts a non-trivial number of source files', () => {
    expect(a.stats.fileCount).toBeGreaterThan(10);
  });
});
