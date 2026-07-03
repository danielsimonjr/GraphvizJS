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

  // 1. Attribute value: `attr=` (optionally an opening quote) just before caret.
  const valueMatch = before.match(/(\w+)\s*=\s*"?(\w*)$/);
  if (valueMatch) {
    const attr = valueMatch[1].toLowerCase();
    const values = isColorAttribute(attr) ? DOT_COLORS : DOT_ATTR_VALUES[attr];
    if (values) {
      const word = ctx.matchBefore(/\w*$/);
      return { from: word ? word.from : ctx.pos, options: valueOptions(values), validFor: /\w*/ };
    }
    return null;
  }

  // 2. Attribute name: caret inside an unclosed `[ … ` on this line.
  const lastOpen = before.lastIndexOf('[');
  const lastClose = before.lastIndexOf(']');
  if (lastOpen > lastClose) {
    const word = ctx.matchBefore(/\w*$/);
    return { from: word ? word.from : ctx.pos, options: ATTR_OPTIONS, validFor: /\w*/ };
  }

  // 3. Statement start: keywords + snippets (line so far is blank or ends in { or ;).
  if (/(^|[{;])\s*\w*$/.test(before)) {
    const word = ctx.matchBefore(/\w*$/);
    if (word && word.from === word.to && !ctx.explicit) return null; // nothing typed, implicit
    const typed = word ? before.slice(word.from - line.from) : '';
    const options = [...KEYWORD_OPTIONS, ...SNIPPETS].filter((option) =>
      option.label.toLowerCase().startsWith(typed.toLowerCase())
    );
    if (typed && options.length === 0) return null; // typed text matches no keyword/snippet
    return {
      from: word ? word.from : ctx.pos,
      options,
      validFor: /\w*/,
    };
  }

  return null;
}

export function createDotAutocomplete(): Extension {
  return autocompletion({ override: [dotCompletionSource], activateOnTyping: true });
}
