// Pure helpers for the main-process file watcher. No Electron/fs imports so the
// logic is unit-testable and reusable from both processes.

function dirname(p: string): string {
  const n = p.replace(/\\/g, '/');
  const i = n.lastIndexOf('/');
  return i > 0 ? n.slice(0, i) : i === 0 ? '/' : '.';
}

function basename(p: string): string {
  const n = p.replace(/\\/g, '/');
  const i = n.lastIndexOf('/');
  return i >= 0 ? n.slice(i + 1) : n;
}

/** Group file paths by their parent directory -> list of basenames. */
export function groupByDir(paths: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of paths) {
    const dir = dirname(p);
    (out[dir] ??= []).push(basename(p));
  }
  return out;
}

/** Directories to start/stop watching given the current and next dir sets. */
export function dirDiff(
  current: string[],
  next: string[]
): { toWatch: string[]; toUnwatch: string[] } {
  const cur = new Set(current);
  const nxt = new Set(next);
  return {
    toWatch: next.filter((d) => !cur.has(d)),
    toUnwatch: current.filter((d) => !nxt.has(d)),
  };
}
