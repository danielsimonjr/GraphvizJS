import { extname } from 'node:path';
import type {
  ExportFormat,
  LayoutEngine,
  PdfExportOptions,
  PdfOrientation,
} from '../core/types.js';

const ENGINES: readonly LayoutEngine[] = [
  'dot',
  'neato',
  'fdp',
  'sfdp',
  'circo',
  'twopi',
  'osage',
  'patchwork',
];
const FORMATS: readonly ExportFormat[] = ['svg', 'png', 'pdf'];
const PDF_PAGES = ['fit', 'letter', 'a4'] as const;
const PDF_ORIENTATIONS: readonly PdfOrientation[] = ['auto', 'portrait', 'landscape'];

type PdfPageArg = (typeof PDF_PAGES)[number];

/** Parsed, validated CLI arguments for the `graphvizjs` command. */
export interface ParsedArgs {
  command: 'render' | 'validate' | 'format' | 'help' | 'version';
  input?: string;
  output?: string;
  engine: LayoutEngine;
  format?: 'svg' | 'png' | 'pdf';
  scale: 1 | 2;
  pdf: PdfExportOptions;
  /** validate only: emit machine-readable JSON instead of human output. */
  json?: boolean;
  /** validate only: fail (exit 1) when structural warnings are present. */
  strict?: boolean;
  /** validate only: apply available quick fixes and write the corrected source. */
  fix?: boolean;
}

/** A parse/validation failure, distinguished from `ParsedArgs` by the `error` key. */
export interface ParseError {
  error: string;
}

const DEFAULT_PDF: PdfExportOptions = { mode: 'fit', pageSize: 'letter', orientation: 'auto' };

function formatFromExtension(output: string): 'svg' | 'png' | 'pdf' | undefined {
  const ext = extname(output).toLowerCase().slice(1);
  return FORMATS.includes(ext as ExportFormat) ? (ext as 'svg' | 'png' | 'pdf') : undefined;
}

function isPdfPage(value: string): value is PdfPageArg {
  return (PDF_PAGES as readonly string[]).includes(value);
}

/**
 * Parse `graphvizjs` CLI arguments. Pure function, no I/O: returns either a
 * validated `ParsedArgs` or a `ParseError` describing the first problem found.
 */
export function parseArgs(argv: string[]): ParsedArgs | ParseError {
  if (argv.length === 0) {
    return { error: 'No command given. Expected "render", "--help", or "--version".' };
  }

  const first = argv[0];
  if (first === '--help' || first === '-h') {
    return { command: 'help', engine: 'dot', scale: 1, pdf: DEFAULT_PDF };
  }
  if (first === '--version' || first === '-v') {
    return { command: 'version', engine: 'dot', scale: 1, pdf: DEFAULT_PDF };
  }
  if (first === 'validate') return parseValidate(argv.slice(1));
  if (first === 'format') return parseFormat(argv.slice(1));
  if (first !== 'render') {
    return { error: `Unknown command: ${first}` };
  }

  let input: string | undefined;
  let output: string | undefined;
  let engine: LayoutEngine = 'dot';
  let format: 'svg' | 'png' | 'pdf' | undefined;
  let scale: 1 | 2 = 1;
  let pdfPage: PdfPageArg = 'fit';
  let pdfOrientation: PdfOrientation = 'auto';

  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    switch (arg) {
      case '-o':
      case '--output': {
        const value = rest[++i];
        if (value === undefined) return { error: `Missing value for ${arg}` };
        output = value;
        break;
      }
      case '--engine': {
        const value = rest[++i];
        if (value === undefined) return { error: 'Missing value for --engine' };
        if (!ENGINES.includes(value as LayoutEngine)) {
          return { error: `Unknown engine: ${value}. Expected one of ${ENGINES.join(', ')}` };
        }
        engine = value as LayoutEngine;
        break;
      }
      case '--format': {
        const value = rest[++i];
        if (value === undefined) return { error: 'Missing value for --format' };
        if (!FORMATS.includes(value as ExportFormat)) {
          return { error: `Unknown format: ${value}. Expected one of ${FORMATS.join(', ')}` };
        }
        format = value as 'svg' | 'png' | 'pdf';
        break;
      }
      case '--scale': {
        const value = rest[++i];
        if (value !== '1' && value !== '2') {
          return { error: `Invalid --scale: ${value}. Expected 1 or 2.` };
        }
        scale = value === '2' ? 2 : 1;
        break;
      }
      case '--pdf-page': {
        const value = rest[++i];
        if (value === undefined || !isPdfPage(value)) {
          return { error: `Invalid --pdf-page: ${value}. Expected one of ${PDF_PAGES.join(', ')}` };
        }
        pdfPage = value;
        break;
      }
      case '--pdf-orientation': {
        const value = rest[++i];
        if (!PDF_ORIENTATIONS.includes(value as PdfOrientation)) {
          return {
            error: `Invalid --pdf-orientation: ${value}. Expected one of ${PDF_ORIENTATIONS.join(', ')}`,
          };
        }
        pdfOrientation = value as PdfOrientation;
        break;
      }
      default: {
        // A bare "-" is the stdin input marker (see readInput), not a flag.
        if (arg !== '-' && arg.startsWith('-')) {
          return { error: `Unknown flag: ${arg}` };
        }
        if (input === undefined) {
          input = arg;
        } else {
          return { error: `Unexpected argument: ${arg}` };
        }
        break;
      }
    }
  }

  if (input === undefined) {
    return { error: 'Missing input. Expected a .dot file path or "-" for stdin.' };
  }
  if (output === undefined) {
    return { error: 'Missing required -o/--output <path>.' };
  }

  const resolvedFormat = format ?? formatFromExtension(output) ?? 'svg';
  const pdf: PdfExportOptions =
    pdfPage === 'fit'
      ? { mode: 'fit', pageSize: 'letter', orientation: pdfOrientation }
      : { mode: 'standard', pageSize: pdfPage, orientation: pdfOrientation };

  return {
    command: 'render',
    input,
    output,
    engine,
    format: resolvedFormat,
    scale,
    pdf,
  };
}

