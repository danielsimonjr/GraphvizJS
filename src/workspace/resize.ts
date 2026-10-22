const DEFAULT_EDITOR_RATIO = 0.5;
const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;

/**
 * Set up a draggable divider between the editor and preview panes when all elements exist.
 * The split ratio stays between 0.2 and 0.8, and a double-click resets it to 0.5.
 *
 * @param container - The element that holds both panes. Its width scales each drag.
 * @param editorPane - The editor pane. Its flex value is set to the split ratio.
 * @param previewPane - The preview pane. Its flex value is set to one minus the split ratio.
 * @param divider - The divider element. The CSS class dragging is added during a drag.
 * @returns Nothing.
 */
export function initHorizontalResize(
  container: HTMLElement | null,
  editorPane: HTMLElement | null,
  previewPane: HTMLElement | null,
  divider: HTMLDivElement | null
): void {
  if (!container || !editorPane || !previewPane || !divider) {
    return;
  }

  let isDragging = false;
  let startX = 0;
  let startEditorWidth = 0;
  let containerWidth = 0;

  const setEditorWidth = (ratio: number) => {
    const clamped = Math.min(Math.max(ratio, MIN_RATIO), MAX_RATIO);
    editorPane.style.flex = `${clamped} 1 0`;
    previewPane.style.flex = `${1 - clamped} 1 0`;
  };

  setEditorWidth(DEFAULT_EDITOR_RATIO);

  const onPointerMove = (event: PointerEvent) => {
    if (!isDragging) return;
    const delta = event.clientX - startX;
    const ratio = (startEditorWidth + delta) / containerWidth;
    setEditorWidth(ratio);
  };

  const stopDragging = () => {
    if (!isDragging) return;
    isDragging = false;
    divider.classList.remove('dragging');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDragging);
  };

  divider.addEventListener('pointerdown', (event) => {
    isDragging = true;
    startX = event.clientX;
    containerWidth = container.getBoundingClientRect().width;
    startEditorWidth = editorPane.getBoundingClientRect().width;
    divider.classList.add('dragging');

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
  });

  divider.addEventListener('dblclick', () => {
    setEditorWidth(DEFAULT_EDITOR_RATIO);
  });
}
