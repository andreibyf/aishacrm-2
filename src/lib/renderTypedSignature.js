// @ts-check
/**
 * renderTypedSignature (4VD-43 day 5 PR 2 follow-up).
 *
 * Pure-ish helper that renders a recipient-typed name onto a canvas in
 * a script/cursive font, then returns the canvas. The output is shaped
 * identically to a hand-drawn signature pad canvas: same dimensions,
 * dark strokes on white background, ready for the trim + transparency
 * pipeline in trimSignature.js.
 *
 * Why a separate file: keeps the rendering decisions auditable (font
 * fallback chain, max-fit-text sizing logic) and lets us swap to a
 * self-hosted Caveat / Dancing Script font in v2 without touching
 * SignaturePad component code.
 *
 * Browser-only (uses <canvas> + 2d context). The pure measurement
 * helper `pickFontSizeToFit` is exported separately so it's testable
 * without a DOM.
 */

/**
 * Cursive-style font stack. We don't ship a web font — the chain
 * tries common pre-installed script/handwriting fonts in priority
 * order. Most recipients will get at least one match; users without
 * any script font installed (rare) fall back to system "cursive"
 * which OSes provide via different defaults (Chalkduster, Comic
 * Sans, etc.). Acceptable degradation for v1.
 *
 * Order rationale:
 *   - Brush Script MT: ships with macOS + every modern Word install
 *   - Lucida Handwriting: widely available on Windows
 *   - Segoe Script: Windows 7+
 *   - Apple Chancery: macOS
 *   - Snell Roundhand: macOS
 *   - cursive: generic fallback
 */
const FONT_STACK = [
  '"Brush Script MT"',
  '"Lucida Handwriting"',
  '"Segoe Script"',
  '"Apple Chancery"',
  '"Snell Roundhand"',
  'cursive',
].join(', ');

/**
 * Maximum font size we'll render at (in pixels). Past this the
 * signature starts looking like a heading. Empirically 56px on a
 * 100px-tall canvas leaves comfortable padding above + below.
 */
const MAX_FONT_PX = 56;

/**
 * Minimum readable size. Below this the signature is illegible after
 * aspect-fitting into a signing field box.
 */
const MIN_FONT_PX = 18;

/**
 * Find the largest font size (in pixels) at which `text` fits inside
 * `maxWidth` pixels using the given font stack on the given 2d context.
 * Bisects between MIN_FONT_PX and MAX_FONT_PX.
 *
 * Pure-ish: depends on the canvas 2d context's `measureText` for width,
 * but does not draw anything. Exported for tests that pass in a fake
 * context.
 *
 * @param {{ measureText: (s: string) => { width: number }, font?: string }} ctx
 * @param {string} text
 * @param {number} maxWidth   pixels
 * @param {object} [opts]
 * @param {number} [opts.minPx]
 * @param {number} [opts.maxPx]
 * @param {string} [opts.fontStack]
 * @returns {number}          pixel font size that fits, clamped to [minPx, maxPx]
 */
export function pickFontSizeToFit(ctx, text, maxWidth, opts = {}) {
  const minPx = opts.minPx ?? MIN_FONT_PX;
  const maxPx = opts.maxPx ?? MAX_FONT_PX;
  const fontStack = opts.fontStack ?? FONT_STACK;
  if (!text || maxWidth <= 0) return minPx;

  // Fast path: if max already fits, no need to binary search — the
  // search would converge to max-epsilon and Math.floor would give
  // max-1. Saves a font-string set + measureText call too.
  ctx.font = `italic ${maxPx}px ${fontStack}`;
  if (ctx.measureText(text).width <= maxWidth) {
    return maxPx;
  }

  // Symmetric: if even min overflows, return min (clamped).
  ctx.font = `italic ${minPx}px ${fontStack}`;
  if (ctx.measureText(text).width > maxWidth) {
    return minPx;
  }

  let lo = minPx;
  let hi = maxPx;
  // Binary search for the largest size that fits. measureText is cheap;
  // 10-12 iterations gets us to sub-pixel precision.
  for (let i = 0; i < 12; i += 1) {
    const mid = (lo + hi) / 2;
    ctx.font = `italic ${mid}px ${fontStack}`;
    const m = ctx.measureText(text);
    if (m.width <= maxWidth) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  // lo is the largest size known to fit. Clamp + integer-floor so the
  // resulting canvas font string is deterministic across browsers.
  return Math.max(minPx, Math.min(maxPx, Math.floor(lo)));
}

/**
 * Render `text` centered on a new canvas of `widthPx × heightPx` in
 * a cursive font. Returns the canvas. Caller is responsible for
 * downstream processing (trim, toDataURL, etc.).
 *
 * Browser-only. Returns null in non-browser environments.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.widthPx]    default 600
 * @param {number} [opts.heightPx]   default 100
 * @param {string} [opts.color]      default '#0f172a'
 * @returns {HTMLCanvasElement|null}
 */
export function renderTypedSignatureCanvas(text, opts = {}) {
  if (typeof document === 'undefined') return null;
  const widthPx = opts.widthPx ?? 600;
  const heightPx = opts.heightPx ?? 100;
  const color = opts.color ?? '#0f172a';
  const trimmed = String(text || '').trim();

  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // White background matching the drawn-signature pad so the trim +
  // transparency pipeline behaves identically across both modes.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);

  if (!trimmed) return canvas;

  // Pick the largest size that fits horizontally within 90% of width
  // (10% padding on each side). The italic + cursive font means tail
  // strokes (g/j/y) and ascenders (h/k/l) can extend slightly past
  // the measured width; the padding absorbs that.
  const targetMaxWidth = widthPx * 0.9;
  const fontPx = pickFontSizeToFit(ctx, trimmed, targetMaxWidth);

  ctx.font = `italic ${fontPx}px ${FONT_STACK}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(trimmed, widthPx / 2, heightPx / 2);

  return canvas;
}

export const __TEST__ = {
  FONT_STACK,
  MIN_FONT_PX,
  MAX_FONT_PX,
};
