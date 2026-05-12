// @ts-check
/**
 * trimSignature (4VD-43 day 5 PR 2 polish).
 *
 * Helpers to tightly crop a signature-pad canvas to just the inked
 * region, with the white background converted to alpha 0. Without this,
 * pdf-lib's aspect-fit in signPdf.js sees a ~480x160 canvas where the
 * actual stroke maybe occupies 200x60 — and shrinks the whole thing into
 * the field box, leaving a small signature inside a lot of empty white.
 *
 * Pipeline:
 *   1. findInkBoundingBox(pixels, w, h, threshold) → { x, y, w, h } |
 *      null. Pure — testable on raw Uint8ClampedArray.
 *   2. cropAndAlphaCanvas(canvas, bbox, padding) → returns a new <canvas>
 *      that is bbox-sized, with the bbox region copied across, and any
 *      pixel above `threshold` for all three RGB channels converted to
 *      alpha 0. Browser-only (uses <canvas>).
 *   3. trimSignatureCanvas(canvas, opts) → orchestrator that wires (1) +
 *      (2) together. If no ink is found returns the canvas untouched.
 *
 * Threshold = 240 is the default — accommodates anti-aliased grey edges
 * around dark strokes (the stroke is #0f172a which is near-black, so
 * anti-aliased neighbours fall in the 30–230 range; only pixels in the
 * 240–255 range count as background).
 */

const DEFAULT_THRESHOLD = 240;
const DEFAULT_PADDING = 4;

/**
 * Scan RGBA pixel data for the bounding box of non-background pixels.
 *
 * @param {Uint8ClampedArray|Uint8Array|number[]} pixels  RGBA, row-major
 * @param {number} width
 * @param {number} height
 * @param {number} [threshold]  RGB value at/above which a pixel counts as background
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 *          null when no ink found (the recipient saved an empty canvas).
 */
export function findInkBoundingBox(pixels, width, height, threshold = DEFAULT_THRESHOLD) {
  if (!pixels || width <= 0 || height <= 0) return null;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      // Non-background = ANY channel is below threshold. We use OR not AND
      // because an anti-aliased grey pixel might have (220, 220, 220) — all
      // three below threshold — but a coloured pen could have (10, 200, 10),
      // and we want to catch coloured signatures too.
      if (r < threshold || g < threshold || b < threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}

/**
 * Apply a small uniform padding to a bbox, clamped to the canvas extent.
 *
 * @param {{ x: number, y: number, w: number, h: number }} bbox
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {number} [padding]
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function padBoundingBox(bbox, canvasW, canvasH, padding = DEFAULT_PADDING) {
  const x = Math.max(0, bbox.x - padding);
  const y = Math.max(0, bbox.y - padding);
  const right = Math.min(canvasW, bbox.x + bbox.w + padding);
  const bottom = Math.min(canvasH, bbox.y + bbox.h + padding);
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * Mutate RGBA pixel data in place: any pixel with R/G/B all at/above
 * `threshold` is set to alpha 0 (transparent). Anti-aliased greys
 * around the stroke retain their alpha so the visible edge stays smooth.
 *
 * Exported for unit-testing without a canvas. The canvas wrapper below
 * just calls this on the cropped region's ImageData.
 *
 * @param {Uint8ClampedArray|Uint8Array|number[]} pixels  RGBA, row-major
 * @param {number} [threshold]
 * @returns {void}
 */
export function convertNearWhiteToTransparent(pixels, threshold = DEFAULT_THRESHOLD) {
  if (!pixels) return;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      pixels[i + 3] = 0;
    }
  }
}

/**
 * Browser-only orchestrator. Reads pixel data off the source canvas,
 * computes the ink bounding box (with padding), and returns a NEW canvas
 * of that bbox size whose pixels are the original-region copy with
 * near-white converted to transparent.
 *
 * Falls back to returning the input canvas unchanged when:
 *  - we're not in a browser (no document)
 *  - no ink was found (recipient saved an empty pad)
 *
 * The fallback is deliberate: callers should not have to special-case
 * the empty path beyond "signature data URL is missing or empty."
 *
 * @param {HTMLCanvasElement} srcCanvas
 * @param {{ threshold?: number, padding?: number }} [opts]
 * @returns {HTMLCanvasElement}
 */
export function trimSignatureCanvas(srcCanvas, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const padding = opts.padding ?? DEFAULT_PADDING;
  if (typeof document === 'undefined' || !srcCanvas) return srcCanvas;
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) return srcCanvas;

  const srcImage = srcCtx.getImageData(0, 0, w, h);
  const bbox = findInkBoundingBox(srcImage.data, w, h, threshold);
  if (!bbox) return srcCanvas;
  const padded = padBoundingBox(bbox, w, h, padding);

  const out = document.createElement('canvas');
  out.width = padded.w;
  out.height = padded.h;
  const outCtx = out.getContext('2d');
  if (!outCtx) return srcCanvas;
  outCtx.drawImage(srcCanvas, padded.x, padded.y, padded.w, padded.h, 0, 0, padded.w, padded.h);
  const outImage = outCtx.getImageData(0, 0, padded.w, padded.h);
  convertNearWhiteToTransparent(outImage.data, threshold);
  outCtx.putImageData(outImage, 0, 0);
  return out;
}
