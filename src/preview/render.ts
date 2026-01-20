import { debounce } from '../utils/debounce';
import type { LayoutEngine } from './graphviz';
import { renderDotToSvg } from './graphviz';

export type PreviewScheduler = (doc: string) => void;

export interface PreviewStatusCallbacks {
  onRenderStart?: () => void;
  onRenderSuccess?: () => void;
  onRenderEmpty?: () => void;
  onRenderError?: (details: string) => void;
}

export interface PreviewOptions {
  callbacks?: PreviewStatusCallbacks;
  getEngine?: () => LayoutEngine;
}

export function createPreview(
  previewEl: HTMLElement,
  delay: number,
  callbacksOrOptions: PreviewStatusCallbacks | PreviewOptions = {}
): PreviewScheduler {
  // Support both old and new API signatures
  const isNewApi = 'callbacks' in callbacksOrOptions || 'getEngine' in callbacksOrOptions;
  const options: PreviewOptions = isNewApi
    ? (callbacksOrOptions as PreviewOptions)
    : { callbacks: callbacksOrOptions as PreviewStatusCallbacks };

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
      const svg = await renderDotToSvg(trimmed, engine);
      if (token !== latestToken) return;
      previewEl.classList.remove('preview-empty', 'preview-error');
      previewEl.innerHTML = svg;
      callbacks.onRenderSuccess?.();
    } catch (error) {
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
