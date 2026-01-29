import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { forceLinting } from '@codemirror/lint';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DotValidationError } from '../../src/preview/graphviz';

// Use vi.hoisted to create the mock before vi.mock is hoisted
const { mockValidateDot } = vi.hoisted(() => ({
  mockValidateDot: vi.fn<[string, string], Promise<DotValidationError | null>>(),
}));

// Mock the graphviz module
vi.mock('../../src/preview/graphviz', () => ({
  validateDot: mockValidateDot,
}));

// Import after mock setup
import { createDotLinter, lintGutter } from '../../src/editor/linting';

describe('editor/linting', () => {
  let container: HTMLElement;
  let mockGetEngine: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateDot.mockReset();
    mockValidateDot.mockResolvedValue(null);
    mockGetEngine = vi.fn().mockReturnValue('dot');

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('createDotLinter()', () => {
    it('returns a CodeMirror extension', () => {
      const linterExt = createDotLinter({ getEngine: mockGetEngine });
      expect(linterExt).toBeDefined();
    });

    it('extension can be used in EditorState', () => {
      const linterExt = createDotLinter({ getEngine: mockGetEngine });
      const state = EditorState.create({
        doc: 'digraph { a -> b }',
        extensions: [linterExt],
      });
      expect(state).toBeDefined();
    });

    it('extension can be used in EditorView', () => {
      const linterExt = createDotLinter({ getEngine: mockGetEngine });
      const view = new EditorView({
        state: EditorState.create({
          doc: 'digraph { a -> b }',
          extensions: [linterExt],
        }),
        parent: container,
      });
      expect(view.dom).toBeDefined();
      view.destroy();
    });
  });

  describe('linter behavior', () => {
    /**
     * Helper to run the linter and capture diagnostics.
     * Uses forceLinting to trigger immediate validation and captures
     * diagnostics by intercepting transaction effects with diagnostic array values.
     */
    async function runLinter(
      doc: string,
      validationResult: DotValidationError | null
    ): Promise<{ diagnostics: any[]; view: EditorView }> {
      mockValidateDot.mockResolvedValue(validationResult);

      // Captured diagnostics
      const capturedDiagnostics: any[] = [];

      const linterExt = createDotLinter({
        getEngine: mockGetEngine,
        delay: 0, // No delay for tests
      });

      // Create extension to capture diagnostics by looking for effects with array values
      // containing objects with 'from', 'to', 'severity', 'message' properties
      const captureExt = EditorState.transactionExtender.of((tr) => {
        for (const effect of tr.effects) {
          const value = effect.value;
          if (
            Array.isArray(value) &&
            (value.length === 0 ||
              (value[0] &&
                typeof value[0].from === 'number' &&
                typeof value[0].severity === 'string'))
          ) {
            capturedDiagnostics.length = 0;
            capturedDiagnostics.push(...value);
          }
        }
        return null;
      });

      const view = new EditorView({
        state: EditorState.create({
          doc,
          extensions: [linterExt, captureExt],
        }),
        parent: container,
      });

      // Force linting to run immediately
      forceLinting(view);

      // Allow async linter to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      return { diagnostics: capturedDiagnostics, view };
    }

    it('returns empty diagnostics for valid DOT', async () => {
      // validateDot returns null for valid DOT
      const { diagnostics, view } = await runLinter('digraph { a -> b }', null);

      expect(diagnostics).toHaveLength(0);
      expect(mockGetEngine).toHaveBeenCalled();

      view.destroy();
    });

    it('getEngine callback is called during linting', async () => {
      mockValidateDot.mockResolvedValue(null);

      const { view } = await runLinter('digraph { a -> b }', null);

      expect(mockGetEngine).toHaveBeenCalled();
      expect(mockValidateDot).toHaveBeenCalledWith('digraph { a -> b }', 'dot');

      view.destroy();
    });

    it('uses the engine returned by getEngine', async () => {
      mockGetEngine.mockReturnValue('neato');
      mockValidateDot.mockResolvedValue(null);

      const { view } = await runLinter('graph { a -- b }', null);

      expect(mockValidateDot).toHaveBeenCalledWith('graph { a -- b }', 'neato');

      view.destroy();
    });

    it('returns diagnostic with correct positions for line errors', async () => {
      const docContent = 'digraph {\n  a -> b\n  invalid\n}';
      // Error on line 3 (1-indexed)
      const error: DotValidationError = {
        message: 'syntax error in line 3',
        line: 3,
      };

      const { diagnostics, view } = await runLinter(docContent, error);

      expect(diagnostics).toHaveLength(1);

      const diag = diagnostics[0];
      // Line 3 starts after "digraph {\n  a -> b\n" (19 chars)
      // Line 3 is "  invalid" - should mark from position 19 to 28
      const line3 = view.state.doc.line(3);
      expect(diag.from).toBe(line3.from);
      expect(diag.to).toBe(line3.to);

      view.destroy();
    });

    it('returns diagnostic with column offset when provided', async () => {
      const docContent = 'digraph {\n  a -> b\n  invalid\n}';
      // Error on line 3, column 4
      const error: DotValidationError = {
        message: 'syntax error in line 3',
        line: 3,
        column: 4,
      };

      const { diagnostics, view } = await runLinter(docContent, error);

      expect(diagnostics).toHaveLength(1);

      const diag = diagnostics[0];
      const line3 = view.state.doc.line(3);
      // from should be line start + (column - 1)
      expect(diag.from).toBe(line3.from + 3); // column 4 means offset 3
      expect(diag.to).toBe(line3.to);

      view.destroy();
    });

    it('returns document-start diagnostic for unknown-position errors', async () => {
      const docContent = 'invalid syntax here';
      // Error with no line number
      const error: DotValidationError = {
        message: 'Unknown error occurred',
      };

      const { diagnostics, view } = await runLinter(docContent, error);

      expect(diagnostics).toHaveLength(1);

      const diag = diagnostics[0];
      // Should mark the first line when position unknown
      const line1 = view.state.doc.line(1);
      expect(diag.from).toBe(0);
      expect(diag.to).toBe(line1.to);

      view.destroy();
    });

    it('diagnostic severity is set to error', async () => {
      const error: DotValidationError = {
        message: 'syntax error',
        line: 1,
      };

      const { diagnostics, view } = await runLinter('invalid', error);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe('error');

      view.destroy();
    });

    it('diagnostic message matches error details', async () => {
      const errorMessage = 'Error: syntax error in line 2 near "xyz"';
      const error: DotValidationError = {
        message: errorMessage,
        line: 2,
      };

      const { diagnostics, view } = await runLinter('digraph {\nxyz\n}', error);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toBe(errorMessage);

      view.destroy();
    });

    it('skips validation for empty documents', async () => {
      mockValidateDot.mockResolvedValue(null);

      const { diagnostics, view } = await runLinter('', null);

      // validateDot should not be called for empty docs
      expect(diagnostics).toHaveLength(0);

      view.destroy();
    });

    it('skips validation for whitespace-only documents', async () => {
      mockValidateDot.mockResolvedValue(null);

      const { diagnostics, view } = await runLinter('   \n\t\n  ', null);

      expect(diagnostics).toHaveLength(0);

      view.destroy();
    });

    it('handles line number exceeding document lines', async () => {
      const docContent = 'digraph { a }';
      // Error reports line 10, but doc only has 1 line
      const error: DotValidationError = {
        message: 'error on non-existent line',
        line: 10,
      };

      const { diagnostics, view } = await runLinter(docContent, error);

      expect(diagnostics).toHaveLength(1);
      const diag = diagnostics[0];
      // Should clamp to last line
      const lastLine = view.state.doc.line(view.state.doc.lines);
      expect(diag.from).toBe(lastLine.from);
      expect(diag.to).toBe(lastLine.to);

      view.destroy();
    });

    it('handles column exceeding line length', async () => {
      const docContent = 'ab';
      // Column 100, but line only has 2 chars
      const error: DotValidationError = {
        message: 'error with large column',
        line: 1,
        column: 100,
      };

      const { diagnostics, view } = await runLinter(docContent, error);

      expect(diagnostics).toHaveLength(1);
      const diag = diagnostics[0];
      // Column should be clamped
      const line1 = view.state.doc.line(1);
      expect(diag.from).toBeLessThanOrEqual(line1.to);
      expect(diag.to).toBe(line1.to);

      view.destroy();
    });
  });

  describe('lintGutter export', () => {
    it('exports lintGutter function', () => {
      expect(lintGutter).toBeDefined();
      expect(typeof lintGutter).toBe('function');
    });

    it('lintGutter returns an extension', () => {
      const gutterExt = lintGutter();
      expect(gutterExt).toBeDefined();
    });

    it('lintGutter extension can be used with editor', () => {
      const gutterExt = lintGutter();
      const state = EditorState.create({
        doc: 'test',
        extensions: [gutterExt],
      });
      expect(state).toBeDefined();
    });
  });
});
