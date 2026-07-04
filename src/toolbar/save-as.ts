import type { EditorView } from 'codemirror';
import { pickSavePath, writeTextFile } from '../platform';

export interface SaveAsOptions {
  getEditor: () => EditorView;
  getPath: () => string | null;
  onPathChange: (path: string | null) => void;
  onSave: (doc: string, path: string) => void;
}

function defaultName(path: string | null): string {
  if (!path) return 'diagram.dot';
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

/** Save the active document to a newly chosen path (always prompts). */
export async function performSaveAs(opts: SaveAsOptions): Promise<void> {
  const documentContent = opts.getEditor().state.doc.toString();
  try {
    const targetPath = await pickSavePath({
      defaultPath: defaultName(opts.getPath()),
      filters: [
        { name: 'DOT Diagram', extensions: ['dot', 'gv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!targetPath) return;
    await writeTextFile(targetPath, documentContent);
    opts.onPathChange(targetPath);
    opts.onSave(documentContent, targetPath);
  } catch (error) {
    console.error('Failed to save diagram as', error);
  }
}

export function setupSaveAsAction(
  opts: SaveAsOptions & { button: HTMLButtonElement | null }
): void {
  const { button, ...rest } = opts;
  if (!button) return;
  button.addEventListener('click', () => {
    void performSaveAs(rest);
  });
}
