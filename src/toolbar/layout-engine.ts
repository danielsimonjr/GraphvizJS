/**
 * Layout Engine Selector
 *
 * Manages the Graphviz layout engine dropdown in the toolbar.
 *
 * Module State:
 * - cachedSelect: Cached reference to the select element for performance.
 *   Re-queries DOM if element is detached. Use resetLayoutEngineCache() in tests
 *   to clear this state between test runs.
 */

import type { LayoutEngine } from '../preview/graphviz';

const VALID_ENGINES: ReadonlySet<string> = new Set<LayoutEngine>([
  'dot',
  'neato',
  'fdp',
  'sfdp',
  'circo',
  'twopi',
  'osage',
  'patchwork',
]);

const DEFAULT_ENGINE: LayoutEngine = 'dot';

function isLayoutEngine(value: string): value is LayoutEngine {
  return VALID_ENGINES.has(value);
}

/** Cached reference to the select element. Re-queries if detached from DOM. */
let cachedSelect: HTMLSelectElement | null = null;

function getSelectElement(): HTMLSelectElement | null {
  if (!cachedSelect || !cachedSelect.isConnected) {
    cachedSelect = document.querySelector<HTMLSelectElement>('#layout-engine');
  }
  return cachedSelect;
}

/**
 * Set up the layout engine selector
 * @param onEngineChange - Callback when engine changes
 */
export function setupLayoutEngine(onEngineChange: (engine: LayoutEngine) => void): void {
  const select = getSelectElement();
  if (!select) return;

  select.addEventListener('change', () => {
    const value = select.value;
    onEngineChange(isLayoutEngine(value) ? value : DEFAULT_ENGINE);
  });
}

/**
 * Get the currently selected layout engine
 * @returns The selected layout engine, defaults to 'dot'
 */
export function getCurrentEngine(): LayoutEngine {
  const select = getSelectElement();
  const value = select?.value;
  return value && isLayoutEngine(value) ? value : DEFAULT_ENGINE;
}

/**
 * Reset the cached select element reference.
 * Primarily used for testing to ensure clean state between tests.
 */
export function resetLayoutEngineCache(): void {
  cachedSelect = null;
}
