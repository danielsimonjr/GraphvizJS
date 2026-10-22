import { openTextFile } from '../platform';

interface OpenDiagramOptions {
  button: HTMLButtonElement | null;
  onOpen: (content: string, path: string) => void;
}

/**
 * Open a DOT file when the open button is clicked.
 * The callback runs only after the user chooses a file.
 *
 * @param options - The open button, and the callback that gets the file content and path.
 * @returns Nothing.
 */
export function setupOpenDiagramAction(options: OpenDiagramOptions): void {
  const { button, onOpen } = options;
  if (!button) return;

  button.addEventListener('click', async () => {
    try {
      const opened = await openTextFile([
        { name: 'DOT Diagram', extensions: ['dot', 'gv'] },
        { name: 'All Files', extensions: ['*'] },
      ]);
      if (!opened) return;
      onOpen(opened.content, opened.path);
    } catch (error) {
      console.error('Failed to open diagram', error);
    }
  });
}
