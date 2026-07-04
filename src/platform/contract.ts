export interface DiagramFilter {
  name: string;
  extensions: string[];
}

export interface OpenedFile {
  path: string;
  content: string;
}

export interface ConfirmOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
}

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
}
