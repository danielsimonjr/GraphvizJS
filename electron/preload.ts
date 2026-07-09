import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron';
import type { ConfirmOptions, DiagramFilter, GraphvizApi } from '../src/platform/contract';

const api: GraphvizApi = {
  openTextFile: (filters: DiagramFilter[]) => ipcRenderer.invoke('dialog:openText', filters),
  pickSavePath: (opts) => ipcRenderer.invoke('dialog:save', opts),
  readTextFile: (path: string) => ipcRenderer.invoke('fs:readText', path),
  writeTextFile: (path, content) => ipcRenderer.invoke('fs:writeText', path, content),
  writeBinaryFile: (path, bytes) => ipcRenderer.invoke('fs:writeBinary', path, bytes),
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store:delete', key),
  confirm: (message, opts?: ConfirmOptions) => ipcRenderer.invoke('dialog:confirm', message, opts),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  appInfo: () => ipcRenderer.invoke('app:info'),
  setWatchedPaths: (paths) => ipcRenderer.invoke('watch:setPaths', paths),
  onFileChanged: (cb) => {
    const listener = (_e: IpcRendererEvent, p: string) => cb(p);
    ipcRenderer.on('file:changed', listener);
    return () => ipcRenderer.removeListener('file:changed', listener);
  },
  onMenuAction: (cb) => {
    const listener = (_e: IpcRendererEvent, msg: { action: string; payload?: string }) =>
      cb(msg.action, msg.payload);
    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  },
  setMenuRecent: (paths) => ipcRenderer.invoke('menu:setRecent', paths),
  setMenuTheme: (scheme) => ipcRenderer.invoke('menu:setTheme', scheme),
  renderSvg: (dot, engine) => ipcRenderer.invoke('render:svg', dot, engine),
  validateDiagram: (dot, engine) => ipcRenderer.invoke('render:validate', dot, engine),
  formatDot: (source) => ipcRenderer.invoke('dot:format', source),
  dotVocabulary: () => ipcRenderer.invoke('dot:vocabulary'),
  graphStats: (source) => ipcRenderer.invoke('dot:stats', source),
  exportRender: (dot, engine, format, options) =>
    ipcRenderer.invoke('export:render', dot, engine, format, options),
};

contextBridge.exposeInMainWorld('graphviz', api);
