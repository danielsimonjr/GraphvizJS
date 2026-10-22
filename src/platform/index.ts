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

/**
 * Show a native open dialog and read the file that the user selects.
 *
 * The call rejects when the read of the selected file fails.
 *
 * @param filters - The file type filters that the dialog offers.
 * @returns The selected file with its path and content, or null when the user cancels.
 */
export function openTextFile(filters: DiagramFilter[]): Promise<OpenedFile | null> {
  return window.graphviz.openTextFile(filters);
}

/**
 * Show a native save dialog and return the path that the user selects.
 *
 * The call writes no file.
 *
 * @param opts - The suggested file name or path, and the file type filters.
 * @returns The selected file path, or null when the user cancels.
 */
export function pickSavePath(opts: {
  defaultPath: string;
  filters: DiagramFilter[];
}): Promise<string | null> {
  return window.graphviz.pickSavePath(opts);
}

/**
 * Read the content of a text file from disk.
 *
 * Every read error returns null, so the call does not reject.
 *
 * @param path - The path of the file to read.
 * @returns The file content, or null when the read fails.
 */
export function readTextFile(path: string): Promise<string | null> {
  return window.graphviz.readTextFile(path);
}

/**
 * Write text to a file, replacing any earlier content.
 *
 * @param path - The path of the file to write.
 * @param content - The content to write, saved as UTF-8.
 * @returns Nothing. The call resolves after the write, and rejects when the write fails.
 */
export function writeTextFile(path: string, content: string): Promise<void> {
  return window.graphviz.writeTextFile(path, content);
}

/**
 * Write raw bytes to a file, replacing any earlier content.
 *
 * @param path - The path of the file to write.
 * @param bytes - The content to write, such as PNG or PDF data.
 * @returns Nothing. The call resolves after the write, and rejects when the write fails.
 */
export function writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
  return window.graphviz.writeBinaryFile(path, bytes);
}

/** The persistent key-value store of the application. Each method calls the main process. */
export const store = {
  get: <T>(key: string): Promise<T | undefined> => window.graphviz.storeGet<T>(key),
  set: (key: string, value: unknown): Promise<void> => window.graphviz.storeSet(key, value),
  delete: (key: string): Promise<void> => window.graphviz.storeDelete(key),
};

/** The type of the store, which reads, writes and deletes persisted key-value data. */
export type PlatformStore = typeof store;

/**
 * Show a native dialog that asks the user to confirm an action.
 *
 * @param message - The question that the dialog shows.
 * @param opts - The optional title and kind of the dialog.
 * @returns True when the user selects OK. False in all other cases, including cancel.
 */
export function confirm(message: string, opts?: ConfirmOptions): Promise<boolean> {
  return window.graphviz.confirm(message, opts);
}

/**
 * Open a web address in the default browser.
 *
 * The main process ignores, without an error, any address that does not start with
 * http:// or https://.
 *
 * @param url - The web address to open.
 * @returns Nothing. For an ignored address the promise resolves at once. For any other
 *   address the promise settles when the main process finishes the open request.
 */
export function openExternal(url: string): Promise<void> {
  return window.graphviz.openExternal(url);
}

/**
 * Read the application name and version from the main process.
 *
 * @returns The application name and version.
 */
export function appInfo(): Promise<{ name: string; version: string }> {
  return window.graphviz.appInfo();
}

/**
 * Replace the set of files that the main process watches for changes.
 *
 * The main process skips a directory when the watch fails.
 * The next call tries that directory again.
 *
 * @param paths - The file paths to watch. Each call replaces the earlier list.
 * @returns Nothing. The call resolves when the main process updates the watch list.
 */
export function setWatchedPaths(paths: string[]): Promise<void> {
  return window.graphviz.setWatchedPaths(paths);
}

/**
 * Subscribe the callback to each file-change message from the main process.
 *
 * The main process sends the message only after a short delay with no further change to the file.
 *
 * @param cb - The callback that receives the full path of the changed file.
 * @returns A function that removes this listener.
 */
