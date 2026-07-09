/** DOT attribute catalog — contexts (which statement types accept an attribute), value type,
 * and (for enum attributes) the value domain. Transcribed from the canonical Graphviz
 * attributes table (https://graphviz.org/doc/info/attrs.html, "Used By" column).
 *
 * This is the shared foundation for semantic lint and future IntelliSense/inspector features.
 * Attributes not present here simply get no value/context checks. */

export type AttrContext = 'graph' | 'node' | 'edge' | 'cluster' | 'subgraph';
export type AttrType = 'enum' | 'color' | 'int' | 'double' | 'bool' | 'string' | 'point' | 'other';

export interface DotAttributeSpec {
  name: string;
  contexts: AttrContext[];
  type: AttrType;
  values?: string[];
  default?: string;
}

// The full standard Graphviz node-shape list (https://graphviz.org/doc/info/shapes.html) —
// polygon-based shapes plus the record shapes. Deliberately exhaustive: an incomplete list
// here is what causes nearest() to misflag a valid-but-unlisted shape (e.g. Mdiamond, rect)
// as a typo of a listed one it happens to sit edit-distance <=2 from.
const SHAPE_VALUES = [
  'box',
  'polygon',
  'ellipse',
  'oval',
  'circle',
  'point',
  'egg',
  'triangle',
  'plaintext',
  'plain',
  'diamond',
  'trapezium',
  'parallelogram',
  'house',
  'pentagon',
  'hexagon',
  'septagon',
  'octagon',
  'doublecircle',
  'doubleoctagon',
  'invtriangle',
  'invtrapezium',
  'invhouse',
  'Mdiamond',
  'Msquare',
  'Mcircle',
  'rect',
  'rectangle',
  'square',
  'star',
  'none',
  'underline',
  'cylinder',
  'note',
  'tab',
  'folder',
  'box3d',
  'component',
  'promoter',
  'cds',
  'terminator',
  'utr',
  'primersite',
  'restrictionsite',
  'fivepoverhang',
  'threepoverhang',
  'noverhang',
  'assembly',
  'signature',
  'insulator',
  'ribosite',
  'rnastab',
  'proteasesite',
  'proteinstab',
  'rpromoter',
  'rarrow',
  'larrow',
  'lpromoter',
  'record',
  'Mrecord',
];

const STYLE_VALUES = [
  'filled',
  'invisible',
  'invis',
  'diagonals',
  'rounded',
  'dashed',
  'dotted',
  'solid',
  'bold',
  'wedged',
  'striped',
  'radial',
  'tapered',
];

const ARROW_VALUES = [
  'normal',
  'inv',
  'dot',
  'invdot',
  'odot',
  'invodot',
  'none',
  'tee',
  'empty',
  'diamond',
  'ediamond',
  'box',
  'open',
  'crow',
  'vee',
];

