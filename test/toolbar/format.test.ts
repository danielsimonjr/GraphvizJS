import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDot as realFormatDot } from '../../core/format';

// The format action now reaches the pure formatter over the dot:format IPC.
// Mock the platform wrapper to delegate to the real core formatter so the
// behavioral assertions (exact reformatted output) still hold.
vi.mock('../../src/platform', () => ({
  formatDot: (source: string) => Promise.resolve(realFormatDot(source)),
}));

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

  it('reformats the document and resolves true when it changes', async () => {
    editor = new EditorView({
      state: EditorState.create({ doc: 'digraph G {\na->b;\n}' }),
      parent: container,
    });

    const changed = await formatView(editor);

    expect(changed).toBe(true);
    expect(editor.state.doc.toString()).toBe('digraph G {\n  a -> b;\n}');
  });

  it('resolves false and leaves the doc untouched when already formatted', async () => {
    editor = new EditorView({
      state: EditorState.create({ doc: 'digraph G {\n  a -> b;\n}' }),
      parent: container,
    });

    const changed = await formatView(editor);

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

  it('reformats on click and calls onFormat with the new doc', async () => {
    const button = document.createElement('button');
    const onFormat = vi.fn();
    setupFormat({ button, getEditor: () => editor, onFormat });

    button.click();

    await vi.waitFor(() => {
      expect(editor.state.doc.toString()).toBe('digraph G {\n  a -> b;\n}');
      expect(onFormat).toHaveBeenCalledWith('digraph G {\n  a -> b;\n}');
    });
  });

  it('does not call onFormat when the doc is already formatted', async () => {
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: 'digraph G {\n  a -> b;\n}' },
    });
    const button = document.createElement('button');
    const onFormat = vi.fn();
    setupFormat({ button, getEditor: () => editor, onFormat });

    button.click();

    // Give the async format a chance to run, then assert it stayed silent.
    await new Promise((r) => setTimeout(r, 0));
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

  it('binds Shift-Alt-f, returns true synchronously, and reformats on the next tick', async () => {
    editor = new EditorView({
      state: EditorState.create({ doc: 'digraph G {\na->b;\n}' }),
      parent: container,
    });
    const onFormat = vi.fn();
    const binding = makeFormatKeymap(onFormat);

    expect(binding.key).toBe('Shift-Alt-f');
    const handled = binding.run?.(editor);

    expect(handled).toBe(true);
    await vi.waitFor(() => {
      expect(editor.state.doc.toString()).toBe('digraph G {\n  a -> b;\n}');
      expect(onFormat).toHaveBeenCalledWith('digraph G {\n  a -> b;\n}');
    });
  });

  it('returns true without calling onFormat when nothing changes', async () => {
    editor = new EditorView({
      state: EditorState.create({ doc: 'digraph G {\n  a -> b;\n}' }),
      parent: container,
    });
    const onFormat = vi.fn();
    const binding = makeFormatKeymap(onFormat);

    const handled = binding.run?.(editor);

    expect(handled).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(onFormat).not.toHaveBeenCalled();
  });
});
