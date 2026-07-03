import { describe, expect, it } from 'vitest';
import { createSearch } from '../../src/editor/search';

describe('createSearch', () => {
  it('returns a CodeMirror extension', () => {
    const extension = createSearch();
    expect(extension).toBeTruthy();
  });
});
