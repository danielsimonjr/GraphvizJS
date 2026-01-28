import { open as showOpenDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';

interface OpenDiagramOptions {
  button: HTMLButtonElement | null;
  onOpen: (content: string, path: string) => void;
}

export function setupOpenDiagramAction(options: OpenDiagramOptions): void {
  const { button, onOpen } = options;
  if (!button) return;

  button.addEventListener('click', async () => {
    try {
      const selected = await showOpenDialog({
        filters: [
          {
            name: 'DOT Diagram',
            extensions: ['dot', 'gv'],
          },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (!selected) return;

      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;

      const fileContents = await readTextFile(path);
      onOpen(fileContents, path);
    } catch (error) {
      console.error('Failed to open diagram', error);
    }
  });
}