export function onFileChanged(cb: (path: string) => void): () => void {
  return window.graphviz.onFileChanged(cb);
}

/**
 * Subscribe the callback to each menu action from the main process.
 *
 * @param cb - The callback that receives the action id and the payload, if any.
 * @returns A function that removes this listener.
 */
export function onMenuAction(cb: (action: string, payload?: string) => void): () => void {
  return window.graphviz.onMenuAction(cb);
}

/**
 * Replace the entries of the Open Recent submenu and rebuild the application menu.
 *
 * @param paths - The recent file paths, most recent first.
 * @returns Nothing. The call resolves after the main process rebuilds the menu.
 */
export function setMenuRecent(paths: string[]): Promise<void> {
  return window.graphviz.setMenuRecent(paths);
}

/**
 * Set the color scheme that the Theme submenu marks as checked.
 *
 * The main process ignores any value other than system, light or dark.
 *
 * @param scheme - The color scheme to mark as checked: system, light or dark.
 * @returns Nothing. The call resolves when the main process finishes the update.
 */
export function setMenuTheme(scheme: string): Promise<void> {
  return window.graphviz.setMenuTheme(scheme);
}

/**
 * Render DOT source to SVG markup with a Graphviz layout engine.
 *
 * The call rejects when Graphviz cannot produce a diagram, for example on a syntax error.
 *
 * @param dot - The DOT source to render.
 * @param engine - The layout engine name, such as dot or neato.
 * @returns The SVG markup of the rendered diagram.
 */
export function renderSvg(dot: string, engine: LayoutEngine): Promise<string> {
  return window.graphviz.renderSvg(dot, engine);
}

/**
 * Check DOT source for syntax errors and structural findings.
 *
 * The call does not reject on a syntax error. The result holds the syntax error instead.
 * The call returns structural findings even when the syntax is valid.
 *
 * @param dot - The DOT source to check.
 * @param engine - The layout engine that the syntax check uses.
 * @returns The syntax error, or null when the syntax is valid, and the structural findings.
 */
export function validateDiagram(dot: string, engine: LayoutEngine): Promise<DiagramDiagnostics> {
  return window.graphviz.validateDiagram(dot, engine);
}

/**
 * Reformat DOT source and return the formatted text.
 *
 * The formatter returns the source unchanged when braces, brackets, quoted text, HTML labels
 * or comments are unclosed or unmatched.
 *
 * @param source - The DOT source to reformat.
 * @returns The formatted source, indented with two spaces per brace level,
 *   or the source unchanged.
 */
export function formatDot(source: string): Promise<string> {
  return window.graphviz.formatDot(source);
}

/**
 * Read the DOT keywords, attribute names, attribute values and color names.
 *
 * @returns The keywords, attribute names, enum values of each enum-typed attribute, and color names.
 */
export function dotVocabulary(): Promise<DotVocabulary> {
  return window.graphviz.dotVocabulary();
}

/**
 * Compute the structural statistics of DOT source.
 *
 * The main process sets the root and leaf counts only for directed graphs.
 *
 * @param source - The DOT source to measure.
 * @returns The node, edge, subgraph, cluster, isolated and self-loop counts, and the cycle flag.
 */
export function graphStats(source: string): Promise<GraphStats> {
  return window.graphviz.graphStats(source);
}

/**
 * Render DOT source and export the diagram in the given format.
 *
 * The call rejects when the export fails, for example on a syntax error.
 *
 * @param dot - The DOT source to export.
 * @param engine - The layout engine name, such as dot or neato.
 * @param format - The output format: svg, png, pngx2 (PNG at twice the png scale) or pdf.
 * @param options - The PDF page settings, used only for pdf. When omitted, the page
 *   matches the diagram size.
 * @returns The bytes of the exported file.
 */
export function exportRender(
  dot: string,
  engine: LayoutEngine,
  format: ExportFormat,
  options?: PdfExportOptions
): Promise<Uint8Array> {
  return window.graphviz.exportRender(dot, engine, format, options);
}
