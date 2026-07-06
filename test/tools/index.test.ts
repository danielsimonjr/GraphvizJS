import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAnalysis, staleDocs, writeOutputs } from '../../tools/dependency-graph/index';

describe('staleDocs', () => {
  const a = buildAnalysis(process.cwd());

  it('reports every generated doc as stale when none are written yet', () => {
    const empty = mkdtempSync(join(tmpdir(), 'dgt-stale-'));
    expect(staleDocs(empty, a)).toHaveLength(3); // md, json, mermaid all missing
  });

  it('reports none right after writeOutputs, and the changed one after an edit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dgt-fresh-'));
    const written = writeOutputs(dir, a);
    expect(staleDocs(dir, a)).toEqual([]);
    writeFileSync(written[0], 'tampered', 'utf-8'); // corrupt DEPENDENCY_GRAPH.md
    expect(staleDocs(dir, a)).toEqual(['docs/architecture/DEPENDENCY_GRAPH.md']);
  });
});

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

  it('has no dormant files (no dead import clusters unreachable from entries)', () => {
    expect(a.unused.dormantFiles).toEqual([]);
  });

  it('respects every architecture layer boundary', () => {
    expect(a.layerViolations).toEqual([]);
  });

  it('wires all 17 IPC channels with no gaps', () => {
    expect(a.ipc.fullyWired).toHaveLength(17);
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
