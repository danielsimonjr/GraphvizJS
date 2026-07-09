import { describe, expect, it, vi } from 'vitest';
import { createStatsDialog } from '../../src/stats/stats-dialog';

const STATS = {
  directed: true,
  strict: false,
  nodeCount: 3,
  edgeCount: 3,
  subgraphCount: 1,
  clusterCount: 1,
  isolated: 0,
  selfLoops: 0,
  hasCycle: true,
  roots: 1,
  leaves: 1,
};

describe('createStatsDialog', () => {
  it('renders current stats into a table on open', async () => {
    // happy-dom lacks HTMLDialogElement.showModal in some versions — stub it.
    HTMLDialogElement.prototype.showModal = vi.fn();
    const graphStats = vi.fn().mockResolvedValue(STATS);
    const dialog = createStatsDialog({
      getSource: () => 'digraph { a -> b -> c -> a }',
      graphStats,
    });
    await dialog.open();
    expect(graphStats).toHaveBeenCalledWith('digraph { a -> b -> c -> a }');
    const el = document.querySelector('.stats-dialog');
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain('Nodes');
    expect(el!.textContent).toContain('3');
    expect(el!.textContent).toContain('Cyclic'); // hasCycle true
  });

  it('recomputes on each open', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    const graphStats = vi.fn().mockResolvedValue({ ...STATS, nodeCount: 9 });
    const dialog = createStatsDialog({ getSource: () => 'digraph { }', graphStats });
    await dialog.open();
    await dialog.open();
    expect(graphStats).toHaveBeenCalledTimes(2);
  });
});
