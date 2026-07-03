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
      for (const entry of splitTopLevel(m[1])) {
        const trimmed = entry.text.trim();
        if (trimmed === '') continue;
        const at = listStart + entry.offset + (entry.text.length - entry.text.trimStart().length);
        const eq = trimmed.indexOf('=');
        if (eq === -1) {
          out.push({
            from: at,
            to: at + trimmed.length,
            severity: 'warning',
            message: `Attribute '${trimmed}' is missing '=' value`,
          });
          continue;
        }
        const name = trimmed.slice(0, eq).trim();
        if (name && /^[A-Za-z_]\w*$/.test(name) && !ATTR_SET.has(name.toLowerCase())) {
          out.push({
            from: at,
            to: at + name.length,
            severity: 'warning',
            message: `Unknown attribute '${name}'`,
          });
        }
      }
    }
  }
  return out;
}

/** Split an attribute-list body on commas and semicolons, tracking each entry's offset. */
function splitTopLevel(body: string): { text: string; offset: number }[] {
  const parts: { text: string; offset: number }[] = [];
  let start = 0;
  for (let i = 0; i <= body.length; i++) {
    const ch = body[i];
    if (i === body.length || ch === ',' || ch === ';') {
      parts.push({ text: body.slice(start, i), offset: start });
      start = i + 1;
    }
  }
  return parts;
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
