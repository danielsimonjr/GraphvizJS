import type { LayoutEngine } from '../preview/graphviz';

/**
 * Set up the layout engine selector
 * @param onEngineChange - Callback when engine changes
 */
export function setupLayoutEngine(onEngineChange: (engine: LayoutEngine) => void): void {
  const select = document.querySelector<HTMLSelectElement>('#layout-engine');
  if (!select) return;

  select.addEventListener('change', () => {
    onEngineChange(select.value as LayoutEngine);
  });
}

/**
 * Get the currently selected layout engine
 * @returns The selected layout engine, defaults to 'dot'
 */
export function getCurrentEngine(): LayoutEngine {
  const select = document.querySelector<HTMLSelectElement>('#layout-engine');
  return (select?.value || 'dot') as LayoutEngine;
}
