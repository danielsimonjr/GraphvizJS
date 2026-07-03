import type { KeyBinding } from '@codemirror/view';
import type { EditorView } from 'codemirror';
import { formatDot } from '../editor/format';

/** Reformat the given editor's document in a single transaction. */
export function formatView(view: EditorView): boolean {
  const current = view.state.doc.toString();
  const next = formatDot(current);
  if (next === current) return false;
  view.dispatch({
    changes: { from: 0, to: current.length, insert: next },
    selection: { anchor: Math.min(view.state.selection.main.anchor, next.length) },
  });
  return true;
}

export interface FormatActionOptions {
  button: HTMLButtonElement | null;
  getEditor: () => EditorView;
  onFormat: (doc: string) => void;
}

export function setupFormat({ button, getEditor, onFormat }: FormatActionOptions): void {
  if (!button) return;
  button.addEventListener('click', () => {
    const view = getEditor();
    if (formatView(view)) onFormat(view.state.doc.toString());
    view.focus();
  });
}

/** Shift-Alt-F keybinding; the run handler reformats and returns true if handled. */
export function makeFormatKeymap(onFormat: (doc: string) => void): KeyBinding {
  return {
    key: 'Shift-Alt-f',
    run: (view) => {
      const changed = formatView(view);
      if (changed) onFormat(view.state.doc.toString());
      return true;
    },
  };
}
