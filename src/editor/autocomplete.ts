import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  snippetCompletion,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import {
  DOT_ATTR_VALUES,
  DOT_ATTRIBUTES,
  DOT_COLORS,
  DOT_KEYWORDS,
  isColorAttribute,
} from './dot-data';

const SNIPPETS: Completion[] = [
  snippetCompletion('subgraph cluster_${1:name} {\n\t${2}\n}', {
    label: 'subgraph cluster',
    type: 'snippet',
  }),
  snippetCompletion('${1:node} [label="${2}", shape=${3:box}];', {
    label: 'node with attributes',
    type: 'snippet',
  }),
  snippetCompletion('${1:a} -> ${2:b};', { label: 'edge', type: 'snippet' }),
];

const KEYWORD_OPTIONS: Completion[] = DOT_KEYWORDS.map((label) => ({ label, type: 'keyword' }));
const ATTR_OPTIONS: Completion[] = DOT_ATTRIBUTES.map((label) => ({ label, type: 'property' }));

function valueOptions(values: readonly string[]): Completion[] {
  return values.map((label) => ({ label, type: 'enum' }));
}

export function dotCompletionSource(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);

  // Inside an unclosed attribute list `[ … ` on this line?
  const lastOpen = before.lastIndexOf('[');
  const lastClose = before.lastIndexOf(']');
  if (lastOpen > lastClose) {
    // The current entry is the text after the most recent [ , or ; separator.
    const entryStart = Math.max(
      before.lastIndexOf('['),
      before.lastIndexOf(','),
      before.lastIndexOf(';')
    );
    const entry = before.slice(entryStart + 1);
    const eq = entry.indexOf('=');

    if (eq !== -1) {
      // Value position: past `attr=`. Offer that attribute's value domain if
      // known, otherwise nothing — but NEVER the attribute-name list (that
      // would spam names while the user types a value).
      const attr = entry.slice(0, eq).trim().toLowerCase();
      const values = isColorAttribute(attr) ? DOT_COLORS : DOT_ATTR_VALUES[attr];
      if (!values) return null;
      const word = ctx.matchBefore(/[\w.#-]*$/);
      return {
        from: word ? word.from : ctx.pos,
        options: valueOptions(values),
        validFor: /[\w.#-]*/,
      };
    }

    // Name position: still typing the attribute name.
    const word = ctx.matchBefore(/\w*$/);
    return { from: word ? word.from : ctx.pos, options: ATTR_OPTIONS, validFor: /\w*/ };
  }

  // Statement start: keywords + snippets (line so far is blank or ends in { or ;).
  if (/(^|[{;])\s*\w*$/.test(before)) {
    const word = ctx.matchBefore(/\w*$/);
    if (word && word.from === word.to && !ctx.explicit) return null; // nothing typed, implicit
    const typed = word ? before.slice(word.from - line.from) : '';
    const options = [...KEYWORD_OPTIONS, ...SNIPPETS].filter((option) =>
      option.label.toLowerCase().startsWith(typed.toLowerCase())
    );
    if (typed && options.length === 0) return null; // typed text matches no keyword/snippet
    return { from: word ? word.from : ctx.pos, options, validFor: /\w*/ };
  }

  return null;
}

export function createDotAutocomplete(): Extension {
  return autocompletion({ override: [dotCompletionSource], activateOnTyping: true });
}
