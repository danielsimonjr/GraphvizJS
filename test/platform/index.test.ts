import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as platform from '../../src/platform';

const api = {
  openTextFile: vi.fn(),
  pickSavePath: vi.fn(),
  writeTextFile: vi.fn(),
  writeBinaryFile: vi.fn(),
  storeGet: vi.fn(),
  storeSet: vi.fn(),
  storeDelete: vi.fn(),
  confirm: vi.fn(),
  openExternal: vi.fn(),
  appInfo: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { graphviz: typeof api }).graphviz = api;
});

describe('platform', () => {
  it('openTextFile delegates to window.graphviz', async () => {
    api.openTextFile.mockResolvedValue({ path: '/a.dot', content: 'digraph{}' });
    const result = await platform.openTextFile([{ name: 'DOT', extensions: ['dot'] }]);
    expect(api.openTextFile).toHaveBeenCalledWith([{ name: 'DOT', extensions: ['dot'] }]);
    expect(result).toEqual({ path: '/a.dot', content: 'digraph{}' });
  });

  it('store.get/set/delete delegate to the store channels', async () => {
    api.storeGet.mockResolvedValue(42);
    expect(await platform.store.get<number>('editorZoom')).toBe(42);
    await platform.store.set('editorZoom', 3);
    expect(api.storeSet).toHaveBeenCalledWith('editorZoom', 3);
    await platform.store.delete('editorZoom');
    expect(api.storeDelete).toHaveBeenCalledWith('editorZoom');
  });

  it('confirm delegates with options', async () => {
    api.confirm.mockResolvedValue(true);
    expect(await platform.confirm('sure?', { title: 'T', kind: 'warning' })).toBe(true);
    expect(api.confirm).toHaveBeenCalledWith('sure?', { title: 'T', kind: 'warning' });
  });
});
