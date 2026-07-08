import type { KeyBinding } from '@codemirror/view';
import type { EditorView } from 'codemirror';
import { formatDot } from '../platform';

/** Reformat the given editor's document in a single transaction. Resolves true if it changed. */
export async function formatView(view: EditorView): Promise<boolean> {
  const current = view.state.doc.toString();
  const next = await formatDot(current);
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
  button.addEventListener('click', async () => {
    const view = getEditor();
    if (await formatView(view)) onFormat(view.state.doc.toString());
    view.focus();
  });
}

/**
 * Shift-Alt-F keybinding. Formatting now runs over IPC (async), but a keymap
 * `run` must report handled synchronously — so fire the format and return true;
 * the reformat and `onFormat` land on a later tick when the promise resolves.
 */
export function makeFormatKeymap(onFormat: (doc: string) => void): KeyBinding {
  return {
    key: 'Shift-Alt-f',
    run: (view) => {
      void formatView(view).then((changed) => {
        if (changed) onFormat(view.state.doc.toString());
      });
      return true;
    },
  };
}
