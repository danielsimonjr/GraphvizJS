import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron';
import Store from 'electron-store';
import { DOT_ATTRIBUTES, DOT_KEYWORDS } from '../core/dot-vocab';
import { exportDiagram } from '../core/export';
import { formatDot } from '../core/format';
import { initGraphviz, renderDotToSvg } from '../core/render';
import type { ExportFormat, LayoutEngine, PdfExportOptions } from '../core/types';
import { validateDiagram } from '../core/validate';
import type { ConfirmOptions, DiagramFilter } from '../src/platform/contract';
import { setMenuRecentFiles, setMenuTheme, setupAppMenu } from './app-menu';
import { setupFileWatcher } from './file-watcher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test seam: isolate persisted state to a temp dir under Playwright so session
// restore can be exercised deterministically. Must run before Store construction.
if (process.env.GVJS_E2E_USERDATA) {
  app.setPath('userData', process.env.GVJS_E2E_USERDATA);
}

const store = new Store<Record<string, unknown>>();

interface WindowState {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

function restoreBounds(): Partial<Electron.BrowserWindowConstructorOptions> {
  const s = store.get('windowState') as WindowState | undefined;
  if (!s) return { width: 1200, height: 800 };
  const area = screen.getPrimaryDisplay().workArea;
  const width = s.width ?? 1200;
  const height = s.height ?? 800;
  // Clamp to a visible display so off-screen bounds don't hide the window.
  const x = s.x != null ? Math.min(Math.max(s.x, area.x), area.x + area.width - width) : undefined;
  const y =
    s.y != null ? Math.min(Math.max(s.y, area.y), area.y + area.height - height) : undefined;
  return { width, height, x, y };
}

let saveTimer: NodeJS.Timeout | undefined;
function persistBounds(win: BrowserWindow): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (win.isDestroyed()) return;
    const b = win.getBounds();
    store.set('windowState', {
      width: b.width,
      height: b.height,
      x: b.x,
      y: b.y,
      maximized: win.isMaximized(),
    } satisfies WindowState);
  }, 400);
}

function createWindow(): void {
  // In dev, set the window/taskbar icon from build/icon.png (packaged builds
  // embed it in the exe via electron-builder, so build/ isn't present there).
  const devIcon = path.join(__dirname, '../build/icon.png');
  const win = new BrowserWindow({
    ...restoreBounds(),
    ...(existsSync(devIcon) ? { icon: devIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if ((store.get('windowState') as WindowState | undefined)?.maximized) win.maximize();

  // Defense-in-depth: deny new-window creation (external links go through
  // shell.openExternal via the IPC bridge) and block any in-page navigation
  // (the SPA never navigates to another URL).
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  win.on('resize', () => persistBounds(win));
  win.on('move', () => persistBounds(win));

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
}

const kindToType: Record<NonNullable<ConfirmOptions['kind']>, 'info' | 'warning' | 'error'> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
};

function registerIpc(): void {
  // Test seam: when driving the app under Playwright, native open/save dialogs
  // cannot be automated. Setting these env vars makes the dialog IPC handlers
  // return deterministic paths without opening a native dialog. Unset in normal
  // use, so native behavior is fully preserved.
  const stubOpen = process.env.GVJS_E2E_OPEN; // path to return from dialog:openText
  const stubSave = process.env.GVJS_E2E_SAVE; // path to return from dialog:save
  const stubConfirm = process.env.GVJS_E2E_CONFIRM; // 'ok' | 'cancel'

  ipcMain.handle('dialog:openText', async (_e, filters: DiagramFilter[]) => {
    if (stubOpen) {
      return { path: stubOpen, content: await readFile(stubOpen, 'utf-8') };
    }
    const win = BrowserWindow.getFocusedWindow();
    const res = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters });
    if (res.canceled || !res.filePaths[0]) return null;
    const p = res.filePaths[0];
    return { path: p, content: await readFile(p, 'utf-8') };
  });

  ipcMain.handle(
    'dialog:save',
    async (_e, opts: { defaultPath: string; filters: DiagramFilter[] }) => {
      if (stubSave) {
        return stubSave;
      }
      const win = BrowserWindow.getFocusedWindow();
      const res = await dialog.showSaveDialog(win!, {
        defaultPath: opts.defaultPath,
        filters: opts.filters,
      });
      return res.canceled ? null : (res.filePath ?? null);
    }
  );

  ipcMain.handle('fs:readText', async (_e, p: string) => {
    try {
      return await readFile(p, 'utf-8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('fs:writeText', (_e, p: string, content: string) =>
    writeFile(p, content, 'utf-8')
  );
  ipcMain.handle('fs:writeBinary', (_e, p: string, bytes: Uint8Array) =>
    writeFile(p, Buffer.from(bytes))
  );

  ipcMain.handle('store:get', (_e, key: string) => store.get(key));
  ipcMain.handle('store:set', (_e, key: string, value: unknown) => {
    store.set(key, value);
  });
  ipcMain.handle('store:delete', (_e, key: string) => {
    store.delete(key);
  });

  ipcMain.handle('dialog:confirm', async (_e, message: string, opts?: ConfirmOptions) => {
    if (stubConfirm) return stubConfirm === 'ok';
    const win = BrowserWindow.getFocusedWindow();
    const res = await dialog.showMessageBox(win!, {
      type: opts?.kind ? kindToType[opts.kind] : 'question',
      title: opts?.title ?? 'Confirm',
      message,
      buttons: ['Cancel', 'OK'],
      defaultId: 1,
      cancelId: 0,
    });
    return res.response === 1;
  });

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url);
    return Promise.resolve();
  });

  ipcMain.handle('app:info', () => ({ name: app.getName(), version: app.getVersion() }));

  ipcMain.handle('menu:setRecent', (_e, paths: string[]) => {
    setMenuRecentFiles(paths);
  });

  ipcMain.handle('menu:setTheme', (_e, scheme: string) => {
    setMenuTheme(scheme);
  });

  ipcMain.handle('render:svg', (_e, dot: string, engine: LayoutEngine) =>
    renderDotToSvg(dot, engine)
  );
  ipcMain.handle('render:validate', (_e, dot: string, engine: LayoutEngine) =>
    validateDiagram(dot, engine)
  );
  ipcMain.handle(
    'export:render',
    async (
      _e,
      dot: string,
      engine: LayoutEngine,
      format: ExportFormat,
      options?: PdfExportOptions
    ) => (await exportDiagram(dot, engine, format, options)).bytes
  );
  ipcMain.handle('dot:format', (_e, source: string) => formatDot(source));
  ipcMain.handle('dot:vocabulary', () => ({
    keywords: [...DOT_KEYWORDS],
    attributes: [...DOT_ATTRIBUTES],
  }));
}

app.whenReady().then(() => {
  registerIpc();
  setupFileWatcher();
  createWindow();
  setupAppMenu();
  // Warm up the WASM engine eagerly; failures re-surface (and are handled) on the
  // first render:svg/export:render IPC call, so just log here rather than crash the
  // main process with an unhandled rejection.
  initGraphviz().catch((error) => {
    console.error('Failed to pre-initialize Graphviz', error);
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
