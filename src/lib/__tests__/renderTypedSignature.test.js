// @ts-check
/**
 * renderTypedSignature.test.js (4VD-43 day 5 PR 2 follow-up)
 *
 * Pins the pure measurement helper that drives typed-signature
 * font-size selection. The canvas rendering itself is browser-only
 * and exercised by manual + e2e testing.
 */

import { describe, expect, it } from 'vitest';

import { pickFontSizeToFit, __TEST__ } from '../renderTypedSignature.js';

// ---------------------------------------------------------------------------
// Fake 2d context — `measureText` returns a width proportional to text
// length × font size. Mirrors the rough shape of real metrics (longer
// strings + bigger fonts = wider) without depending on a real DOM.
// ---------------------------------------------------------------------------

function fakeCtx() {
  return {
    font: '',
    measureText(s) {
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
      const px = m ? parseFloat(m[1]) : 16;
      // Approximate: each char is ~0.55 × font px wide. Close enough
      // for measurement-search tests.
      return { width: s.length * px * 0.55 };
    },
  };
}

describe('pickFontSizeToFit', () => {
  it('returns min when text is empty', () => {
    const ctx = fakeCtx();
    expect(pickFontSizeToFit(ctx, '', 500)).toBe(__TEST__.MIN_FONT_PX);
  });

  it('returns min when maxWidth is 0', () => {
    const ctx = fakeCtx();
    expect(pickFontSizeToFit(ctx, 'Jane Doe', 0)).toBe(__TEST__.MIN_FONT_PX);
  });

  it('selects MAX_FONT_PX when text fits comfortably at the cap', () => {
    const ctx = fakeCtx();
    // 'J' at 56px ≈ 30.8 px wide. 500 maxWidth is way wider → max clamps.
    const px = pickFontSizeToFit(ctx, 'J', 500);
    expect(px).toBe(__TEST__.MAX_FONT_PX);
  });

  it('shrinks below MAX for long names that overflow at cap size', () => {
    const ctx = fakeCtx();
    // 'A very long signature' = 21 chars. At 56px → 21 × 56 × 0.55 ≈ 647 wide.
    // maxWidth 540 → must shrink. Expected ≈ 540 / (21 × 0.55) ≈ 46.7 → 46
    // (floor).
    const px = pickFontSizeToFit(ctx, 'A very long signature', 540);
    expect(px).toBeLessThan(__TEST__.MAX_FONT_PX);
    expect(px).toBeGreaterThanOrEqual(__TEST__.MIN_FONT_PX);
    // At the returned size, the resulting width must be ≤ maxWidth.
    ctx.font = `italic ${px}px ignored`;
    expect(ctx.measureText('A very long signature').width).toBeLessThanOrEqual(540);
  });

  it('clamps to MIN_FONT_PX for very long names that would otherwise go below min', () => {
    const ctx = fakeCtx();
    // 200-char string at MIN_FONT_PX is 200 × 18 × 0.55 = 1980 wide.
    // maxWidth 100 → would want a sub-min font, but we clamp to MIN.
    const long = 'X'.repeat(200);
    const px = pickFontSizeToFit(ctx, long, 100);
    expect(px).toBe(__TEST__.MIN_FONT_PX);
  });

  it('respects opts.minPx / opts.maxPx overrides', () => {
    const ctx = fakeCtx();
    const px = pickFontSizeToFit(ctx, 'Hi', 500, { minPx: 12, maxPx: 30 });
    expect(px).toBeLessThanOrEqual(30);
    expect(px).toBeGreaterThanOrEqual(12);
  });

  it('returns an integer (floor) for deterministic font strings', () => {
    const ctx = fakeCtx();
    const px = pickFontSizeToFit(ctx, 'Jane Doe', 200);
    expect(Number.isInteger(px)).toBe(true);
  });

  it('mutates the passed ctx.font (side effect — caller must reset)', () => {
    // Documents the fact that binary-search probes set ctx.font; if the
    // caller doesn't reset it after fitting, the font from the LAST
    // probe iteration sticks. SignaturePad re-sets it before fillText.
    const ctx = fakeCtx();
    expect(ctx.font).toBe('');
    pickFontSizeToFit(ctx, 'Jane Doe', 200);
    expect(ctx.font).not.toBe('');
    expect(ctx.font).toMatch(/italic \d+(?:\.\d+)?px/);
  });
});

describe('FONT_STACK constants', () => {
  it('includes cursive as the final fallback', () => {
    expect(__TEST__.FONT_STACK).toMatch(/cursive$/);
  });

  it('MIN_FONT_PX < MAX_FONT_PX', () => {
    expect(__TEST__.MIN_FONT_PX).toBeLessThan(__TEST__.MAX_FONT_PX);
  });

  it('MIN_FONT_PX is readable on a 100px-tall canvas (≥ 16px)', () => {
    expect(__TEST__.MIN_FONT_PX).toBeGreaterThanOrEqual(16);
  });
});
