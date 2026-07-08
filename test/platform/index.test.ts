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
  formatDot: vi.fn(),
  dotVocabulary: vi.fn(),
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

  it('pickSavePath delegates with opts and returns path string', async () => {
    api.pickSavePath.mockResolvedValue('/out/diagram.svg');
    const opts = {
      defaultPath: '/out/diagram.svg',
      filters: [{ name: 'SVG', extensions: ['svg'] }],
    };
    const result = await platform.pickSavePath(opts);
    expect(api.pickSavePath).toHaveBeenCalledWith(opts);
    expect(result).toBe('/out/diagram.svg');
  });

  it('writeTextFile delegates path and content in order', async () => {
    api.writeTextFile.mockResolvedValue(undefined);
    await platform.writeTextFile('/a.dot', 'digraph{}');
    expect(api.writeTextFile).toHaveBeenCalledWith('/a.dot', 'digraph{}');
  });

  it('writeBinaryFile delegates path and Uint8Array bytes in order', async () => {
    api.writeBinaryFile.mockResolvedValue(undefined);
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    await platform.writeBinaryFile('/img.png', bytes);
    expect(api.writeBinaryFile).toHaveBeenCalledWith('/img.png', bytes);
  });

  it('openExternal delegates the url', async () => {
    api.openExternal.mockResolvedValue(undefined);
    await platform.openExternal('https://graphviz.org');
    expect(api.openExternal).toHaveBeenCalledWith('https://graphviz.org');
  });

  it('appInfo delegates and returns name/version passthrough', async () => {
    api.appInfo.mockResolvedValue({ name: 'GraphvizJS', version: '1.2.3' });
    const result = await platform.appInfo();
    expect(api.appInfo).toHaveBeenCalled();
    expect(result).toEqual({ name: 'GraphvizJS', version: '1.2.3' });
  });

  it('formatDot delegates the source and returns formatted DOT', async () => {
    api.formatDot.mockResolvedValue('digraph {\n  a -> b\n}\n');
    const result = await platform.formatDot('digraph{a->b}');
    expect(api.formatDot).toHaveBeenCalledWith('digraph{a->b}');
    expect(result).toBe('digraph {\n  a -> b\n}\n');
  });

  it('dotVocabulary delegates and returns the keyword/attribute lists', async () => {
    api.dotVocabulary.mockResolvedValue({ keywords: ['digraph'], attributes: ['color'] });
    const result = await platform.dotVocabulary();
    expect(api.dotVocabulary).toHaveBeenCalled();
    expect(result).toEqual({ keywords: ['digraph'], attributes: ['color'] });
  });
});
