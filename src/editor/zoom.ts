import { Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;
const ZOOM_DEFAULT = 1;
const BASE_FONT_SIZE = 16;

/**
 * The zoom actions and the current level for one editor.
 */
export interface EditorZoomController {
  zoomIn: () => boolean;
  zoomOut: () => boolean;
  reset: () => boolean;
  getLevel: () => number;
}

/**
 * Create the font-size extension for an editor, with a compartment that can change its size.
 * The extension starts at level 1.
 * @returns The extension to add to an editor, and the compartment that holds it.
 */
export function createEditorZoomExtension(): {
  extension: ReturnType<Compartment['of']>;
  compartment: Compartment;
} {
  const compartment = new Compartment();
  const extension = compartment.of(createFontSizeTheme(ZOOM_DEFAULT));
  return { extension, compartment };
}

/**
 * Create a controller that changes the font size of one editor in steps.
 * Each step changes the level by 0.1, within the limits of 0.5 and 3.
 *
 * @param view - The editor to zoom.
 * @param compartment - The compartment from createEditorZoomExtension that holds the font size.
 * @param onZoomChange - The optional callback that runs after each level change or reset.
 *   The callback does not run for initialLevel.
 * @param initialLevel - The starting level, where 1 is 100 percent. The default is 1.
 *   The value is not clamped to the limits.
 * @returns The controller that zooms the editor.
 */
export function createEditorZoomController(
  view: EditorView,
  compartment: Compartment,
  onZoomChange?: (level: number) => void,
  initialLevel?: number
): EditorZoomController {
  let zoomLevel = initialLevel ?? ZOOM_DEFAULT;

  // Apply initial zoom if different from default
  if (initialLevel && initialLevel !== ZOOM_DEFAULT) {
    view.dispatch({
      effects: compartment.reconfigure(createFontSizeTheme(zoomLevel)),
    });
  }

  function applyZoom(): void {
    view.dispatch({
      effects: compartment.reconfigure(createFontSizeTheme(zoomLevel)),
    });
    onZoomChange?.(zoomLevel);
  }

  function zoomIn(): boolean {
    if (zoomLevel < ZOOM_MAX) {
      zoomLevel = Math.min(ZOOM_MAX, Math.round((zoomLevel + ZOOM_STEP) * 10) / 10);
      applyZoom();
    }
    return true;
  }

  function zoomOut(): boolean {
    if (zoomLevel > ZOOM_MIN) {
      zoomLevel = Math.max(ZOOM_MIN, Math.round((zoomLevel - ZOOM_STEP) * 10) / 10);
      applyZoom();
    }
    return true;
  }

  function reset(): boolean {
    zoomLevel = ZOOM_DEFAULT;
    applyZoom();
    return true;
  }

  function getLevel(): number {
    return zoomLevel;
  }

  return {
    zoomIn,
    zoomOut,
    reset,
    getLevel,
  };
}

/**
 * Create a keymap that binds Mod-= and Mod-+ to zoom in, Mod-- to zoom out,
 * and Mod-0 to reset. Mod is Cmd on macOS and Ctrl on other systems.
 *
 * @param controller - The zoom controller that the keys call.
 * @returns A keymap extension for the zoom keys.
 */
export function createEditorZoomKeymap(controller: EditorZoomController) {
  return keymap.of([
    {
      key: 'Mod-=',
      run: () => controller.zoomIn(),
    },
    {
      key: 'Mod-+',
      run: () => controller.zoomIn(),
    },
    {
      key: 'Mod--',
      run: () => controller.zoomOut(),
    },
    {
      key: 'Mod-0',
      run: () => controller.reset(),
    },
  ]);
}

function createFontSizeTheme(zoomLevel: number) {
  const fontSize = Math.round(BASE_FONT_SIZE * zoomLevel);
  return EditorView.theme({
    '.cm-scroller': {
      fontSize: `${fontSize}px`,
    },
  });
}
