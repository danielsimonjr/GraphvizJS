const ZOOM_MIN = 0.25;
const ZOOM_MAX = 10;
const ZOOM_STEP = 0.25;
const ZOOM_DEFAULT = 1;

/**
 * The zoom actions and the current level for the preview SVG.
 */
export interface ZoomController {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  getLevel: () => number;
  applyZoom: () => void;
}

/**
 * Create a controller that scales the first SVG in the preview element with a CSS transform.
 * Each step changes the level by 0.25, and the level stays between 0.25 and 10.
 *
 * @param previewEl - The element that contains the rendered SVG.
 * @param onZoomChange - The optional callback that receives the new level.
 *   The callback runs each time the controller applies the zoom.
 * @returns The zoom controller for the preview.
 */
export function createZoomController(
  previewEl: HTMLElement,
  onZoomChange?: (level: number) => void
): ZoomController {
  let zoomLevel = ZOOM_DEFAULT;

  function applyZoom(): void {
    const svg = previewEl.querySelector('svg');
    if (svg) {
      svg.style.transform = `scale(${zoomLevel})`;
      svg.style.transformOrigin = 'center center';
    }
    onZoomChange?.(zoomLevel);
  }

  function zoomIn(): void {
    if (zoomLevel < ZOOM_MAX) {
      zoomLevel = Math.min(ZOOM_MAX, zoomLevel + ZOOM_STEP);
      applyZoom();
    }
  }

  function zoomOut(): void {
    if (zoomLevel > ZOOM_MIN) {
      zoomLevel = Math.max(ZOOM_MIN, zoomLevel - ZOOM_STEP);
      applyZoom();
    }
  }

  function reset(): void {
    zoomLevel = ZOOM_DEFAULT;
    applyZoom();
  }

  function getLevel(): number {
    return zoomLevel;
  }

  return {
    zoomIn,
    zoomOut,
    reset,
    getLevel,
    applyZoom,
  };
}

/**
 * Connect the zoom buttons to the controller.
 * The function sets the level display once, during setup.
 *
 * @param controller - The zoom controller that the buttons call.
 * @param zoomInBtn - The button that zooms in, or null if there is no button.
 * @param zoomOutBtn - The button that zooms out, or null if there is no button.
 * @param resetBtn - The button that resets the zoom, or null if there is no button.
 * @param levelDisplay - The optional element that shows the level as a percentage.
 * @returns No value.
 */
export function setupZoomControls(
  controller: ZoomController,
  zoomInBtn: HTMLElement | null,
  zoomOutBtn: HTMLElement | null,
  resetBtn: HTMLElement | null,
  levelDisplay?: HTMLElement | null
): void {
  zoomInBtn?.addEventListener('click', () => {
    controller.zoomIn();
  });

  zoomOutBtn?.addEventListener('click', () => {
    controller.zoomOut();
  });

  resetBtn?.addEventListener('click', () => {
    controller.reset();
  });

  if (levelDisplay) {
    updateLevelDisplay(levelDisplay, controller.getLevel());
  }
}

/**
 * Zoom the preview when the wheel turns while the Ctrl key is held.
 * Each wheel event with a vertical delta makes one step: up zooms in, down zooms out.
 * A trackpad pinch also sends wheel events with Ctrl, so pinch zooms too.
 *
 * @param previewEl - The element that receives the wheel events.
 * @param controller - The zoom controller that each wheel step calls.
 * @returns No value.
 */
export function setupWheelZoom(previewEl: HTMLElement, controller: ZoomController): void {
  previewEl.addEventListener(
    'wheel',
    (event) => {
      // Zoom with Ctrl+Scroll (also handles trackpad pinch-to-zoom)
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.deltaY < 0) {
        controller.zoomIn();
      } else if (event.deltaY > 0) {
        controller.zoomOut();
      }
    },
    { passive: false, capture: true }
  );
}

/**
 * Show a zoom level as a whole percentage in an element.
 * The function rounds the level to the nearest whole percent.
 *
 * @param element - The element whose text shows the level.
 * @param level - The zoom level, where 1 is 100 percent.
 * @returns No value.
 */
export function updateLevelDisplay(element: HTMLElement, level: number): void {
  element.textContent = `${Math.round(level * 100)}%`;
}
