import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { dotCompletionSource } from '../../src/editor/autocomplete';

/** Build a completion context at the end of `doc` (caret at |, or end if absent). */
function contextAt(doc: string): CompletionContext {
  const pos = doc.includes('|') ? doc.indexOf('|') : doc.length;
  const text = doc.replace('|', '');
  const state = EditorState.create({ doc: text });
  return new CompletionContext(state, pos, true);
}

const labels = (doc: string): string[] => {
  const r = dotCompletionSource(contextAt(doc));
  return r ? r.options.map((o) => o.label) : [];
};

describe('dotCompletionSource', () => {
  it('offers keywords and snippets at statement start', () => {
    const out = labels('digraph G {\n  ');
    expect(out).toEqual(expect.arrayContaining(['subgraph', 'node', 'edge']));
  });

  it('offers attribute names inside an attribute list', () => {
    expect(labels('a [')).toEqual(expect.arrayContaining(['shape', 'label', 'color']));
  });

  it('offers enum values after shape=', () => {
    expect(labels('a [shape=')).toEqual(expect.arrayContaining(['box', 'ellipse', 'record']));
  });

  it('offers colors after fillcolor=', () => {
    expect(labels('a [fillcolor=')).toEqual(expect.arrayContaining(['red', 'blue']));
  });

  it('returns null in the middle of a plain identifier', () => {
    expect(dotCompletionSource(contextAt('mynode'))).toBeNull();
  });

  it('does not offer attribute names while typing a numeric value', () => {
    expect(labels('a [penwidth=1.5')).not.toContain('shape');
  });

  it('does not offer attribute names while typing a quoted label value', () => {
    expect(labels('a [label="hello wor')).not.toContain('shape');
  });

  it('does not offer attribute names while typing a hex color value', () => {
    expect(labels('a [color=#ff')).not.toContain('shape');
  });

  it('offers matching shape enums for a partial value', () => {
    expect(labels('a [shape=b')).toContain('box');
  });

  it('offers attribute names for a later name-position entry', () => {
    expect(labels('a [shape=box, ')).toContain('label');
  });
});
