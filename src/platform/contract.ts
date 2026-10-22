import type {
  DiagramDiagnostics,
  DotVocabulary,
  ExportFormat,
  GraphStats,
  LayoutEngine,
  PdfExportOptions,
} from '../../core/types';

/**
 * A file type filter for a native open or save dialog.
 *
 * The extensions have no leading dot. The entry * matches all files.
 */
export interface DiagramFilter {
  name: string;
  extensions: string[];
}

/** A text file that the user opened, with its path and its content. */
export interface OpenedFile {
  path: string;
  content: string;
}

/**
 * The options for a native confirm dialog.
 *
 * A missing title defaults to Confirm. A missing kind defaults to a question dialog.
 */
export interface ConfirmOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
}

/**
 * The API that the preload script exposes as window.graphviz.
 *
 * Each method, except onFileChanged and onMenuAction, calls one inter-process
 * communication (IPC) channel in the main process. Those two methods listen to
 * messages from the main process instead.
 */
export interface GraphvizApi {
  openTextFile(filters: DiagramFilter[]): Promise<OpenedFile | null>;
  pickSavePath(opts: { defaultPath: string; filters: DiagramFilter[] }): Promise<string | null>;
  readTextFile(path: string): Promise<string | null>;
  writeTextFile(path: string, content: string): Promise<void>;
  writeBinaryFile(path: string, bytes: Uint8Array): Promise<void>;
  storeGet<T>(key: string): Promise<T | undefined>;
  storeSet(key: string, value: unknown): Promise<void>;
  storeDelete(key: string): Promise<void>;
  confirm(message: string, opts?: ConfirmOptions): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  appInfo(): Promise<{ name: string; version: string }>;
  setWatchedPaths(paths: string[]): Promise<void>;
  onFileChanged(cb: (path: string) => void): () => void;
  onMenuAction(cb: (action: string, payload?: string) => void): () => void;
  setMenuRecent(paths: string[]): Promise<void>;
  setMenuTheme(scheme: string): Promise<void>;
  renderSvg(dot: string, engine: LayoutEngine): Promise<string>;
  validateDiagram(dot: string, engine: LayoutEngine): Promise<DiagramDiagnostics>;
  formatDot(source: string): Promise<string>;
  dotVocabulary(): Promise<DotVocabulary>;
  graphStats(source: string): Promise<GraphStats>;
  exportRender(
    dot: string,
    engine: LayoutEngine,
    format: ExportFormat,
    options?: PdfExportOptions
  ): Promise<Uint8Array>;
}
