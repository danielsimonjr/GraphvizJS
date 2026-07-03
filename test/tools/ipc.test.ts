import { describe, expect, it } from 'vitest';
import {
  analyzeIpc,
  analyzeIpcFromRoot,
  extractContractMethods,
  extractMainHandlers,
  extractPreloadChannels,
} from '../../tools/dependency-graph/ipc';

const CONTRACT = `
export interface GraphvizApi {
  openTextFile(filters: DiagramFilter[]): Promise<OpenedFile | null>;
  storeGet<T>(key: string): Promise<T | undefined>;
  appInfo(): Promise<{ name: string; version: string }>;
}
`;

const PRELOAD = `
const api: GraphvizApi = {
  openTextFile: (filters) => ipcRenderer.invoke('dialog:openText', filters),
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  appInfo: () => ipcRenderer.invoke('app:info'),
};
`;

// dialog:save is registered as a MULTILINE ipcMain.handle( call (the real trap).
const MAIN = `
  ipcMain.handle('dialog:openText', async () => {});
  ipcMain.handle(
    'store:get',
    (_e, key) => store.get(key)
  );
  ipcMain.handle('app:info', () => ({}));
`;

describe('extractContractMethods', () => {
  it('extracts methods including a generic method', () => {
    expect(extractContractMethods(CONTRACT)).toEqual(['openTextFile', 'storeGet', 'appInfo']);
  });
});

describe('extractPreloadChannels', () => {
  it('maps each method to its invoke channel', () => {
    expect(extractPreloadChannels(PRELOAD)).toEqual([
      { method: 'openTextFile', channel: 'dialog:openText' },
      { method: 'storeGet', channel: 'store:get' },
      { method: 'appInfo', channel: 'app:info' },
    ]);
  });
});

describe('extractMainHandlers', () => {
  it('extracts channels including a multiline ipcMain.handle(', () => {
    expect(extractMainHandlers(MAIN)).toEqual(['dialog:openText', 'store:get', 'app:info']);
  });
});

describe('analyzeIpc', () => {
  it('classifies fully-wired vs missing-handler vs orphan', () => {
    // preload exposes an extra channel with no handler; main has an orphan handler.
    const preload = `${PRELOAD.replace('};', "  writeTextFile: (p, c) => ipcRenderer.invoke('fs:writeText', p, c),\n};")}`;
    const main = `${MAIN}  ipcMain.handle('shell:openExternal', () => {});\n`;
    const r = analyzeIpc(
      `${CONTRACT.replace('appInfo', 'writeTextFile(path: string, content: string): Promise<void>;\n  appInfo')}`,
      preload,
      main
    );
    const chans = (list: { channel: string }[]) => list.map((c) => c.channel).sort();
    expect(chans(r.missingHandlers)).toContain('fs:writeText'); // preload, no handler
    expect(chans(r.orphanHandlers)).toContain('shell:openExternal'); // handler, no preload
    expect(chans(r.fullyWired)).toEqual(['app:info', 'dialog:openText', 'store:get']);
  });
});

describe('analyzeIpcFromRoot (real repo)', () => {
  it('reports all 10 GraphvizApi channels as fully wired, none missing/orphan', () => {
    const r = analyzeIpcFromRoot(process.cwd());
    expect(r.fullyWired.map((c) => c.channel).sort()).toEqual(
      [
        'app:info',
        'dialog:confirm',
        'dialog:openText',
        'dialog:save',
        'fs:writeBinary',
        'fs:writeText',
        'shell:openExternal',
        'store:delete',
        'store:get',
        'store:set',
      ].sort()
    );
    expect(r.missingHandlers).toEqual([]);
    expect(r.orphanHandlers).toEqual([]);
  });
});
