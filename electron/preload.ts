import { contextBridge, ipcRenderer } from 'electron';
import type { GraphvizApi, DiagramFilter, ConfirmOptions } from '../src/platform/contract';

const api: GraphvizApi = {
  openTextFile: (filters: DiagramFilter[]) => ipcRenderer.invoke('dialog:openText', filters),
  pickSavePath: (opts) => ipcRenderer.invoke('dialog:save', opts),
  writeTextFile: (path, content) => ipcRenderer.invoke('fs:writeText', path, content),
  writeBinaryFile: (path, bytes) => ipcRenderer.invoke('fs:writeBinary', path, bytes),
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store:delete', key),
  confirm: (message, opts?: ConfirmOptions) => ipcRenderer.invoke('dialog:confirm', message, opts),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  appInfo: () => ipcRenderer.invoke('app:info'),
};

contextBridge.exposeInMainWorld('graphviz', api);
