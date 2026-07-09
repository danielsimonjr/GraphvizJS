import type { GraphStats } from '../../core/types';

export interface StatsDialogOptions {
  getSource: () => string;
  graphStats: (source: string) => Promise<GraphStats>;
}

export interface StatsDialog {
  open(): Promise<void>;
}

function rows(stats: GraphStats): [string, string][] {
  const yn = (b: boolean): string => (b ? 'yes' : 'no');
  const out: [string, string][] = [
    ['Directed', yn(stats.directed)],
    ['Strict', yn(stats.strict)],
    ['Nodes', String(stats.nodeCount)],
    ['Edges', String(stats.edgeCount)],
    ['Subgraphs', String(stats.subgraphCount)],
    ['Clusters', String(stats.clusterCount)],
  ];
  if (stats.directed) {
    out.push(['Roots', String(stats.roots)], ['Leaves', String(stats.leaves)]);
  }
  out.push(
    ['Isolated', String(stats.isolated)],
    ['Self-loops', String(stats.selfLoops)],
    ['Cyclic', yn(stats.hasCycle)]
  );
  return out;
}

export function createStatsDialog(opts: StatsDialogOptions): StatsDialog {
  let el: HTMLDialogElement | null = null;

  const ensure = (): HTMLDialogElement => {
    if (el) return el;
    el = document.createElement('dialog');
    el.className = 'stats-dialog';
    el.addEventListener('click', (event) => {
      if (event.target === el) el?.close();
    });
    document.body.appendChild(el);
    return el;
  };

  const render = (dialog: HTMLDialogElement, stats: GraphStats): void => {
    const body = rows(stats)
      .map(([label, value]) => `<div class="stats-row"><dt>${label}</dt><dd>${value}</dd></div>`)
      .join('');
    dialog.innerHTML = `
      <div class="stats-dialog-content">
        <header class="stats-dialog-header">
          <h2>Graph Statistics</h2>
          <button type="button" class="stats-dialog-close" aria-label="Close">
            <i class="ri-close-line" aria-hidden="true"></i>
          </button>
        </header>
        <dl class="stats-dialog-body">${body}</dl>
      </div>`;
    dialog.querySelector('.stats-dialog-close')?.addEventListener('click', () => dialog.close());
  };

  return {
    async open(): Promise<void> {
      const dialog = ensure();
      const stats = await opts.graphStats(opts.getSource());
      render(dialog, stats);
      dialog.showModal();
    },
  };
}
