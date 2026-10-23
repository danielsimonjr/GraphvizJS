import { openSearchPanel } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { createSearch } from '../../src/editor/search';

describe('createSearch', () => {
  it('docks the search panel at the top of the editor', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = new EditorView({
      state: EditorState.create({ doc: 'digraph { a -> b }', extensions: [createSearch()] }),
      parent: container,
    });

    expect(openSearchPanel(view)).toBe(true);

    expect(view.dom.querySelector('.cm-panels-top .cm-search')).not.toBeNull();
    expect(view.dom.querySelector('.cm-panels-bottom .cm-search')).toBeNull();

    view.destroy();
    container.remove();
  });
});
