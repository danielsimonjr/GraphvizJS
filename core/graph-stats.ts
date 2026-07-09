import { parseGraph } from './parse-graph.js';
import type { GraphEdge, GraphModel, GraphStats } from './types.js';

/** Iterative 3-color DFS: true if the directed graph has a back-edge (or self-loop). */
function hasDirectedCycle(nodes: string[], adj: Map<string, string[]>): boolean {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n, WHITE);
  for (const start of nodes) {
    if (color.get(start) !== WHITE) continue;
    color.set(start, GRAY);
    const stack: { node: string; i: number }[] = [{ node: start, i: 0 }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const neighbors = adj.get(top.node) ?? [];
      if (top.i < neighbors.length) {
        const next = neighbors[top.i++];
        const c = color.get(next);
        if (c === GRAY) return true; // back-edge (self-loop: next === node, already GRAY)
        if (c === WHITE) {
          color.set(next, GRAY);
          stack.push({ node: next, i: 0 });
        }
      } else {
        color.set(top.node, BLACK);
        stack.pop();
      }
    }
  }
  return false;
}

/** Union-find: true if the undirected graph has a cycle (incl. self-loop / parallel edge). */
function hasUndirectedCycle(nodes: string[], edges: GraphEdge[]): boolean {
  const parent = new Map<string, string>();
  const ensure = (x: string): void => {
    if (!parent.has(x)) parent.set(x, x);
  };
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const nxt = parent.get(cur)!;
      parent.set(cur, root);
      cur = nxt;
    }
    return root;
  };
  for (const n of nodes) ensure(n);
  for (const { from, to } of edges) {
    if (from === to) return true; // self-loop
    ensure(from);
    ensure(to);
    const rf = find(from);
    const rt = find(to);
    if (rf === rt) return true; // closes a cycle (a parallel edge does too)
    parent.set(rf, rt);
  }
  return false;
}

export function computeStats(model: GraphModel): GraphStats {
  const { directed, strict, nodes, edges, subgraphs } = model;
  const outAdj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  const outdeg = new Map<string, number>();
  const incident = new Set<string>();
  for (const id of nodes) {
    outAdj.set(id, []);
    indeg.set(id, 0);
    outdeg.set(id, 0);
  }
  for (const { from, to } of edges) {
    if (!outAdj.has(from)) outAdj.set(from, []);
    outAdj.get(from)!.push(to);
    outdeg.set(from, (outdeg.get(from) ?? 0) + 1);
    indeg.set(to, (indeg.get(to) ?? 0) + 1);
    incident.add(from);
    incident.add(to);
  }

  const stats: GraphStats = {
    directed,
    strict,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    subgraphCount: subgraphs.length,
    clusterCount: subgraphs.filter((s) => s.isCluster).length,
    isolated: nodes.filter((id) => !incident.has(id)).length,
    selfLoops: edges.filter((e) => e.from === e.to).length,
    hasCycle: directed ? hasDirectedCycle(nodes, outAdj) : hasUndirectedCycle(nodes, edges),
  };
  if (directed) {
    stats.roots = nodes.filter((id) => (indeg.get(id) ?? 0) === 0).length;
    stats.leaves = nodes.filter((id) => (outdeg.get(id) ?? 0) === 0).length;
  }
  return stats;
}

export function graphStats(source: string): GraphStats {
  return computeStats(parseGraph(source));
}
