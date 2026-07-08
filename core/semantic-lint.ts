import type { AttrContext } from './dot-catalog.js';
import { findAttribute } from './dot-catalog.js';
import { DOT_COLORS, isColorAttribute } from './dot-colors.js';
import { nearest } from './edit-distance.js';
import type { Span } from './scan-dot.js';
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
  nameOffset: number;
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
      if (name && value)
        entries.push({ name, nameOffset: nameStart, value, valueOffset: valueStart });
      i = j;
    } else {
      i = j;
    }
  }
  return entries;
}

const KEYWORD_CONTEXTS: Record<string, AttrContext> = {
  graph: 'graph',
  node: 'node',
  edge: 'edge',
};
// A statement boundary immediately before the classified token: start of the code span,
// or the token is preceded by `;`, `{`, or `}` (with only whitespace in between).
const STATEMENT_BOUNDARY_RE = /[;{}]$/;

/**
 * Conservatively classify the statement context of a `[...]` attribute list from the
 * code immediately preceding it, within the same code span (a preceding token that lies
 * in an earlier span — e.g. across a quoted string — is out of reach here and, like the
 * rest of this heuristic, simply yields no classification). Recognizes:
 *   - `node`/`edge`/`graph` keyword directly before `[`, at a statement boundary → that
 *     keyword's own context (a default-attribute statement). For the `graph` keyword
 *     specifically, this only holds at `braceDepth === 1` (directly inside the top-level
 *     `digraph {`/`graph {` body) — at any deeper nesting, `graph [...]` sets attributes
 *     on the enclosing subgraph/cluster, not the root graph, so it is left unclassified.
 *   - a plain identifier immediately preceded by an edge operator chain (`->`/`--`) →
 *     `edge` (the list belongs to an edge statement).
 *   - a plain identifier at a statement boundary → `node` (a fresh node statement).
 * Anything else (ambiguous prefix, port/compass syntax, mid-statement punctuation, etc.)
 * returns null, and the caller must skip wrong-context checking for that list — silence
 * over a false positive.
 */
function classifyListContext(prefixText: string, braceDepth: number): AttrContext | null {
  const trimmed = prefixText.replace(/\s+$/, '');
  const idMatch = /[A-Za-z0-9_]+$/.exec(trimmed);
  if (!idMatch) return null;
  const id = idMatch[0];
  const before = trimmed.slice(0, trimmed.length - id.length).replace(/\s+$/, '');

  const keywordContext = KEYWORD_CONTEXTS[id.toLowerCase()];
  if (keywordContext) {
    if (before !== '' && !STATEMENT_BOUNDARY_RE.test(before)) return null;
    if (id.toLowerCase() === 'graph' && braceDepth !== 1) return null;
    return keywordContext;
  }

  if (before.endsWith('->') || before.endsWith('--')) return 'edge';
  if (before === '' || STATEMENT_BOUNDARY_RE.test(before)) return 'node';
  return null;
}

/** Count unmatched `{` minus `}` in `text.slice(0, upTo)`, starting from `startDepth`. */
function braceDepthAt(text: string, upTo: number, startDepth: number): number {
  let depth = startDepth;
  for (let i = 0; i < upTo; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
  }
  return depth;
}

const CLUSTER_REF_ATTRS = new Set(['lhead', 'ltail']);

/**
 * Collect every subgraph/cluster name declared anywhere in the source via
 * `subgraph <name> { ... }`, regardless of where the declaration sits relative to any
 * `lhead`/`ltail` reference (a cluster declared later in the file still counts). Only
 * `subgraph` keyword occurrences inside a `code` span are recognized. The name that
 * follows may be an unquoted identifier in the same code span, or a quoted string — the
 * very next span, when it starts exactly where the code span ended (no gap). Anonymous
 * subgraphs (`subgraph { ... }`) and anything else ambiguous simply contribute no name —
 * fail-safe, since an under-populated set can only suppress `undefined-cluster` findings,
 * never fabricate one.
 */
function collectDeclaredSubgraphNames(source: string, spans: Span[]): Set<string> {
  const names = new Set<string>();
  const keywordRe = /\bsubgraph\b/g;
  for (let idx = 0; idx < spans.length; idx++) {
    const span = spans[idx];
    if (span.kind !== 'code') continue;
    const text = source.slice(span.from, span.to);
    keywordRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = keywordRe.exec(text)) !== null) {
      let j = m.index + m[0].length;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (j < text.length) {
        const idMatch = /^[A-Za-z0-9_.]+/.exec(text.slice(j));
        if (idMatch) names.add(idMatch[0]);
      } else {
        // The name (if any) lies in the span immediately following — only a quoted
        // string abutting this code span with no gap is trusted as that name.
        const next = spans[idx + 1];
        if (next && next.kind === 'string' && next.from === span.to) {
          const raw = source.slice(next.from, next.to);
          const inner =
            raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
          names.add(inner.replace(/\\"/g, '"'));
        }
      }
    }
  }
  return names;
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
  const spans = scanDot(source);
  const declaredClusters = collectDeclaredSubgraphNames(source, spans);
  // Brace depth carried across code spans (quoted strings/comments/HTML labels never
  // contribute braces to the graph structure, so only `code`-kind spans are counted).
  let depth = 0;

  for (const span of spans) {
    if (span.kind !== 'code') continue;
    const text = source.slice(span.from, span.to);
    const listRe = /\[([^\]]*)\]/g;
    let m: RegExpExecArray | null;
    while ((m = listRe.exec(text)) !== null) {
      const listStart = span.from + m.index + 1;
      const depthAtList = braceDepthAt(text, m.index, depth);
      const context = classifyListContext(text.slice(0, m.index), depthAtList);
      // Names seen so far within THIS single attribute list, for duplicate-attribute.
      const seenNames = new Set<string>();
      for (const entry of parseValueEntries(m[1])) {
        const from = listStart + entry.valueOffset;
        const to = from + entry.value.length;
        const attr = findAttribute(entry.name);
        const nameKey = entry.name.toLowerCase();

        if (seenNames.has(nameKey)) {
          const nameFrom = listStart + entry.nameOffset;
          const nameTo = nameFrom + entry.name.length;
          out.push({
            from: nameFrom,
            to: nameTo,
            severity: 'warning',
            code: 'duplicate-attribute',
            message: `Attribute '${entry.name}' is set more than once in this attribute list`,
          });
        } else {
          seenNames.add(nameKey);
        }

        if (CLUSTER_REF_ATTRS.has(nameKey) && !declaredClusters.has(entry.value)) {
          out.push({
            from,
            to,
            severity: 'warning',
            code: 'undefined-cluster',
            message: `'${entry.name}' references undefined cluster/subgraph '${entry.value}'`,
          });
        }

        if (context && attr && !attr.contexts.includes(context)) {
          const nameFrom = listStart + entry.nameOffset;
          const nameTo = nameFrom + entry.name.length;
          out.push({
            from: nameFrom,
            to: nameTo,
            severity: 'warning',
            code: 'wrong-context',
            message: `Attribute '${entry.name}' is not valid in a ${context} context (valid in: ${attr.contexts.join(', ')})`,
          });
        }

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
    depth = braceDepthAt(text, text.length, depth);
  }

  return out;
}