export const DOT_ATTRIBUTE_CATALOG: readonly DotAttributeSpec[] = [
  // --- Enum attributes (value domains served to the renderer over the dot:vocabulary IPC) ---
  { name: 'shape', contexts: ['node'], type: 'enum', values: SHAPE_VALUES },
  {
    name: 'style',
    contexts: ['edge', 'node', 'graph', 'cluster'],
    type: 'enum',
    values: STYLE_VALUES,
  },
  { name: 'rankdir', contexts: ['graph'], type: 'enum', values: ['TB', 'LR', 'BT', 'RL'] },
  { name: 'dir', contexts: ['edge'], type: 'enum', values: ['forward', 'back', 'both', 'none'] },
  { name: 'arrowhead', contexts: ['edge'], type: 'enum', values: ARROW_VALUES },
  { name: 'arrowtail', contexts: ['edge'], type: 'enum', values: ARROW_VALUES },
  {
    name: 'rank',
    contexts: ['subgraph'],
    type: 'enum',
    values: ['same', 'min', 'source', 'max', 'sink'],
  },
  {
    name: 'splines',
    contexts: ['graph'],
    type: 'enum',
    values: ['true', 'false', 'none', 'line', 'polyline', 'curved', 'ortho', 'spline', ''],
  },
  // `overlap` accepts an open-ended value space in real Graphviz (bool keywords, `scale`,
  // `scalexy`, `prism[n]`, `voronoi`, `vpsc`, `ortho[_yx]`, `compress`, `ipsep`, plus raw
  // numeric scaling factors) that a small enum table can't enumerate without either being
  // wrong (missing values) or unbounded. Typed 'other' so invalid-value never checks it —
  // a missed lint here is an acceptable false-negative; false-flagging a valid value is not.
  { name: 'overlap', contexts: ['graph'], type: 'other' },
  // `ratio` likewise accepts numeric aspect-ratio values in addition to the keyword forms
  // (fill/compress/expand/auto) — see the `overlap` rationale above.
  { name: 'ratio', contexts: ['graph'], type: 'other' },
  {
    name: 'clusterrank',
    contexts: ['graph'],
    type: 'enum',
    values: ['local', 'global', 'none'],
  },
  {
    name: 'outputorder',
    contexts: ['graph'],
    type: 'enum',
    values: ['breadthfirst', 'nodesfirst', 'edgesfirst'],
  },

  // --- Color attributes ---
  { name: 'color', contexts: ['node', 'edge', 'cluster'], type: 'color' },
  { name: 'fillcolor', contexts: ['node', 'edge', 'cluster'], type: 'color' },
  { name: 'bgcolor', contexts: ['graph', 'cluster'], type: 'color' },
  { name: 'fontcolor', contexts: ['graph', 'node', 'edge', 'cluster'], type: 'color' },
  { name: 'pencolor', contexts: ['cluster'], type: 'color' },

  // --- Common non-enum attributes ---
  { name: 'label', contexts: ['graph', 'node', 'edge', 'cluster'], type: 'string' },
  { name: 'fontname', contexts: ['graph', 'node', 'edge', 'cluster'], type: 'string' },
  { name: 'fontsize', contexts: ['graph', 'node', 'edge', 'cluster'], type: 'double' },
  { name: 'penwidth', contexts: ['node', 'edge', 'cluster'], type: 'double' },
  { name: 'weight', contexts: ['edge'], type: 'int' },
  { name: 'constraint', contexts: ['edge'], type: 'bool' },
  { name: 'lhead', contexts: ['edge'], type: 'string' },
  { name: 'ltail', contexts: ['edge'], type: 'string' },
  { name: 'peripheries', contexts: ['node', 'cluster'], type: 'int' },
  { name: 'sides', contexts: ['node'], type: 'int' },
  { name: 'nodesep', contexts: ['graph'], type: 'double' },
  { name: 'ranksep', contexts: ['graph'], type: 'string' },
  { name: 'width', contexts: ['node'], type: 'double' },
  { name: 'height', contexts: ['node'], type: 'double' },
  { name: 'arrowsize', contexts: ['edge'], type: 'double' },
  { name: 'colorscheme', contexts: ['graph', 'node', 'edge', 'cluster'], type: 'string' },
  { name: 'comment', contexts: ['edge', 'node', 'graph'], type: 'string' },
  { name: 'compound', contexts: ['graph'], type: 'bool' },
  { name: 'fixedsize', contexts: ['node'], type: 'bool' },
  { name: 'group', contexts: ['node'], type: 'string' },
  { name: 'headlabel', contexts: ['edge'], type: 'string' },
  { name: 'taillabel', contexts: ['edge'], type: 'string' },
  { name: 'href', contexts: ['graph', 'cluster', 'node', 'edge'], type: 'string' },
  { name: 'URL', contexts: ['graph', 'cluster', 'node', 'edge'], type: 'string' },
  { name: 'tooltip', contexts: ['node', 'edge', 'graph', 'cluster'], type: 'string' },
  { name: 'id', contexts: ['graph', 'cluster', 'node', 'edge'], type: 'string' },
  { name: 'image', contexts: ['node'], type: 'string' },
  { name: 'labelloc', contexts: ['node', 'graph', 'cluster'], type: 'string' },
  { name: 'landscape', contexts: ['graph'], type: 'bool' },
  { name: 'layer', contexts: ['edge', 'node', 'cluster'], type: 'string' },
  { name: 'margin', contexts: ['node', 'cluster', 'graph'], type: 'double' },
  { name: 'minlen', contexts: ['edge'], type: 'int' },
  { name: 'pos', contexts: ['edge', 'node'], type: 'point' },
  { name: 'size', contexts: ['graph'], type: 'point' },
  { name: 'xlabel', contexts: ['edge', 'node'], type: 'string' },
];

export function findAttribute(name: string): DotAttributeSpec | undefined {
  const lower = name.toLowerCase();
  return DOT_ATTRIBUTE_CATALOG.find((s) => s.name.toLowerCase() === lower);
}
