import { Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;
const ZOOM_DEFAULT = 1;
const BASE_FONT_SIZE = 16;

/**
 * The zoom actions and the current level, shared by every editor that is attached.
 */
export interface EditorZoomController {
  zoomIn: () => boolean;
  zoomOut: () => boolean;
  reset: () => boolean;
  getLevel: () => number;
  /** Apply the current level to an editor, and apply each later change to it. */
  attach: (view: EditorView) => void;
  /** Stop applying level changes to an editor. Call this before the editor is destroyed. */
  detach: (view: EditorView) => void;
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
 * Create one controller that holds the zoom level for every editor.
 * Each step changes the level by 0.1, within the limits of 0.5 and 3.
 * An editor follows the level from the moment it is attached.
 *
 * @param compartment - The compartment from createEditorZoomExtension that holds the font size.
 * @param onZoomChange - The optional callback that runs once after each level change or reset,
 *   however many editors are attached. The callback does not run for initialLevel or for attach.
 * @param initialLevel - The starting level, where 1 is 100 percent. The default is 1.
 *   A value outside the limits moves to the nearest limit.
 *   A value that is not a finite number gives the default.
 * @returns The controller that zooms all attached editors.
 */
export function createEditorZoomController(
  compartment: Compartment,
  onZoomChange?: (level: number) => void,
  initialLevel?: number
): EditorZoomController {
  const requestedLevel = initialLevel ?? ZOOM_DEFAULT;
  let zoomLevel = Number.isFinite(requestedLevel)
    ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, requestedLevel))
    : ZOOM_DEFAULT;
  const views = new Set<EditorView>();

  function applyTo(view: EditorView): void {
    view.dispatch({
      effects: compartment.reconfigure(createFontSizeTheme(zoomLevel)),
    });
  }

  function applyZoom(): void {
    for (const view of views) {
      applyTo(view);
    }
    onZoomChange?.(zoomLevel);
  }

  function attach(view: EditorView): void {
    views.add(view);
    applyTo(view);
  }

  function detach(view: EditorView): void {
    views.delete(view);
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
    attach,
    detach,
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
