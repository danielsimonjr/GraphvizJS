/**
 * Docs freshness guard.
 *
 * The hand-authored architecture docs (docs/architecture/{OVERVIEW,ARCHITECTURE,
 * COMPONENTS,DATAFLOW,API}.md) rot silently — nothing forces them to keep pace with
 * the code. This guard reuses the dependency-graph tool's `buildAnalysis` (the same
 * source of truth as `pnpm graph:check`) and asserts two things:
 *
 *   1. every module in the real dependency graph is named in COMPONENTS.md, and
 *   2. every fully-wired IPC channel appears somewhere in the architecture docs.
 *
 * Those are exactly the two facts the README let rot across five releases (missing
 * modules, missing IPC channels). A net-new module or channel that nobody documented
 * fails `pnpm docs:check` (and the test/tools/docs-check.test.ts guard in CI).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAnalysis } from '../dependency-graph/index';

const DOCS_DIR = 'docs/architecture';
const COMPONENTS_DOC = 'COMPONENTS.md';
const ALL_DOCS = ['OVERVIEW.md', 'ARCHITECTURE.md', 'COMPONENTS.md', 'DATAFLOW.md', 'API.md'];

/** Modules that need not be named literally: `root` is just `src/main.ts` (the bootstrap). */
const MODULE_EXEMPT = new Set(['root']);

export interface DocsCheckResult {
  /** Module names present in the dependency graph but not named in COMPONENTS.md. */
  missingModules: string[];
  /** Fully-wired IPC channels not mentioned in any architecture doc. */
  missingChannels: string[];
  /** Totals, for the friendly summary line. */
  moduleCount: number;
  channelCount: number;
}

function readDoc(root: string, name: string): string {
  try {
    return readFileSync(path.join(root, DOCS_DIR, name), 'utf-8');
  } catch {
    return '';
  }
}

/** Case-insensitive word-boundary presence test. */
function wordPresent(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
}

/** Run the freshness checks against the docs on disk under `root`. */
export function checkDocs(root: string): DocsCheckResult {
  const a = buildAnalysis(root);

  const components = readDoc(root, COMPONENTS_DOC);
  const missingModules = [...a.modules.keys()]
    .filter((m) => !MODULE_EXEMPT.has(m))
    .filter((m) => !wordPresent(components, m))
    .sort();

  const allDocs = ALL_DOCS.map((d) => readDoc(root, d)).join('\n');
  const channels = a.ipc.fullyWired.map((c) => c.channel);
  const missingChannels = channels.filter((ch) => !allDocs.includes(ch)).sort();

  return {
    missingModules,
    missingChannels,
    moduleCount: a.modules.size - MODULE_EXEMPT.size,
    channelCount: channels.length,
  };
}

/** CLI entry: prints a summary, returns an exit code (0 fresh, 1 stale). */
export function main(root: string = process.cwd()): number {
  const { missingModules, missingChannels, moduleCount, channelCount } = checkDocs(root);

  if (missingModules.length === 0 && missingChannels.length === 0) {
    process.stdout.write(
      `Docs freshness — ${moduleCount} modules + ${channelCount} IPC channels documented. ✅\n`
    );
    return 0;
  }

  if (missingModules.length > 0) {
    process.stderr.write(
      `Undocumented modules (add to ${DOCS_DIR}/${COMPONENTS_DOC}): ${missingModules.join(', ')}\n`
    );
  }
  if (missingChannels.length > 0) {
    process.stderr.write(
      `Undocumented IPC channels (add to the architecture docs): ${missingChannels.join(', ')}\n`
    );
  }
  process.stderr.write('Architecture docs are stale — document the above and re-run.\n');
  return 1;
}

// Self-invoke when run directly (tsx tools/docs-check/index.ts), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.cwd());
}
