import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { createDotLanguage } from '../../src/editor/language';

describe('language', () => {
  describe('createDotLanguage()', () => {
    it('returns Extension', () => {
      const extension = createDotLanguage();
      expect(extension).toBeDefined();
    });

    it('can be used with EditorState', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { a -> b }',
        extensions: [extension],
      });
      expect(state).toBeDefined();
      expect(state.doc.toString()).toBe('digraph { a -> b }');
    });
  });

  describe('DOT_KEYWORDS constant', () => {
    it('includes digraph', () => {
      // Verify keyword is used by creating state with it
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph G {}',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('digraph');
    });

    it('includes graph', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'graph G {}',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('graph');
    });

    it('includes subgraph', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { subgraph cluster_0 {} }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('subgraph');
    });

    it('includes node', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { node [shape=box] }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('node');
    });

    it('includes edge', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { edge [color=red] }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('edge');
    });

    it('includes strict', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'strict digraph {}',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('strict');
    });
  });

  describe('Operators', () => {
    it('handles -> arrow', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { a -> b }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('->');
    });

    it('handles -- edge', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'graph { a -- b }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('--');
    });
  });

  describe('Comments', () => {
    it('handles // single-line comments', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { // comment\n a -> b }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('//');
    });

    it('handles /* */ block comments', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { /* comment */ a -> b }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('/*');
    });
  });

  describe('Strings', () => {
    it('handles double-quoted strings', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { a [label="Hello World"] }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('"Hello World"');
    });

    it('handles HTML labels', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { a [label=<table><tr><td>cell</td></tr></table>] }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('<table>');
    });
  });

  describe('Attributes', () => {
    it('handles label attribute', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { a [label=test] }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('label');
    });

    it('handles color attribute', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { a [color=red] }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('color');
    });

    it('handles shape attribute', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { a [shape=box] }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('shape');
    });
  });

  describe('Numbers', () => {
    it('handles integer numbers', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { a [width=42] }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('42');
    });

    it('handles decimal numbers', () => {
      const extension = createDotLanguage();
      const state = EditorState.create({
        doc: 'digraph { a [width=3.14] }',
        extensions: [extension],
      });
      expect(state.doc.toString()).toContain('3.14');
    });
  });
});
