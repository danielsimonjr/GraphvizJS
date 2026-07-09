import { describe, expect, it } from 'vitest';
import { graphStats } from '../../core/graph-stats';

describe('graphStats', () => {
  it('counts nodes, edges, subgraphs, clusters', () => {
    const s = graphStats('digraph { subgraph cluster_a { x } a -> b -> c }');
    expect(s).toMatchObject({
      nodeCount: 4,
      edgeCount: 2,
      subgraphCount: 1,
      clusterCount: 1,
      directed: true,
      strict: false,
    });
  });

  it('reports roots/leaves/isolated for a directed DAG', () => {
    const s = graphStats('digraph { a -> b; a -> c; d }');
    expect(s.roots).toBe(2); // a, d
    expect(s.leaves).toBe(3); // b, c, d
    expect(s.isolated).toBe(1); // d
    expect(s.hasCycle).toBe(false);
  });

  it('detects a directed cycle', () => {
    expect(graphStats('digraph { a -> b -> c -> a }').hasCycle).toBe(true);
  });

  it('detects a self-loop as a cycle and counts it', () => {
    const s = graphStats('digraph { a -> a }');
    expect(s.selfLoops).toBe(1);
    expect(s.hasCycle).toBe(true);
  });

  it('omits roots/leaves for an undirected graph', () => {
    const s = graphStats('graph { a -- b -- c }');
    expect(s.roots).toBeUndefined();
    expect(s.leaves).toBeUndefined();
    expect(s.hasCycle).toBe(false); // a path/tree is acyclic
  });

  it('detects an undirected cycle', () => {
    expect(graphStats('graph { a -- b -- c -- a }').hasCycle).toBe(true);
  });

  it('detects a parallel undirected edge as a cycle', () => {
    expect(graphStats('graph { a -- b; a -- b }').hasCycle).toBe(true);
  });

  it('handles empty/malformed input without throwing', () => {
    expect(graphStats('').nodeCount).toBe(0);
    expect(() => graphStats('digraph { a ->')).not.toThrow();
  });
});