/** Parse `validate <input|-> [--engine E] [--json] [--strict] [--fix] [-o <output>]`. */
function parseValidate(rest: string[]): ParsedArgs | ParseError {
  let input: string | undefined;
  let output: string | undefined;
  let engine: LayoutEngine = 'dot';
  let json = false;
  let strict = false;
  let fix = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    switch (arg) {
      case '--engine': {
        const value = rest[++i];
        if (value === undefined) return { error: 'Missing value for --engine' };
        if (!ENGINES.includes(value as LayoutEngine)) {
          return { error: `Unknown engine: ${value}. Expected one of ${ENGINES.join(', ')}` };
        }
        engine = value as LayoutEngine;
        break;
      }
      case '--json':
        json = true;
        break;
      case '--strict':
        strict = true;
        break;
      case '--fix':
        fix = true;
        break;
      case '-o':
      case '--output': {
        const value = rest[++i];
        if (value === undefined) return { error: `Missing value for ${arg}` };
        output = value;
        break;
      }
      default: {
        if (arg !== '-' && arg.startsWith('-')) return { error: `Unknown flag: ${arg}` };
        if (input === undefined) input = arg;
        else return { error: `Unexpected argument: ${arg}` };
      }
    }
  }

  if (input === undefined) {
    return { error: 'Missing input. Expected a .dot file path or "-" for stdin.' };
  }
  if (output !== undefined && !fix) {
    return { error: '-o/--output on validate requires --fix' };
  }
  return {
    command: 'validate',
    input,
    output,
    engine,
    scale: 1,
    pdf: DEFAULT_PDF,
    json,
    strict,
    fix,
  };
}

/** Parse `format <input|-> [-o <output>]` (no output → stdout). */
function parseFormat(rest: string[]): ParsedArgs | ParseError {
  let input: string | undefined;
  let output: string | undefined;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    switch (arg) {
      case '-o':
      case '--output': {
        const value = rest[++i];
        if (value === undefined) return { error: `Missing value for ${arg}` };
        output = value;
        break;
      }
      default: {
        if (arg !== '-' && arg.startsWith('-')) return { error: `Unknown flag: ${arg}` };
        if (input === undefined) input = arg;
        else return { error: `Unexpected argument: ${arg}` };
      }
    }
  }

  if (input === undefined) {
    return { error: 'Missing input. Expected a .dot file path or "-" for stdin.' };
  }
  return { command: 'format', input, output, engine: 'dot', scale: 1, pdf: DEFAULT_PDF };
}
