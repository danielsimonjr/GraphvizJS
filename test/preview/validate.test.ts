import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../mocks/graphviz';
import { configureMockError, getCurrentInstance, resetMockGraphviz } from '../mocks/graphviz';

describe('validateDot', () => {
  beforeEach(() => {
    vi.resetModules();
    resetMockGraphviz();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('valid DOT input', () => {
    it('returns null for valid DOT', async () => {
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('digraph { a -> b }');

      expect(result).toBeNull();
    });

    it('returns null for valid graph (undirected)', async () => {
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('graph { a -- b }');

      expect(result).toBeNull();
    });

    it('returns null for complex valid DOT', async () => {
      const { validateDot } = await import('../../src/preview/graphviz');

      const dotSource = `
        digraph G {
          rankdir=LR;
          node [shape=box];
          a -> b -> c;
          b -> d;
        }
      `;
      const result = await validateDot(dotSource);

      expect(result).toBeNull();
    });
  });

  describe('error with line number extraction', () => {
    it('parses "in line N" format', async () => {
      configureMockError(new Error('Error: <stdin>: syntax error in line 5'));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.message).toBe('Error: <stdin>: syntax error in line 5');
      expect(result?.line).toBe(5);
      expect(result?.column).toBeUndefined();
    });

    it('parses "syntax error in line N near token" format', async () => {
      configureMockError(new Error("Error: <stdin>: syntax error in line 3 near 'digraph'"));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.line).toBe(3);
    });

    it('parses simple "syntax error in line N" format', async () => {
      configureMockError(new Error('syntax error in line 10'));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.line).toBe(10);
    });

    it('parses "Error: ... in line N ..." format', async () => {
      configureMockError(new Error('Error: unexpected token in line 7 at position 12'));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.line).toBe(7);
    });

    it('parses "line N:" format', async () => {
      configureMockError(new Error('line 15: unexpected end of file'));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.line).toBe(15);
    });

    it('parses ":N:N:" (file:line:column) format', async () => {
      configureMockError(new Error('file.dot:8:12: syntax error'));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.line).toBe(8);
      expect(result?.column).toBe(12);
    });

    it('parses case-insensitive "IN LINE N"', async () => {
      configureMockError(new Error('ERROR: SYNTAX ERROR IN LINE 4'));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.line).toBe(4);
    });
  });

  describe('error without parseable line number', () => {
    it('returns message-only error when no line number present', async () => {
      configureMockError(new Error('Unknown error occurred'));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.message).toBe('Unknown error occurred');
      expect(result?.line).toBeUndefined();
      expect(result?.column).toBeUndefined();
    });

    it('returns message-only for non-standard error format', async () => {
      configureMockError(new Error('GraphViz internal error'));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.message).toBe('GraphViz internal error');
      expect(result?.line).toBeUndefined();
    });

    it('handles non-Error thrown values', async () => {
      configureMockError('string error' as unknown as Error);
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.message).toBe('string error');
    });

    it('handles thrown objects without message property', async () => {
      const errorObj = { code: 'ERR_SYNTAX' };
      configureMockError(errorObj as unknown as Error);
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.message).toBe('[object Object]');
    });
  });

  describe('empty and whitespace input', () => {
    it('validates empty string input', async () => {
      // Note: Empty string may or may not throw depending on Graphviz behavior
      // In our mock, it will succeed since we don't configure an error
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('');

      // Empty string goes through the layout call - mock returns success
      expect(result).toBeNull();
    });

    it('validates whitespace-only input', async () => {
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('   \n\t\n   ');

      expect(result).toBeNull();
    });

    it('handles error from empty input when Graphviz rejects it', async () => {
      configureMockError(new Error('syntax error in line 1'));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('');

      expect(result).not.toBeNull();
      expect(result?.line).toBe(1);
    });
  });

  describe('engine parameter', () => {
    it('passes engine parameter to layout call', async () => {
      const { validateDot, initGraphviz } = await import('../../src/preview/graphviz');
      await initGraphviz();

      await validateDot('graph { a -- b }', 'neato');

      const instance = getCurrentInstance();
      expect(instance?.layout).toHaveBeenCalledWith('graph { a -- b }', 'svg', 'neato');
    });

    it('uses default "dot" engine when not specified', async () => {
      const { validateDot, initGraphviz } = await import('../../src/preview/graphviz');
      await initGraphviz();

      await validateDot('digraph { a -> b }');

      const instance = getCurrentInstance();
      expect(instance?.layout).toHaveBeenCalledWith('digraph { a -> b }', 'svg', 'dot');
    });

    it('passes fdp engine correctly', async () => {
      const { validateDot, initGraphviz } = await import('../../src/preview/graphviz');
      await initGraphviz();

      await validateDot('graph { a -- b -- c }', 'fdp');

      const instance = getCurrentInstance();
      expect(instance?.layout).toHaveBeenCalledWith('graph { a -- b -- c }', 'svg', 'fdp');
    });

    it('passes circo engine correctly', async () => {
      const { validateDot, initGraphviz } = await import('../../src/preview/graphviz');
      await initGraphviz();

      await validateDot('digraph { a -> b -> c -> a }', 'circo');

      const instance = getCurrentInstance();
      expect(instance?.layout).toHaveBeenCalledWith('digraph { a -> b -> c -> a }', 'svg', 'circo');
    });

    it('passes twopi engine correctly', async () => {
      const { validateDot, initGraphviz } = await import('../../src/preview/graphviz');
      await initGraphviz();

      await validateDot('digraph { root -> child1; root -> child2 }', 'twopi');

      const instance = getCurrentInstance();
      expect(instance?.layout).toHaveBeenCalledWith(
        'digraph { root -> child1; root -> child2 }',
        'svg',
        'twopi'
      );
    });

    it('passes sfdp engine correctly', async () => {
      const { validateDot, initGraphviz } = await import('../../src/preview/graphviz');
      await initGraphviz();

      await validateDot('graph { a -- b }', 'sfdp');

      const instance = getCurrentInstance();
      expect(instance?.layout).toHaveBeenCalledWith('graph { a -- b }', 'svg', 'sfdp');
    });

    it('passes osage engine correctly', async () => {
      const { validateDot, initGraphviz } = await import('../../src/preview/graphviz');
      await initGraphviz();

      await validateDot('graph { a -- b }', 'osage');

      const instance = getCurrentInstance();
      expect(instance?.layout).toHaveBeenCalledWith('graph { a -- b }', 'svg', 'osage');
    });

    it('passes patchwork engine correctly', async () => {
      const { validateDot, initGraphviz } = await import('../../src/preview/graphviz');
      await initGraphviz();

      await validateDot('graph { a -- b }', 'patchwork');

      const instance = getCurrentInstance();
      expect(instance?.layout).toHaveBeenCalledWith('graph { a -- b }', 'svg', 'patchwork');
    });
  });

  describe('edge cases for line number parsing', () => {
    it('ignores line 0 (invalid)', async () => {
      configureMockError(new Error('syntax error in line 0'));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.line).toBeUndefined();
    });

    it('ignores negative line numbers', async () => {
      configureMockError(new Error('syntax error in line -5'));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.line).toBeUndefined();
    });

    it('handles very large line numbers', async () => {
      configureMockError(new Error('syntax error in line 999999'));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.line).toBe(999999);
    });

    it('handles column 0 as undefined in :N:N: format', async () => {
      configureMockError(new Error('file.dot:5:0: error'));
      const { validateDot } = await import('../../src/preview/graphviz');

      const result = await validateDot('invalid DOT');

      expect(result).not.toBeNull();
      expect(result?.line).toBe(5);
      expect(result?.column).toBeUndefined();
    });
  });

  describe('Graphviz initialization', () => {
    it('initializes Graphviz if not already initialized', async () => {
      const { validateDot, isGraphvizReady } = await import('../../src/preview/graphviz');

      // Should not be ready initially
      expect(isGraphvizReady()).toBe(false);

      await validateDot('digraph { a -> b }');

      // Should be ready after validation
      expect(isGraphvizReady()).toBe(true);
    });
  });
});
