export type SpanKind = 'code' | 'string' | 'html' | 'comment';

export interface Span {
  kind: SpanKind;
  from: number;
  to: number;
  closed: boolean;
}

/** Split DOT source into contiguous spans, isolating literal regions from code. */
export function scanDot(source: string): Span[] {
  const spans: Span[] = [];
  const n = source.length;
  let i = 0;
  let codeStart = 0;

  const flushCode = (to: number): void => {
    if (to > codeStart) spans.push({ kind: 'code', from: codeStart, to, closed: true });
  };

  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];

    if (c === '"') {
      flushCode(i);
      const from = i;
      i++;
      let closed = false;
      while (i < n) {
        const ch = source[i];
        if (ch === '\\') {
          // Clamp so a trailing backslash right before EOF can't push `i` past
          // source.length, which would violate the "spans cover [0, source.length)"
          // invariant for the emitted (unterminated) span.
          i = Math.min(i + 2, n);
          continue;
        }
        i++;
        if (ch === '"') {
          closed = true;
          break;
        }
      }
      spans.push({ kind: 'string', from, to: i, closed });
      codeStart = i;
      continue;
    }

    if (c === '<') {
      flushCode(i);
      const from = i;
      i++;
      let depth = 1;
      while (i < n && depth > 0) {
        const ch = source[i];
        if (ch === '"') {
          // Skip a quoted attribute value so its `<`/`>` don't affect depth
          // counting (e.g. `TITLE="a>b"` must not close the label early).
          // Escape handling mirrors the string-scanner branch above.
          i++;
          while (i < n) {
            const qch = source[i];
            if (qch === '\\') {
              i = Math.min(i + 2, n);
              continue;
            }
            i++;
            if (qch === '"') break;
          }
          continue;
        }
        if (ch === '<') depth++;
        else if (ch === '>') depth--;
        i++;
      }
      spans.push({ kind: 'html', from, to: i, closed: depth === 0 });
      codeStart = i;
      continue;
    }

    if ((c === '/' && c2 === '/') || c === '#') {
      flushCode(i);
      const from = i;
      while (i < n && source[i] !== '\n') i++;
      spans.push({ kind: 'comment', from, to: i, closed: true });
      codeStart = i;
      continue;
    }

    if (c === '/' && c2 === '*') {
      flushCode(i);
      const from = i;
      i += 2;
      let closed = false;
      while (i < n) {
        if (source[i] === '*' && source[i + 1] === '/') {
          i += 2;
          closed = true;
          break;
        }
        i++;
      }
      spans.push({ kind: 'comment', from, to: i, closed });
      codeStart = i;
      continue;
    }

    i++;
  }
  flushCode(n);
  return spans;
}

export interface BalanceResult {
  balanced: boolean;
  error?: { pos: number; message: string };
}

const CLOSERS: Record<string, string> = { '}': '{', ']': '[' };

/** Check {} / [] balance and literal termination, ignoring delimiters inside literals. */
export function checkBalance(source: string): BalanceResult {
  const stack: { ch: string; pos: number }[] = [];
  for (const span of scanDot(source)) {
    if (span.kind !== 'code') {
      if (!span.closed) {
        return { balanced: false, error: { pos: span.from, message: `Unterminated ${span.kind}` } };
      }
      continue;
    }
    for (let i = span.from; i < span.to; i++) {
      const ch = source[i];
      if (ch === '{' || ch === '[') {
        stack.push({ ch, pos: i });
      } else if (ch === '}' || ch === ']') {
        const open = stack.pop();
        if (!open || open.ch !== CLOSERS[ch]) {
          return { balanced: false, error: { pos: i, message: `Unmatched '${ch}'` } };
        }
      }
    }
  }
  if (stack.length > 0) {
    const top = stack[stack.length - 1];
    return { balanced: false, error: { pos: top.pos, message: `Unclosed '${top.ch}'` } };
  }
  return { balanced: true };
}
