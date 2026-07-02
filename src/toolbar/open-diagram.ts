import { openTextFile } from '../platform';

interface OpenDiagramOptions {
  button: HTMLButtonElement | null;
  onOpen: (content: string, path: string) => void;
}

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
