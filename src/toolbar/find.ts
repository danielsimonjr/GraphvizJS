import { openSearchPanel } from '@codemirror/search';
import type { EditorView } from 'codemirror';

/**
 * Describes the button and the getEditor function that setupFind uses.
 */
export interface FindActionOptions {
  button: HTMLButtonElement | null;
  getEditor: () => EditorView;
}

/**
 * Open the search panel of the editor when the button is clicked.
 *
 * @param button - The find button. A null button registers no listener.
 * @param getEditor - The function that returns the editor, called on each click.
 * @returns Nothing.
 */
export function setupFind({ button, getEditor }: FindActionOptions): void {
  if (!button) return;
  button.addEventListener('click', () => {
    const view = getEditor();
    openSearchPanel(view);
    view.focus();
  });
}
