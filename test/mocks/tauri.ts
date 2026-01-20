import { vi } from 'vitest';

// Mock dialog API
export const mockDialog = {
  open: vi.fn().mockResolvedValue(null),
  save: vi.fn().mockResolvedValue(null),
  message: vi.fn().mockResolvedValue(undefined),
  ask: vi.fn().mockResolvedValue(true),
  confirm: vi.fn().mockResolvedValue(true),
};

// Configure open dialog to return a file path
export function configureOpenDialog(path: string | string[] | null): void {
  mockDialog.open.mockResolvedValue(path);
}

// Configure save dialog to return a file path
export function configureSaveDialog(path: string | null): void {
  mockDialog.save.mockResolvedValue(path);
}

// Mock filesystem API
export const mockFs = {
  readTextFile: vi.fn().mockResolvedValue(''),
  writeTextFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(new Uint8Array()),
  writeFile: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(true),
  readDir: vi.fn().mockResolvedValue([]),
  mkdir: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
};

// Configure readTextFile to return specific content
export function configureReadTextFile(content: string): void {
  mockFs.readTextFile.mockResolvedValue(content);
}

// Configure readDir to return specific entries
export function configureReadDir(
  entries: Array<{ name: string; isDirectory: boolean; isFile: boolean }>
): void {
  mockFs.readDir.mockResolvedValue(entries);
}

// Mock store API
export const mockStore = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
  values: vi.fn().mockResolvedValue([]),
  entries: vi.fn().mockResolvedValue([]),
  length: vi.fn().mockResolvedValue(0),
  save: vi.fn().mockResolvedValue(undefined),
  load: vi.fn().mockResolvedValue(undefined),
};

export const mockStoreLoad = vi.fn().mockResolvedValue(mockStore);

// Configure store.get to return specific value
export function configureStoreGet(value: unknown): void {
  mockStore.get.mockResolvedValue(value);
}

// Mock window API
export const mockWindow = {
  getCurrentWindow: vi.fn().mockReturnValue({
    setTitle: vi.fn().mockResolvedValue(undefined),
    innerPosition: vi.fn().mockResolvedValue({ x: 100, y: 100 }),
    innerSize: vi.fn().mockResolvedValue({ width: 1200, height: 800 }),
    outerPosition: vi.fn().mockResolvedValue({ x: 100, y: 100 }),
    outerSize: vi.fn().mockResolvedValue({ width: 1200, height: 800 }),
    isMaximized: vi.fn().mockResolvedValue(false),
    isMinimized: vi.fn().mockResolvedValue(false),
    isFullscreen: vi.fn().mockResolvedValue(false),
    setPosition: vi.fn().mockResolvedValue(undefined),
    setSize: vi.fn().mockResolvedValue(undefined),
    maximize: vi.fn().mockResolvedValue(undefined),
    unmaximize: vi.fn().mockResolvedValue(undefined),
    minimize: vi.fn().mockResolvedValue(undefined),
    unminimize: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    onCloseRequested: vi.fn().mockResolvedValue(() => undefined),
    onResized: vi.fn().mockResolvedValue(() => undefined),
    onMoved: vi.fn().mockResolvedValue(() => undefined),
  }),
};

// Reset all mocks
export function resetAllMocks(): void {
  mockDialog.open.mockClear().mockResolvedValue(null);
  mockDialog.save.mockClear().mockResolvedValue(null);
  mockDialog.message.mockClear().mockResolvedValue(undefined);
  mockDialog.ask.mockClear().mockResolvedValue(true);
  mockDialog.confirm.mockClear().mockResolvedValue(true);
  mockFs.readTextFile.mockClear().mockResolvedValue('');
  mockFs.writeTextFile.mockClear().mockResolvedValue(undefined);
  mockFs.readFile.mockClear().mockResolvedValue(new Uint8Array());
  mockFs.writeFile.mockClear().mockResolvedValue(undefined);
  mockStore.get.mockClear().mockResolvedValue(null);
  mockStore.set.mockClear().mockResolvedValue(undefined);
  mockStore.save.mockClear().mockResolvedValue(undefined);
}

// Mock Tauri modules
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: mockDialog.open,
  save: mockDialog.save,
  message: mockDialog.message,
  ask: mockDialog.ask,
  confirm: mockDialog.confirm,
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: mockFs.readTextFile,
  writeTextFile: mockFs.writeTextFile,
  readFile: mockFs.readFile,
  writeFile: mockFs.writeFile,
  exists: mockFs.exists,
  readDir: mockFs.readDir,
  mkdir: mockFs.mkdir,
  remove: mockFs.remove,
  rename: mockFs.rename,
  copyFile: mockFs.copyFile,
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: mockStoreLoad,
  Store: {
    load: mockStoreLoad,
  },
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: mockWindow.getCurrentWindow,
}));
