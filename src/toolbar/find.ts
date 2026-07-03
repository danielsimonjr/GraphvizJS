import { openSearchPanel } from '@codemirror/search';
import type { EditorView } from 'codemirror';

export interface FindActionOptions {
  button: HTMLButtonElement | null;
  getEditor: () => EditorView;
}

export function setupFind({ button, getEditor }: FindActionOptions): void {
  if (!button) return;
  button.addEventListener('click', () => {
    const view = getEditor();
    openSearchPanel(view);
    view.focus();
  });
}
