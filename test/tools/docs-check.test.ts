// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkDocs } from '../../tools/docs-check/index';

/**
 * CI freshness guard for the hand-authored architecture docs. If a module or an IPC
 * channel is added to the codebase but never documented in docs/architecture/, this
 * fails — the same rot the README suffered across five releases, now build-failing.
 */
describe('docs freshness (real repo)', () => {
  const result = checkDocs(process.cwd());

  it('names every dependency-graph module in COMPONENTS.md', () => {
    expect(result.missingModules).toEqual([]);
  });

  it('documents every fully-wired IPC channel in the architecture docs', () => {
    expect(result.missingChannels).toEqual([]);
  });

  it('checks a non-trivial number of modules and channels', () => {
    // Sanity: the guard actually ran against a populated graph, not an empty one.
    expect(result.moduleCount).toBeGreaterThan(15);
    expect(result.channelCount).toBe(19);
  });
});
