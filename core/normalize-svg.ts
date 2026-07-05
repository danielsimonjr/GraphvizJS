/**
 * Pure string-based SVG normalization.
 *
 * Graphviz SVG output always carries `viewBox` and `width`/`height` on the
 * root `<svg>` element. This module derives dimensions from those attributes
 * and applies padding by rewriting the root tag's attributes directly on the
 * string — no DOM (`getBBox`/`XMLSerializer`) required, so it works headless
 * (CLI, Node, workers).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Result of normalizing an SVG: the rewritten markup plus its padded dimensions. */
export interface NormalizedSvg {
  svg: string;
  width: number;
  height: number;
}

/**
 * Sanitize a parsed dimension: non-finite or non-positive values collapse to 1
 * so downstream consumers (canvas sizing, PDF export) never divide by zero or
 * receive NaN/Infinity.
 */
function sanitize(value: number): number {
  return !Number.isFinite(value) || value <= 0 ? 1 : value;
}

/** Read a numeric attribute (e.g. `width="100pt"`) from an opening tag, stripping units. */
function readDimensionAttr(openingTag: string, name: string): number | null {
  const match = openingTag.match(new RegExp(`\\b${name}="([\\d.]+)`, 'i'));
  if (!match) {
    return null;
  }
  const value = Number.parseFloat(match[1]);
  return Number.isNaN(value) ? null : value;
}

/**
 * Normalize a Graphviz SVG string: apply padding around the content and
 * rewrite the root `<svg>` tag's `width`/`height`/`viewBox`/
 * `preserveAspectRatio`/`xmlns` attributes, removing any root `x`/`y`.
 *
 * @param svg - Raw SVG markup produced by Graphviz.
 * @param padding - Padding (in user units) added on all sides. Defaults to 10.
 */
export function normalizeSvg(svg: string, padding = 10): NormalizedSvg {
  const tagMatch = svg.match(/<svg\b[^>]*>/i);
  if (!tagMatch) {
    throw new Error('Invalid SVG: no <svg> root');
  }
  const openingTag = tagMatch[0];

  let minX = 0;
  let minY = 0;
  let width = 0;
  let height = 0;

  const viewBoxMatch = openingTag.match(/\bviewBox="([^"]*)"/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number.parseFloat);
    [minX, minY, width, height] = parts;
  } else {
    width = readDimensionAttr(openingTag, 'width') ?? 0;
    height = readDimensionAttr(openingTag, 'height') ?? 0;
  }

  const paddedWidth = sanitize(width) + padding * 2;
  const paddedHeight = sanitize(height) + padding * 2;
  const paddedMinX = (Number.isFinite(minX) ? minX : 0) - padding;
  const paddedMinY = (Number.isFinite(minY) ? minY : 0) - padding;

  // Strip attributes we are about to re-set, so the canonical set below wins
  // and isn't duplicated. `xmlns:xlink` must survive — only drop plain `xmlns`.
  let attrs = openingTag
    .slice('<svg'.length, -1) // strip leading "<svg" and trailing ">"
    .replace(/\s+(width|height|viewBox|preserveAspectRatio|x|y)="[^"]*"/gi, '')
    .replace(/\s+xmlns="[^"]*"/i, '');

  attrs +=
    ` xmlns="${SVG_NS}"` +
    ` width="${paddedWidth}"` +
    ` height="${paddedHeight}"` +
    ` viewBox="${paddedMinX} ${paddedMinY} ${paddedWidth} ${paddedHeight}"` +
    ` preserveAspectRatio="xMidYMid meet"`;

  const rebuiltTag = `<svg${attrs}>`;
  const rewritten =
    svg.slice(0, tagMatch.index) + rebuiltTag + svg.slice(tagMatch.index! + openingTag.length);

  return { svg: rewritten, width: paddedWidth, height: paddedHeight };
}
