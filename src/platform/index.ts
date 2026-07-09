import type {
  DiagramDiagnostics,
  DotVocabulary,
  ExportFormat,
  GraphStats,
  LayoutEngine,
  PdfExportOptions,
} from '../../core/types';
import type { ConfirmOptions, DiagramFilter, OpenedFile } from './contract';

export type { ConfirmOptions, DiagramFilter, OpenedFile } from './contract';

export function openTextFile(filters: DiagramFilter[]): Promise<OpenedFile | null> {
  return window.graphviz.openTextFile(filters);
}

export function pickSavePath(opts: {
  defaultPath: string;
  filters: DiagramFilter[];
}): Promise<string | null> {
  return window.graphviz.pickSavePath(opts);
}

export function readTextFile(path: string): Promise<string | null> {
  return window.graphviz.readTextFile(path);
}

export function writeTextFile(path: string, content: string): Promise<void> {
  return window.graphviz.writeTextFile(path, content);
}

export function writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
  return window.graphviz.writeBinaryFile(path, bytes);
}

export const store = {
  get: <T>(key: string): Promise<T | undefined> => window.graphviz.storeGet<T>(key),
  set: (key: string, value: unknown): Promise<void> => window.graphviz.storeSet(key, value),
  delete: (key: string): Promise<void> => window.graphviz.storeDelete(key),
};

export type PlatformStore = typeof store;

export function confirm(message: string, opts?: ConfirmOptions): Promise<boolean> {
  return window.graphviz.confirm(message, opts);
}

export function openExternal(url: string): Promise<void> {
  return window.graphviz.openExternal(url);
}

export function appInfo(): Promise<{ name: string; version: string }> {
  return window.graphviz.appInfo();
}

export function setWatchedPaths(paths: string[]): Promise<void> {
  return window.graphviz.setWatchedPaths(paths);
}

export function onFileChanged(cb: (path: string) => void): () => void {
  return window.graphviz.onFileChanged(cb);
}

export function onMenuAction(cb: (action: string, payload?: string) => void): () => void {
  return window.graphviz.onMenuAction(cb);
}

export function setMenuRecent(paths: string[]): Promise<void> {
  return window.graphviz.setMenuRecent(paths);
}

export function setMenuTheme(scheme: string): Promise<void> {
  return window.graphviz.setMenuTheme(scheme);
}

export function renderSvg(dot: string, engine: LayoutEngine): Promise<string> {
  return window.graphviz.renderSvg(dot, engine);
}

export function validateDiagram(dot: string, engine: LayoutEngine): Promise<DiagramDiagnostics> {
  return window.graphviz.validateDiagram(dot, engine);
}

export function formatDot(source: string): Promise<string> {
  return window.graphviz.formatDot(source);
}

export function dotVocabulary(): Promise<DotVocabulary> {
  return window.graphviz.dotVocabulary();
}

export function graphStats(source: string): Promise<GraphStats> {
  return window.graphviz.graphStats(source);
}

export function exportRender(
  dot: string,
  engine: LayoutEngine,
  format: ExportFormat,
  options?: PdfExportOptions
): Promise<Uint8Array> {
  return window.graphviz.exportRender(dot, engine, format, options);
}
