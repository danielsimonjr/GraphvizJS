/**
 * Headless PNG export via @resvg/resvg-js.
 *
 * Reproduces the app's old browser canvas/Image/Blob PNG behavior
 * (white background + minimum-dimension upscaling) without a DOM, so it
 * runs in Node (CLI, tests) as well as the browser main process.
 *
 * `@resvg/resvg-js` is a native module, loaded lazily on first use so that
 * importing `core/export` for render/validate/format (and bundling the CLI into
 * a standalone exe) never pulls the native binary.
 */

const PNG_MIN_BASE = 512;
const PNG_MIN_DOUBLE = 1024;

/**
 * Rasterize a (normalized) SVG string to PNG bytes with a white background
 * and minimum-dimension upscaling — reproduces the app's canvas PNG export
 * behavior headless.
 *
 * @param svg - Normalized SVG markup (see `normalizeSvg`).
 * @param width - SVG width in user units.
 * @param height - SVG height in user units.
 * @param scale - Export scale: `1` for @1x, `2` for @2x.
 */
export async function toPngBytes(
  svg: string,
  width: number,
  height: number,
  scale: 1 | 2
): Promise<Uint8Array> {
  const { Resvg } = await import('@resvg/resvg-js');
  const minDimension = scale > 1 ? PNG_MIN_DOUBLE : PNG_MIN_BASE;
  const requiredScale = Math.max(scale, minDimension / width, minDimension / height);
  const exportWidth = Math.max(1, Math.round(width * requiredScale));
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: exportWidth },
    background: '#ffffff',
  })
    .render()
    .asPng();
  return new Uint8Array(png);
}
