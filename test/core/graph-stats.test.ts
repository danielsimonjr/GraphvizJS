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

  it('counts a repeated edge of a graph that is not strict each time', () => {
    expect(graphStats('digraph { a -> b; a -> b }').edgeCount).toBe(2);
  });

  it('counts a repeated edge of a strict digraph once', () => {
    expect(graphStats('strict digraph { a -> b; a -> b }').edgeCount).toBe(1);
  });

  it('counts the same pair of a strict undirected graph once, and finds no cycle', () => {
    const s = graphStats('strict graph { a -- b; b -- a }');
    expect(s.edgeCount).toBe(1);
    expect(s.hasCycle).toBe(false);
  });

  it('keeps the opposite directions of a strict digraph, and finds the cycle', () => {
    const s = graphStats('strict digraph { a -> b; b -> a }');
    expect(s.edgeCount).toBe(2);
    expect(s.hasCycle).toBe(true);
  });

  it('counts a repeated self-loop of a strict digraph once', () => {
    const s = graphStats('strict digraph { a -> a; a -> a }');
    expect(s.edgeCount).toBe(1);
    expect(s.selfLoops).toBe(1);
    expect(s.hasCycle).toBe(true);
  });

  it('handles empty/malformed input without throwing', () => {
    expect(graphStats('').nodeCount).toBe(0);
    expect(() => graphStats('digraph { a ->')).not.toThrow();
  });
});
