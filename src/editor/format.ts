import type { Span } from './scan-dot';
import { checkBalance, scanDot } from './scan-dot';

export interface FormatOptions {
  indent?: string;
}

/** True if `offset` falls strictly inside a non-code (literal) span. */
function insideLiteral(spans: Span[], offset: number): boolean {
  return spans.some((s) => s.kind !== 'code' && offset > s.from && offset < s.to);
}

/**
 * Normalize spacing in the code portions of a single line; literal spans
 * (string/html/comment) are copied through byte-for-byte and are never
 * touched by the spacing/collapse transforms below.
 */
function normalizeLine(line: string, lineStart: number, spans: Span[]): string {
  let out = '';
  let i = 0;
  // True when the line's tail was copied verbatim from a literal span that
  // extends to (or past) the end of this line — trailing whitespace must be
  // preserved in that case since it may be significant literal content.
  let trailingIsLiteral = false;

  while (i < line.length) {
    const abs = lineStart + i;
    const span = spans.find((s) => abs >= s.from && abs < s.to);

    if (span && span.kind !== 'code') {
      const end = Math.min(span.to - lineStart, line.length);
      out += line.slice(i, end);
      trailingIsLiteral = end >= line.length;
      i = end;
      continue;
    }

    // Code chunk: extends to the start of the next literal span on this line,
    // or to the end of the line. Only this substring is spacing-normalized.
    let end = line.length;
    for (const s of spans) {
      const relFrom = s.from - lineStart;
      if (s.kind !== 'code' && relFrom > i && relFrom < end) end = relFrom;
    }
    const chunk = line
      .slice(i, end)
      .replace(/\s*(->|--)\s*/g, ' $1 ')
      .replace(/[ \t]{2,}/g, ' ');
    out += chunk;
    trailingIsLiteral = false;
    i = end;
  }

  return trailingIsLiteral ? out : out.replace(/[ \t]+$/g, '');
}

interface BraceDelta {
  open: number;
  leadingClose: number;
}

/** Net code-level brace depth change on a line, and how many closes lead it. */
function braceDelta(line: string, lineStart: number, spans: Span[]): BraceDelta {
  let open = 0;
  let leadingClose = 0;
  let seenNonClose = false;

  for (let i = 0; i < line.length; i++) {
    const abs = lineStart + i;
    const span = spans.find((s) => abs >= s.from && abs < s.to);
    if (span && span.kind !== 'code') continue;

    const ch = line[i];
    if (ch === '{') {
      open++;
      seenNonClose = true;
    } else if (ch === '}') {
      open--;
      if (!seenNonClose) leadingClose++;
    } else if (!/\s/.test(ch)) {
      seenNonClose = true;
    }
  }

  return { open, leadingClose };
}

/**
 * Reindent DOT source by `{}` depth and normalize spacing around `->`/`--`
 * in code regions. Content inside string/HTML literals and comments is
 * preserved verbatim. Idempotent. Fails safe: returns `source` unchanged
 * when its delimiters are unbalanced.
 */
export function formatDot(source: string, opts: FormatOptions = {}): string {
  if (!checkBalance(source).balanced) return source; // fail-safe

  const indentUnit = opts.indent ?? '  ';
  const spans = scanDot(source);
  const lines = source.split('\n');
  const lineStarts: number[] = [];
  {
    let off = 0;
    for (const ln of lines) {
      lineStarts.push(off);
      off += ln.length + 1;
    }
  }

  const out: string[] = [];
  let depth = 0;
  let pendingBlank = false;

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const start = lineStarts[li];

    if (insideLiteral(spans, start)) {
      out.push(raw); // continuation line of a multi-line literal — kept verbatim
      pendingBlank = false;
      // The literal may close mid-line, leaving trailing code with braces:
      // count those so brace depth (and thus later lines' indent) stays correct.
      const { open } = braceDelta(raw, start, spans);
      depth = Math.max(0, depth + open);
      continue;
    }

    if (raw.trim() === '') {
      pendingBlank = true;
      continue;
    }
    if (pendingBlank && out.length > 0) out.push('');
    pendingBlank = false;

    const { open, leadingClose } = braceDelta(raw, start, spans);
    const lineDepth = Math.max(0, depth - leadingClose);
    // Only strip leading indentation here (replaced by the computed indent
    // below) — normalizeLine already protects trailing whitespace that is
    // genuine literal content, so we must not blindly trim() both ends.
    const normalized = normalizeLine(raw, start, spans).replace(/^[ \t]+/, '');
    out.push(indentUnit.repeat(lineDepth) + normalized);
    depth = Math.max(0, depth + open);
  }

  let result = out.join('\n');
  if (source.endsWith('\n') && !result.endsWith('\n')) result += '\n';
  return result;
}
