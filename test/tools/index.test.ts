import { describe, expect, it } from 'vitest';
import { buildAnalysis } from '../../tools/dependency-graph/index';

describe('buildAnalysis (real repo)', () => {
  const a = buildAnalysis(process.cwd());

  it('discovers the real module structure incl. the headless layers', () => {
    for (const mod of [
      'editor',
      'preview',
      'toolbar',
      'tabs',
      'platform',
      'core',
      'cli',
      'electron',
    ]) {
      expect(a.modules.has(mod)).toBe(true);
    }
  });

  it('sees the CLI and renderer both depend on the shared core', () => {
    expect(a.moduleEdges.get('cli')?.has('core')).toBe(true);
    expect(a.moduleEdges.get('platform')?.has('core')).toBe(true);
  });

  it('has no unused files across the whole app (every layer is reachable)', () => {
    expect(a.unused.unusedFiles).toEqual([]);
  });

  it('wires all 16 IPC channels with no gaps', () => {
    expect(a.ipc.fullyWired).toHaveLength(16);
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
