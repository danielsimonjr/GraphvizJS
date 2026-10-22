import type { EditorView } from 'codemirror';
import { pickSavePath, writeTextFile } from '../platform';

interface SaveDiagramOptions {
  getEditor: () => EditorView;
  button: HTMLButtonElement | null;
  getPath: () => string | null;
  onPathChange: (path: string | null) => void;
  onSave?: (doc: string, path: string) => void;
}

/**
 * Save the document to its file path when the save button is clicked.
 * A document with no file path asks for one, and a cancelled dialog stops the save.
 *
 * @param options - The save button, the getEditor and getPath functions, and the callbacks.
 * @returns Nothing.
 */
export function setupSaveDiagramAction(options: SaveDiagramOptions): void {
  const { getEditor, button, getPath, onPathChange, onSave } = options;
  if (!button) return;

  button.addEventListener('click', async () => {
    const documentContent = getEditor().state.doc.toString();
    let targetPath = getPath();
    try {
      if (!targetPath) {
        targetPath = await pickSavePath({
          defaultPath: 'diagram.dot',
          filters: [
            { name: 'DOT Diagram', extensions: ['dot', 'gv'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        if (!targetPath) return;
      }
      await writeTextFile(targetPath, documentContent);
      onPathChange(targetPath);
      onSave?.(documentContent, targetPath);
    } catch (error) {
      console.error('Failed to save diagram', error);
    }
  });
}
