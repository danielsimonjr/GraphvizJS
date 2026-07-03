import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { IpcChannel, IpcReport } from './types';

/** Method names on the GraphvizApi interface (generic-method tolerant). */
export function extractContractMethods(src: string): string[] {
  const start = src.indexOf('interface GraphvizApi');
  if (start === -1) return [];
  const open = src.indexOf('{', start);
  // Walk to the matching close brace.
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = src.slice(open + 1, end);
  const methods: string[] = [];
  // Match `name(` or `name<...>(` at the start of a (trimmed) line.
  const re = /^\s*(\w+)\s*(?:<[^>]*>)?\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) methods.push(m[1]);
  return methods;
}

/** method -> channel from `name: (...) => ipcRenderer.invoke('channel', ...)`. */
export function extractPreloadChannels(src: string): { method: string; channel: string }[] {
  const out: { method: string; channel: string }[] = [];
  const re = /(\w+)\s*:\s*\([^)]*\)\s*=>\s*ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push({ method: m[1], channel: m[2] });
  return out;
}

/** Channels from `ipcMain.handle('channel'` — `\s*` after `(` crosses newlines. */
export function extractMainHandlers(src: string): string[] {
  const out: string[] = [];
  const re = /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

export function analyzeIpc(contractSrc: string, preloadSrc: string, mainSrc: string): IpcReport {
  const contractMethods = new Set(extractContractMethods(contractSrc));
  const preload = extractPreloadChannels(preloadSrc);
  const handlers = new Set(extractMainHandlers(mainSrc));

  const byChannel = new Map<string, IpcChannel>();
  for (const { method, channel } of preload) {
    byChannel.set(channel, {
      channel,
      method,
      hasContract: contractMethods.has(method),
      hasPreload: true,
      hasHandler: handlers.has(channel),
    });
  }
  for (const channel of handlers) {
    if (byChannel.has(channel)) continue;
    byChannel.set(channel, {
      channel,
      hasContract: false,
      hasPreload: false,
      hasHandler: true,
    });
  }

  const fullyWired: IpcChannel[] = [];
  const missingContract: IpcChannel[] = [];
  const missingHandlers: IpcChannel[] = [];
  const orphanHandlers: IpcChannel[] = [];
  for (const c of byChannel.values()) {
    if (c.hasContract && c.hasPreload && c.hasHandler) fullyWired.push(c);
    else if (c.hasPreload && c.hasHandler && !c.hasContract) missingContract.push(c);
    else if (c.hasPreload && !c.hasHandler) missingHandlers.push(c);
    else if (!c.hasPreload && c.hasHandler) orphanHandlers.push(c);
  }
  const byName = (a: IpcChannel, b: IpcChannel) => a.channel.localeCompare(b.channel);
  return {
    fullyWired: fullyWired.sort(byName),
    missingContract: missingContract.sort(byName),
    missingHandlers: missingHandlers.sort(byName),
    orphanHandlers: orphanHandlers.sort(byName),
  };
}

export function analyzeIpcFromRoot(root: string): IpcReport {
  const read = (rel: string) => readFileSync(path.join(root, rel), 'utf-8');
  return analyzeIpc(
    read('src/platform/contract.ts'),
    read('electron/preload.ts'),
    read('electron/main.ts')
  );
}
