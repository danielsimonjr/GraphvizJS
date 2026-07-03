import type { Diagnostic, LintSource } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import { DOT_ATTRIBUTES } from './dot-data';
import { checkBalance, scanDot } from './scan-dot';

export interface StructuralDiagnostic {
  from: number;
  to: number;
  severity: 'error' | 'warning';
  message: string;
}

const ATTR_SET = new Set(DOT_ATTRIBUTES.map((a) => a.toLowerCase()));

/** Pure structural analysis: delimiter balance + attribute-list sanity. */
export function structuralDiagnostics(source: string): StructuralDiagnostic[] {
  const out: StructuralDiagnostic[] = [];

  const balance = checkBalance(source);
  if (!balance.balanced && balance.error) {
    out.push({
      from: balance.error.pos,
      to: Math.min(balance.error.pos + 1, source.length),
      severity: 'error',
      message: balance.error.message,
    });
    return out; // don't attribute-scan structurally broken input
  }

  // Walk code spans, find attribute lists [ ... ], check each entry.
  for (const span of scanDot(source)) {
    if (span.kind !== 'code') continue;
    const text = source.slice(span.from, span.to);
    const listRe = /\[([^\]]*)\]/g;
    let m: RegExpExecArray | null;
    while ((m = listRe.exec(text)) !== null) {
      const listStart = span.from + m.index + 1;
      for (const entry of parseAttrEntries(m[1])) {
        const at = listStart + entry.offset;
        if (!entry.hasValue) {
          out.push({
            from: at,
            to: at + entry.name.length,
            severity: 'warning',
            message: `Attribute '${entry.name}' is missing '=' value`,
          });
        } else if (/^[A-Za-z_]\w*$/.test(entry.name) && !ATTR_SET.has(entry.name.toLowerCase())) {
          out.push({
            from: at,
            to: at + entry.name.length,
            severity: 'warning',
            message: `Unknown attribute '${entry.name}'`,
          });
        }
      }
    }
  }
  return out;
}

interface AttrEntry {
  name: string;
  hasValue: boolean;
  offset: number;
}

/**
 * Tokenize an attribute-list body into entries. Each entry is a `name`
 * optionally followed by `= value`; entries are separated by `,`, `;`, or
 * whitespace. Spaces around `=` bind the name and value into ONE entry, so
 * `shape = box` is a single valid attribute (not a missing-`=` entry).
 */
function parseAttrEntries(body: string): AttrEntry[] {
  const entries: AttrEntry[] = [];
  const isSep = (c: string): boolean => c === ',' || c === ';' || /\s/.test(c);
  let i = 0;
  const n = body.length;
  while (i < n) {
    while (i < n && isSep(body[i])) i++; // skip separators
    if (i >= n) break;
    const nameStart = i;
    while (i < n && !isSep(body[i]) && body[i] !== '=') i++;
    const name = body.slice(nameStart, i);
    let j = i;
    while (j < n && /\s/.test(body[j])) j++; // optional ws before =
    let hasValue = false;
    if (j < n && body[j] === '=') {
      hasValue = true;
      j++;
      while (j < n && /\s/.test(body[j])) j++; // optional ws after =
      while (j < n && !isSep(body[j])) j++; // consume value token
      i = j;
    } else {
      i = j;
    }
    if (name) entries.push({ name, hasValue, offset: nameStart });
  }
  return entries;
}

/** CodeMirror LintSource wrapping the pure structural analysis. */
export function createStructureLintSource(): LintSource {
  return (view: EditorView): Diagnostic[] =>
    structuralDiagnostics(view.state.doc.toString()).map((d) => ({
      from: d.from,
      to: d.to,
      severity: d.severity,
      message: d.message,
    }));
}
