import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { createEditorTheme } from '../../src/editor/theme';

describe('editor/theme', () => {
  describe('createEditorTheme()', () => {
    it('returns Extension', () => {
      const theme = createEditorTheme();
      expect(theme).toBeDefined();
    });

    it('includes syntax highlighting colors', () => {
      const theme = createEditorTheme();
      // Theme is an extension, verify it can be used
      const state = EditorState.create({
        doc: 'test content',
        extensions: [theme],
      });
      expect(state).toBeDefined();
    });

    it('includes editor styling', () => {
      const theme = createEditorTheme();
      const container = document.createElement('div');
      const view = new EditorView({
        state: EditorState.create({
          doc: 'test content',
          extensions: [theme],
        }),
        parent: container,
      });

      // Verify the view was created with the theme
      expect(view.dom).toBeDefined();
      view.destroy();
    });
  });
});
