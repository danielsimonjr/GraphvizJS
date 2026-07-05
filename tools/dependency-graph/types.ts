/** One resolved-or-unresolved internal (relative) import from a source file. */
export interface InternalDep {
  /** Raw specifier as written, e.g. './render' or '../utils/debounce'. */
  file: string;
  /** Imported identifiers; '* as NS' for a namespace import, '*' for a re-export-all. */
  imports: string[];
  /** True if every binding is type-only (`import type` or all `{ type X }`). */
  typeOnly: boolean;
}

/** A parsed source file: its internal deps, exported names, and size. */
export interface ParsedFile {
  /** Repo-relative POSIX path, e.g. 'src/preview/render.ts'. */
  path: string;
  internalDeps: InternalDep[];
  /** Exported identifier names (deduped). */
  exports: string[];
  /** Line count. */
  loc: number;
}

/** module name -> list of repo-relative file paths in that module. */
export type ModuleMap = Map<string, string[]>;

/** module name -> set of module names it depends on (folder-level edges). */
export type ModuleEdges = Map<string, Set<string>>;

export interface CycleReport {
  /** Cycles present in the runtime (value) import graph. */
  runtime: string[][];
  /** Cycles present only when type-only edges are included. */
  typeOnly: string[][];
}

export interface UnusedReport {
  /** Non-entry files that nothing imports. */
  unusedFiles: string[];
  /**
   * Files that DO have importers but are unreachable from any entry-like or
   * test root — i.e. they live in a dead import cluster the `unusedFiles`
   * degree check cannot see. A healthy graph has none.
   */
  dormantFiles: string[];
  /** Exports that no file (src or test) imports by name. */
  unusedExports: { file: string; name: string }[];
}

export interface CoverageRow {
  /** A src file. */
  file: string;
  /** Test files that import it (directly). */
  testFiles: string[];
}

export interface IpcChannel {
  channel: string;
  /** The GraphvizApi method that exposes this channel (from preload), if any. */
  method?: string;
  hasContract: boolean;
  hasPreload: boolean;
  hasHandler: boolean;
}

export interface IpcReport {
  /** contract method -> preload invoke -> main handle. */
  fullyWired: IpcChannel[];
  /** preload invoke + main handle but NO matching contract method (contract drift or a contract-parser miss). */
  missingContract: IpcChannel[];
  /** preload invoke with no ipcMain.handle (latent bug: invoke would reject). */
  missingHandlers: IpcChannel[];
  /** ipcMain.handle with no preload invoke (orphan/dead handler). */
  orphanHandlers: IpcChannel[];
}

/** An import edge that breaks the architecture layer policy. */
export interface LayerViolation {
  /** Importing file (repo-relative). */
  from: string;
  /** Resolved imported file (repo-relative). */
  to: string;
  /** Raw specifier as written. */
  spec: string;
  typeOnly: boolean;
  /** Human-readable rule that was broken. */
  rule: string;
}

export interface Stats {
  fileCount: number;
  moduleCount: number;
  totalLoc: number;
  /** File-level internal edges (resolved). */
  edgeCount: number;
  exportCount: number;
}

export interface Analysis {
  files: ParsedFile[];
  testFiles: ParsedFile[];
  modules: ModuleMap;
  moduleEdges: ModuleEdges;
  cycles: CycleReport;
  unused: UnusedReport;
  coverage: CoverageRow[];
  ipc: IpcReport;
  /** Import edges that break the architecture layer policy (empty = clean). */
  layerViolations: LayerViolation[];
  stats: Stats;
}

export interface CliOptions {
  /** Reserved flag: include test-only files as their own module rows. */
  includeTests: boolean;
  /** --check: verify invariants without writing docs; exit non-zero on any hard violation. */
  check: boolean;
  /** --impact <file>: print the transitive reverse-dependencies (blast radius) of a file. */
  impact?: string;
}
