import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { createEditorTheme } from '../../src/editor/theme';

/** The CSS text that the theme adds to an editor. */
function themeRules(): string {
  return EditorState.create({ extensions: [createEditorTheme()] })
    .facet(EditorView.styleModule)
    .map((module) => module.getRules())
    .join('\n');
}

describe('editor/theme', () => {
  describe('createEditorTheme()', () => {
    it('frames the editor with a border and a background from the --editor variables', () => {
      const rules = themeRules();

      expect(rules).toMatch(/border-radius:\s*8px/);
      expect(rules).toMatch(/border:\s*1px solid var\(--editor-border\)/);
      expect(rules).toMatch(/background-color:\s*var\(--editor-bg\)/);
    });

    it('sets a monospace font and a line height on the scroller', () => {
      const rules = themeRules();

      // The generic family must be its own entry in the list: `ui-monospace` is a different name.
      expect(rules).toMatch(/\.cm-scroller\s*\{[^}]*font-family:[^;}]*,\s*monospace\s*[;}]/);
      expect(rules).toMatch(/\.cm-scroller\s*\{[^}]*line-height:\s*1\.5/);
    });

    it('colors the caret and the gutter text from the --editor variables', () => {
      const rules = themeRules();

      expect(rules).toMatch(/\.cm-content\s*\{[^}]*caret-color:\s*var\(--editor-caret\)/);
      expect(rules).toMatch(/\.cm-gutters\s*\{[^}]*[{;\s]color:\s*var\(--editor-gutter\)/);
    });
  });
});
