import { findAttribute } from './dot-catalog.js';
import { DOT_COLORS, isColorAttribute } from './dot-colors.js';
import { nearest } from './edit-distance.js';
import { scanDot } from './scan-dot.js';
import type { StructuralDiagnostic } from './types.js';

export type { StructuralDiagnostic } from './types.js';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const RGB_COLOR_RE = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i;
const HSV_COLOR_RE = /^\d*\.?\d+[, ]\s*\d*\.?\d+[, ]\s*\d*\.?\d+$/;

function isValidColor(value: string): boolean {
  if (HEX_COLOR_RE.test(value)) return true;
  if (RGB_COLOR_RE.test(value)) return true;
  if (HSV_COLOR_RE.test(value)) return true;
  return (DOT_COLORS as readonly string[]).includes(value.toLowerCase());
}

interface ValueEntry {
  name: string;
  value: string;
  valueOffset: number;
}

/**
 * Tokenize an attribute-list body into `name=value` entries, skipping
 * entries with no value (structure-lint already covers those). Separators
 * are `,`, `;`, and whitespace, same as structure-lint's entry scan, but a
 * paren-depth counter keeps a value like `rgb(1,2,3)` intact as one token
 * instead of splitting on its internal commas.
 */
function parseValueEntries(body: string): ValueEntry[] {
  const entries: ValueEntry[] = [];
  const isSep = (c: string): boolean => c === ',' || c === ';' || /\s/.test(c);
  let i = 0;
  const n = body.length;
  while (i < n) {
    while (i < n && isSep(body[i])) i++; // skip separators
    if (i >= n) break;
    const nameStart = i;
    while (i < n && body[i] !== '=' && !isSep(body[i])) i++;
    const name = body.slice(nameStart, i);
    let j = i;
    while (j < n && /\s/.test(body[j])) j++; // optional ws before =
    if (j < n && body[j] === '=') {
      j++;
      while (j < n && /\s/.test(body[j])) j++; // optional ws after =
      const valueStart = j;
      let depth = 0;
      while (j < n) {
        const c = body[j];
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (depth <= 0 && isSep(c)) break;
        j++;
      }
      const value = body.slice(valueStart, j);
      if (name && value) entries.push({ name, value, valueOffset: valueStart });
      i = j;
    } else {
      i = j;
    }
  }
  return entries;
}

/**
 * Value/color semantic checks: for each `attr=value` entry in an attribute
 * list, validate `value` against the DOT attribute catalog. Only `code`
 * spans (scanDot) are scanned, so a quoted-string or HTML-label value —
 * which splits its attribute list across spans — is naturally exempt from
 * checking, as is any string-typed or unknown attribute. This is a safe
 * false-negative, never a false-positive on valid DOT.
 */
export function semanticDiagnostics(source: string): StructuralDiagnostic[] {
  const out: StructuralDiagnostic[] = [];

  for (const span of scanDot(source)) {
    if (span.kind !== 'code') continue;
    const text = source.slice(span.from, span.to);
    const listRe = /\[([^\]]*)\]/g;
    let m: RegExpExecArray | null;
    while ((m = listRe.exec(text)) !== null) {
      const listStart = span.from + m.index + 1;
      for (const entry of parseValueEntries(m[1])) {
        const from = listStart + entry.valueOffset;
        const to = from + entry.value.length;
        const attr = findAttribute(entry.name);

        if (attr?.type === 'enum' && attr.values && !attr.values.includes(entry.value)) {
          const suggestion = nearest(entry.value, attr.values);
          out.push({
            from,
            to,
            severity: 'warning',
            code: 'invalid-value',
            message: `Invalid value '${entry.value}' for attribute '${entry.name}'`,
            ...(suggestion
              ? {
                  fix: {
                    from,
                    to,
                    text: suggestion,
                    label: `Change '${entry.value}' to '${suggestion}'`,
                  },
                }
              : {}),
          });
          continue;
        }

        if (isColorAttribute(entry.name) && !isValidColor(entry.value)) {
          const suggestion = nearest(entry.value, DOT_COLORS);
          out.push({
            from,
            to,
            severity: 'warning',
            code: 'invalid-color',
            message: `Invalid color '${entry.value}' for attribute '${entry.name}'`,
            ...(suggestion
              ? {
                  fix: {
                    from,
                    to,
                    text: suggestion,
                    label: `Change '${entry.value}' to '${suggestion}'`,
                  },
                }
              : {}),
          });
        }
      }
    }
  }

  return out;
}
