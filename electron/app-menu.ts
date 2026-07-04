import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { buildMenuTemplate, type MenuActionId } from '../src/menu/menu-template';

const REPO_URL = 'https://github.com/danielsimonjr/GraphvizJS';

let recentFiles: string[] = [];

function sendAction(action: MenuActionId, payload?: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('menu:action', { action, payload });
  }
}

function showAbout(): void {
  const win = BrowserWindow.getFocusedWindow();
  const opts = {
    type: 'info' as const,
    title: 'About GraphvizJS',
    message: app.getName(),
    detail: `Version ${app.getVersion()}`,
  };
  if (win) dialog.showMessageBox(win, opts);
  else dialog.showMessageBox(opts);
}

/** Build and install the application menu from the current state. */
export function rebuildAppMenu(): void {
  const template = buildMenuTemplate({
    isMac: process.platform === 'darwin',
    isDev: !!process.env.VITE_DEV_SERVER_URL,
    recentFiles,
    onAction: sendAction,
    onOpenSource: () => void shell.openExternal(REPO_URL),
    onAbout: showAbout,
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Install the application menu. */
export function setupAppMenu(): void {
  rebuildAppMenu();
}

/** Update the recent-files list used by Open Recent, and rebuild the menu. */
export function setMenuRecentFiles(paths: string[]): void {
  recentFiles = Array.isArray(paths) ? paths : [];
  rebuildAppMenu();
}
