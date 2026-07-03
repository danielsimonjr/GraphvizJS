import { search } from '@codemirror/search';
import type { Extension } from '@codemirror/state';

/** Search with the panel docked at the top of the editor. */
export function createSearch(): Extension {
  return search({ top: true });
}
