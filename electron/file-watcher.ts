import { type FSWatcher, watch } from 'node:fs';
import path from 'node:path';
import { BrowserWindow, ipcMain } from 'electron';
import { dirDiff, groupByDir } from '../src/watch/watch-plan';

const DEBOUNCE_MS = 200;

/** Registers the watch:setPaths handler and pushes file:changed on disk edits. */
export function setupFileWatcher(): void {
  const watchers = new Map<string, FSWatcher>();
  let basenamesByDir: Record<string, string[]> = {};
  const timers = new Map<string, NodeJS.Timeout>();

  const emit = (fullPath: string) => {
    const existing = timers.get(fullPath);
    if (existing) clearTimeout(existing);
    timers.set(
      fullPath,
      setTimeout(() => {
        timers.delete(fullPath);
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send('file:changed', fullPath);
        }
      }, DEBOUNCE_MS)
    );
  };

  ipcMain.handle('watch:setPaths', (_e, paths: string[]) => {
    const next = groupByDir(paths);
    const { toWatch, toUnwatch } = dirDiff(Object.keys(basenamesByDir), Object.keys(next));
    for (const dir of toUnwatch) {
      watchers.get(dir)?.close();
      watchers.delete(dir);
    }
    for (const dir of toWatch) {
      try {
        const w = watch(dir, (_event, filename) => {
          if (!filename) return;
          const base = path.basename(filename.toString());
          if ((basenamesByDir[dir] ?? []).includes(base)) emit(path.join(dir, base));
        });
        watchers.set(dir, w);
      } catch {
        // Directory is momentarily unwatchable (removed/permission). Drop it from
        // the tracked set so the next reconcile treats it as new and retries,
        // rather than believing a watcher exists and never re-attempting.
        delete next[dir];
      }
    }
    basenamesByDir = next;
  });
}
