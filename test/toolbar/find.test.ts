import { search } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupFind } from '../../src/toolbar/find';

describe('setupFind', () => {
  let container: HTMLElement;
  let editor: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    editor = new EditorView({
      state: EditorState.create({ doc: 'digraph { a -> b }', extensions: [search({ top: true })] }),
      parent: container,
    });
  });

  afterEach(() => {
    editor.destroy();
    container.remove();
  });

  it('does nothing when button is null', () => {
    expect(() => setupFind({ button: null, getEditor: () => editor })).not.toThrow();
  });

  it('opens the search panel and focuses the editor on click', () => {
    const button = document.createElement('button');
    setupFind({ button, getEditor: () => editor });

    expect(editor.dom.querySelector('.cm-search')).toBeNull();
    button.click();
    expect(editor.dom.querySelector('.cm-search')).not.toBeNull();
  });
});
