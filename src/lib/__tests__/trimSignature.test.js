// @ts-check
/**
 * trimSignature.test.js (4VD-43 day 5 PR 2 polish)
 *
 * Pin the pure RGBA-pixel helpers that drive signature trimming. The
 * canvas wrapper (trimSignatureCanvas) is browser-only and tested at
 * the e2e/manual level; these tests exercise the math on raw bytes so
 * regressions in the threshold/bbox logic are caught fast.
 */

import { describe, expect, it } from 'vitest';

import {
  findInkBoundingBox,
  padBoundingBox,
  convertNearWhiteToTransparent,
} from '../trimSignature.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Build a fully-white RGBA buffer of the given size, alpha 255.
 */
function makeWhiteCanvas(width, height) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255;
    pixels[i + 1] = 255;
    pixels[i + 2] = 255;
    pixels[i + 3] = 255;
  }
  return pixels;
}

/**
 * Paint a single pixel in an RGBA buffer.
 */
function paintPixel(pixels, width, x, y, [r, g, b, a = 255]) {
  const i = (y * width + x) * 4;
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
  pixels[i + 3] = a;
}

/**
 * Fill a rectangle in an RGBA buffer with the given RGB colour.
 */
function paintRect(pixels, width, x, y, w, h, rgb) {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      paintPixel(pixels, width, x + dx, y + dy, rgb);
    }
  }
}

// ---------------------------------------------------------------------------
// findInkBoundingBox
// ---------------------------------------------------------------------------

describe('findInkBoundingBox', () => {
  it('returns null on a fully-white canvas (empty signature)', () => {
    const pixels = makeWhiteCanvas(10, 10);
    expect(findInkBoundingBox(pixels, 10, 10)).toBe(null);
  });

  it('returns null when width or height is 0', () => {
    expect(findInkBoundingBox(new Uint8ClampedArray(0), 0, 10)).toBe(null);
    expect(findInkBoundingBox(new Uint8ClampedArray(0), 10, 0)).toBe(null);
  });

  it('returns null for null/undefined pixel input', () => {
    expect(findInkBoundingBox(null, 10, 10)).toBe(null);
    expect(findInkBoundingBox(undefined, 10, 10)).toBe(null);
  });

  it('locates a single dark pixel', () => {
    const pixels = makeWhiteCanvas(20, 20);
    paintPixel(pixels, 20, 7, 3, [0, 0, 0]);
    expect(findInkBoundingBox(pixels, 20, 20)).toEqual({
      x: 7,
      y: 3,
      w: 1,
      h: 1,
    });
  });

  it('locates a dark rectangle spanning (3,4) → (7,9)', () => {
    const pixels = makeWhiteCanvas(20, 20);
    paintRect(pixels, 20, 3, 4, 5, 6, [10, 20, 30]);
    expect(findInkBoundingBox(pixels, 20, 20)).toEqual({
      x: 3,
      y: 4,
      w: 5,
      h: 6,
    });
  });

  it('detects coloured (non-grey) ink via per-channel threshold', () => {
    // A blue stroke would have R=20, G=40, B=255 — only R and G are
    // below threshold. We use OR semantics so this counts as ink.
    const pixels = makeWhiteCanvas(20, 20);
    paintPixel(pixels, 20, 10, 10, [20, 40, 255]);
    expect(findInkBoundingBox(pixels, 20, 20)).toEqual({
      x: 10,
      y: 10,
      w: 1,
      h: 1,
    });
  });

  it('does NOT count near-white anti-alias edges as ink (default threshold 240)', () => {
    const pixels = makeWhiteCanvas(20, 20);
    paintPixel(pixels, 20, 5, 5, [245, 245, 245]); // above threshold → bg
    expect(findInkBoundingBox(pixels, 20, 20)).toBe(null);
  });

  it('threshold is configurable for stricter or looser ink detection', () => {
    const pixels = makeWhiteCanvas(20, 20);
    paintPixel(pixels, 20, 5, 5, [200, 200, 200]); // mid-grey
    // strict (threshold 180) → bg
    expect(findInkBoundingBox(pixels, 20, 20, 180)).toBe(null);
    // loose (threshold 230) → ink
    expect(findInkBoundingBox(pixels, 20, 20, 230)).toEqual({
      x: 5,
      y: 5,
      w: 1,
      h: 1,
    });
  });

  it('handles ink at canvas edges (no off-by-one)', () => {
    const pixels = makeWhiteCanvas(10, 10);
    paintPixel(pixels, 10, 0, 0, [0, 0, 0]);
    paintPixel(pixels, 10, 9, 9, [0, 0, 0]);
    expect(findInkBoundingBox(pixels, 10, 10)).toEqual({
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    });
  });
});

