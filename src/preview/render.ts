import type { LayoutEngine } from '../../core/types';
import { debounce } from '../utils/debounce';

/**
 * A function that schedules a preview render of DOT source.
 */
export type PreviewScheduler = (doc: string) => void;

/**
 * The callbacks that report each stage of a preview render.
 */
export interface PreviewStatusCallbacks {
  onRenderStart?: () => void;
  onRenderSuccess?: () => void;
  onRenderEmpty?: () => void;
  onRenderError?: (details: string) => void;
}

/**
 * The options for createPreview, where the layout engine defaults to dot.
 */
export interface PreviewOptions {
  callbacks?: PreviewStatusCallbacks;
  getEngine?: () => LayoutEngine;
  render: (dot: string, engine: LayoutEngine) => Promise<string>;
}

/**
 * Create a scheduler that renders DOT source into the preview element once input pauses.
 * Each call runs onRenderStart immediately, before the delay ends.
 * A render that a newer call replaces shows no result and reports no error.
 *
 * @param previewEl - The element that shows the SVG or a message.
 * @param delay - Milliseconds to wait after the last call before rendering.
 * @param options - The render function, plus the optional engine getter and status callbacks.
 * @returns A function that takes DOT source and schedules its render.
 */
export function createPreview(
  previewEl: HTMLElement,
  delay: number,
  options: PreviewOptions
): PreviewScheduler {
  const callbacks = options.callbacks ?? {};
  const getEngine = options.getEngine ?? (() => 'dot' as LayoutEngine);

  let latestToken = 0;
  const debouncedRender = debounce(async (source: string, token: number) => {
    if (token !== latestToken) return;

    const trimmed = source.trim();
    if (!trimmed.length) {
      showPreviewMessage(previewEl, 'Add DOT markup to see the preview.');
      callbacks.onRenderEmpty?.();
      return;
    }

    try {
      const engine = getEngine();
      const svg = await options.render(trimmed, engine);
      if (token !== latestToken) return;
      previewEl.classList.remove('preview-empty', 'preview-error');
      previewEl.innerHTML = svg;
      callbacks.onRenderSuccess?.();
    } catch (error) {
      if (token !== latestToken) return;
      console.error('Graphviz render failed', error);
      const details = error instanceof Error ? error.message : String(error ?? 'Unknown error');
      showPreviewError(previewEl, 'Graphviz could not render this diagram.', details);
      callbacks.onRenderError?.(details);
    }
  }, delay);

  return (source: string) => {
    latestToken += 1;
    const currentToken = latestToken;
    callbacks.onRenderStart?.();
    debouncedRender(source, currentToken);
  };
}

function showPreviewMessage(previewEl: HTMLElement, message: string): void {
  previewEl.classList.add('preview-empty');
  previewEl.classList.remove('preview-error');

  const paragraph = document.createElement('p');
  paragraph.className = 'preview-message';
  paragraph.textContent = message;
  previewEl.replaceChildren(paragraph);
}

function showPreviewError(previewEl: HTMLElement, message: string, details: string): void {
  previewEl.classList.remove('preview-empty');
  previewEl.classList.add('preview-error');

  const container = document.createElement('div');
  const heading = document.createElement('p');
  heading.className = 'preview-message';
  heading.textContent = message;
  const pre = document.createElement('pre');
  pre.textContent = details;

  container.append(heading, pre);
  previewEl.replaceChildren(container);
}
