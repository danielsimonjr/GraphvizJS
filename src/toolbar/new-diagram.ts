interface NewDiagramOptions {
  button: HTMLButtonElement | null;
  onNew: () => void;
}

/**
 * Call the onNew callback when the new button is clicked.
 *
 * @param options - The new button and the onNew callback. A null button does nothing.
 * @returns Nothing.
 */
export function setupNewDiagramAction(options: NewDiagramOptions): void {
  const { button, onNew } = options;
  if (!button) return;

  button.addEventListener('click', () => {
    onNew();
  });
}
