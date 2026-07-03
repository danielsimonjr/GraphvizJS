import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatView, makeFormatKeymap, setupFormat } from '../../src/toolbar/format';

describe('formatView', () => {
  let container: HTMLElement;
  let editor: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    editor.destroy();
    container.remove();
  });

  it('reformats the document and returns true when it changes', () => {
    editor = new EditorView({
      state: EditorState.create({ doc: 'digraph G {\na->b;\n}' }),
      parent: container,
    });

    const changed = formatView(editor);

    expect(changed).toBe(true);
    expect(editor.state.doc.toString()).toBe('digraph G {\n  a -> b;\n}');
  });

  it('returns false and leaves the doc untouched when already formatted', () => {
    editor = new EditorView({
      state: EditorState.create({ doc: 'digraph G {\n  a -> b;\n}' }),
      parent: container,
    });

    const changed = formatView(editor);

    expect(changed).toBe(false);
    expect(editor.state.doc.toString()).toBe('digraph G {\n  a -> b;\n}');
  });
});

describe('setupFormat', () => {
  let container: HTMLElement;
  let editor: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    editor = new EditorView({
      state: EditorState.create({ doc: 'digraph G {\na->b;\n}' }),
      parent: container,
    });
  });

  afterEach(() => {
    editor.destroy();
    container.remove();
  });

  it('does nothing when button is null', () => {
    const onFormat = vi.fn();
    expect(() => setupFormat({ button: null, getEditor: () => editor, onFormat })).not.toThrow();
    expect(onFormat).not.toHaveBeenCalled();
  });

  it('reformats on click and calls onFormat with the new doc', () => {
    const button = document.createElement('button');
    const onFormat = vi.fn();
    setupFormat({ button, getEditor: () => editor, onFormat });

    button.click();

    expect(editor.state.doc.toString()).toBe('digraph G {\n  a -> b;\n}');
    expect(onFormat).toHaveBeenCalledWith('digraph G {\n  a -> b;\n}');
  });

  it('does not call onFormat when the doc is already formatted', () => {
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: 'digraph G {\n  a -> b;\n}' },
    });
    const button = document.createElement('button');
    const onFormat = vi.fn();
    setupFormat({ button, getEditor: () => editor, onFormat });

    button.click();

    expect(onFormat).not.toHaveBeenCalled();
  });
});

describe('makeFormatKeymap', () => {
  let container: HTMLElement;
  let editor: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    editor.destroy();
    container.remove();
  });

  it('binds Shift-Alt-f and reformats via keymap.run', () => {
    editor = new EditorView({
      state: EditorState.create({ doc: 'digraph G {\na->b;\n}' }),
      parent: container,
    });
    const onFormat = vi.fn();
    const binding = makeFormatKeymap(onFormat);

    expect(binding.key).toBe('Shift-Alt-f');
    const handled = binding.run?.(editor);

    expect(handled).toBe(true);
    expect(editor.state.doc.toString()).toBe('digraph G {\n  a -> b;\n}');
    expect(onFormat).toHaveBeenCalledWith('digraph G {\n  a -> b;\n}');
  });

  it('returns true without calling onFormat when nothing changes', () => {
    editor = new EditorView({
      state: EditorState.create({ doc: 'digraph G {\n  a -> b;\n}' }),
      parent: container,
    });
    const onFormat = vi.fn();
    const binding = makeFormatKeymap(onFormat);

    const handled = binding.run?.(editor);

    expect(handled).toBe(true);
    expect(onFormat).not.toHaveBeenCalled();
  });
});