// ---------------------------------------------------------------------------
// padBoundingBox
// ---------------------------------------------------------------------------

describe('padBoundingBox', () => {
  it('adds uniform padding away from the edges', () => {
    expect(padBoundingBox({ x: 10, y: 20, w: 30, h: 40 }, 100, 100, 4)).toEqual({
      x: 6,
      y: 16,
      w: 38,
      h: 48,
    });
  });

  it('clamps left/top to 0 when padding would go negative', () => {
    expect(padBoundingBox({ x: 2, y: 1, w: 5, h: 5 }, 100, 100, 4)).toEqual({
      x: 0,
      y: 0,
      w: 11, // 7 + min(4, 2) = 7+4 = 11 ... actually width is right-x = (2+5+4)-0 = 11
      h: 10, // (1+5+4)-0 = 10
    });
  });

  it('clamps right/bottom to canvas extent when padding would overflow', () => {
    expect(padBoundingBox({ x: 95, y: 90, w: 4, h: 5 }, 100, 100, 10)).toEqual({
      x: 85,
      y: 80,
      w: 15, // min(100, 95+4+10)=100; 100-85=15
      h: 20, // min(100, 90+5+10)=100; 100-80=20
    });
  });

  it('default padding is 4 px', () => {
    expect(padBoundingBox({ x: 50, y: 50, w: 10, h: 10 }, 200, 200)).toEqual({
      x: 46,
      y: 46,
      w: 18,
      h: 18,
    });
  });
});

// ---------------------------------------------------------------------------
// convertNearWhiteToTransparent
// ---------------------------------------------------------------------------

describe('convertNearWhiteToTransparent', () => {
  it('sets alpha to 0 for all-white pixels', () => {
    const pixels = makeWhiteCanvas(2, 1);
    convertNearWhiteToTransparent(pixels);
    expect(pixels[3]).toBe(0); // pixel 0 alpha
    expect(pixels[7]).toBe(0); // pixel 1 alpha
  });

  it('leaves dark pixels fully opaque', () => {
    const pixels = makeWhiteCanvas(2, 1);
    paintPixel(pixels, 2, 0, 0, [0, 0, 0, 255]);
    convertNearWhiteToTransparent(pixels);
    expect(pixels[3]).toBe(255); // dark pixel alpha preserved
    expect(pixels[7]).toBe(0); // white pixel went transparent
  });

  it('keeps anti-aliased grey edges visible (preserves alpha for sub-threshold pixels)', () => {
    const pixels = makeWhiteCanvas(2, 1);
    paintPixel(pixels, 2, 0, 0, [220, 220, 220, 255]); // grey edge
    convertNearWhiteToTransparent(pixels); // threshold default 240
    expect(pixels[3]).toBe(255); // grey edge kept (below threshold)
  });

  it('threshold parameter controls strictness', () => {
    // Pixel A: mid-grey (200,200,200)
    const pixA = makeWhiteCanvas(1, 1);
    paintPixel(pixA, 1, 0, 0, [200, 200, 200, 255]);
    // High threshold (240): (200,200,200) has all channels BELOW 240,
    // so it is preserved as opaque ink. This is the production default.
    convertNearWhiteToTransparent(pixA, 240);
    expect(pixA[3]).toBe(255);

    // Pixel B: same mid-grey
    const pixB = makeWhiteCanvas(1, 1);
    paintPixel(pixB, 1, 0, 0, [200, 200, 200, 255]);
    // Loose threshold (180): all channels ≥ 180, so the function
    // treats this as background and zeroes alpha.
    convertNearWhiteToTransparent(pixB, 180);
    expect(pixB[3]).toBe(0);
  });

  it('handles null pixels gracefully (no throw)', () => {
    expect(() => convertNearWhiteToTransparent(null)).not.toThrow();
    expect(() => convertNearWhiteToTransparent(undefined)).not.toThrow();
  });
});
