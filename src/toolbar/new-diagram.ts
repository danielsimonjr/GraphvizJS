interface NewDiagramOptions {
  button: HTMLButtonElement | null;
  onNew: () => void;
}

export function setupNewDiagramAction(options: NewDiagramOptions): void {
  const { button, onNew } = options;
  if (!button) return;

  button.addEventListener('click', () => {
    onNew();
  });
}
