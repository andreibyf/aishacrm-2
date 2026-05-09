// @ts-check
/**
 * signingFieldCoords.test.js (4VD-43)
 *
 * Pin the browser-pixel ↔ signing-engine-normalized contract. Run via Vitest
 * in the frontend suite; also runnable via `node --test` because the imported
 * module is pure ESM with no DOM dependencies.
 */

import { describe, expect, it } from 'vitest';

import {
  pixelToNormalized,
  normalizedToPixel,
  builderFieldToSigning,
  buildSigningFieldsPayload,
  __FIELD_TYPES__,
} from '../signingFieldCoords.js';

const PAGE_A = { widthPx: 800, heightPx: 1000 };
const PAGE_B = { widthPx: 612, heightPx: 792 }; // US Letter at 72dpi

// ----------------------------------------------------------------------------
// pixelToNormalized
// ----------------------------------------------------------------------------

describe('pixelToNormalized', () => {
  it('top-left field maps to {x:0, y:0}', () => {
    const out = pixelToNormalized({ page: 0, x: 0, y: 0, w: 100, h: 50 }, PAGE_A);
    expect(out).toEqual({ page: 0, x: 0, y: 0, w: 0.125, h: 0.05 });
  });

  it('field anchored bottom-right maps to its corresponding normalized fraction', () => {
    const out = pixelToNormalized({ page: 1, x: 600, y: 900, w: 200, h: 100 }, PAGE_A);
    expect(out.page).toBe(1);
    expect(out.x).toBeCloseTo(0.75, 6);
    expect(out.y).toBeCloseTo(0.9, 6);
    expect(out.w).toBeCloseTo(0.25, 6);
    expect(out.h).toBeCloseTo(0.1, 6);
  });

  it('does NOT y-flip — both systems are top-left', () => {
    // If a Y-flip were happening, a box at y=0 would land at y≈0.95 with h=0.05.
    const out = pixelToNormalized({ page: 0, x: 0, y: 0, w: 800, h: 50 }, PAGE_A);
    expect(out.y).toBe(0);
  });

  it('rejects zero-size boxes', () => {
    expect(() => pixelToNormalized({ page: 0, x: 10, y: 10, w: 0, h: 50 }, PAGE_A)).toThrow(
      /box w\/h must be positive/,
    );
  });

  it('rejects out-of-bounds boxes (>0.5px slack)', () => {
    expect(() =>
      pixelToNormalized({ page: 0, x: 0, y: 0, w: 1000, h: 1000 }, PAGE_A),
    ).toThrow(/extends past page bounds/);
  });

  it('tolerates ≤0.5px sub-pixel overshoot from react-rnd rounding', () => {
    // 800.4 vs 800 width — within slack; 1000.4 vs 1000 height — within slack
    const out = pixelToNormalized({ page: 0, x: 0.4, y: 0.4, w: 800, h: 1000 }, PAGE_A);
    expect(out.w).toBeLessThanOrEqual(1);
    expect(out.h).toBeLessThanOrEqual(1);
  });

  it('rejects non-integer page numbers', () => {
    expect(() => pixelToNormalized({ page: 1.5, x: 0, y: 0, w: 10, h: 10 }, PAGE_A)).toThrow(
      /box.page/,
    );
  });

  it('rejects negative coords', () => {
    expect(() =>
      pixelToNormalized({ page: 0, x: -5, y: 10, w: 100, h: 100 }, PAGE_A),
    ).toThrow(/non-negative/);
  });

  it('rejects non-finite numbers (NaN, Infinity)', () => {
    expect(() =>
      pixelToNormalized({ page: 0, x: NaN, y: 10, w: 10, h: 10 }, PAGE_A),
    ).toThrow(/finite number/);
    expect(() =>
      pixelToNormalized({ page: 0, x: 10, y: 10, w: Infinity, h: 10 }, PAGE_A),
    ).toThrow(/finite number/);
  });
});

// ----------------------------------------------------------------------------
// normalizedToPixel — round-trip
// ----------------------------------------------------------------------------

describe('normalizedToPixel', () => {
  it('round-trips with pixelToNormalized', () => {
    const original = { page: 2, x: 137.5, y: 412.0, w: 245.5, h: 64.0 };
    const norm = pixelToNormalized(original, PAGE_B);
    const back = normalizedToPixel(norm, PAGE_B);
    expect(back.page).toBe(2);
    expect(back.x).toBeCloseTo(original.x, 5);
    expect(back.y).toBeCloseTo(original.y, 5);
    expect(back.w).toBeCloseTo(original.w, 5);
    expect(back.h).toBeCloseTo(original.h, 5);
  });

  it('rejects normalized values outside [0,1]', () => {
    expect(() =>
      normalizedToPixel({ page: 0, x: 1.1, y: 0, w: 0.1, h: 0.1 }, PAGE_A),
    ).toThrow(/area.x must be in/);
    expect(() =>
      normalizedToPixel({ page: 0, x: 0, y: -0.01, w: 0.1, h: 0.1 }, PAGE_A),
    ).toThrow(/area.y must be in/);
  });
});

// ----------------------------------------------------------------------------
// builderFieldToSigning
// ----------------------------------------------------------------------------

describe('builderFieldToSigning', () => {
  const dims = new Map([
    [0, PAGE_A],
    [1, PAGE_B],
  ]);

  it('builds a signature field with required=true by default', () => {
    const out = builderFieldToSigning(
      {
        type: 'signature',
        name: 'signer1_signature',
        box: { page: 0, x: 100, y: 200, w: 300, h: 80 },
      },
      dims,
    );
    expect(out.type).toBe('signature');
    expect(out.required).toBe(true);
    expect(out.role).toBe('First Party');
    expect(out.areas).toHaveLength(1);
    expect(out.areas[0].page).toBe(0);
  });

  it('builds a text field with required=false by default', () => {
    const out = builderFieldToSigning(
      {
        type: 'text',
        name: 'company',
        box: { page: 0, x: 0, y: 0, w: 100, h: 30 },
      },
      dims,
    );
    expect(out.required).toBe(false);
  });

  it('honors explicit required override', () => {
    const out = builderFieldToSigning(
      {
        type: 'text',
        name: 'company',
        required: true,
        box: { page: 0, x: 0, y: 0, w: 100, h: 30 },
      },
      dims,
    );
    expect(out.required).toBe(true);
  });

  it('honors explicit role', () => {
    const out = builderFieldToSigning(
      {
        type: 'date',
        name: 'witness_date',
        role: 'Witness',
        box: { page: 1, x: 0, y: 0, w: 100, h: 30 },
      },
      dims,
    );
    expect(out.role).toBe('Witness');
    expect(out.areas[0].page).toBe(1);
  });

  it('rejects unknown field types', () => {
    expect(() =>
      builderFieldToSigning(
        {
          type: /** @type {any} */ ('initials'),
          name: 'x',
          box: { page: 0, x: 0, y: 0, w: 10, h: 10 },
        },
        dims,
      ),
    ).toThrow(/unsupported field type/);
  });

  it('rejects empty field names', () => {
    expect(() =>
      builderFieldToSigning(
        {
          type: 'text',
          name: '   ',
          box: { page: 0, x: 0, y: 0, w: 10, h: 10 },
        },
        dims,
      ),
    ).toThrow(/non-empty string/);
  });

  it('rejects fields placed on a page with no registered dims', () => {
    expect(() =>
      builderFieldToSigning(
        {
          type: 'text',
          name: 'foo',
          box: { page: 99, x: 0, y: 0, w: 10, h: 10 },
        },
        dims,
      ),
    ).toThrow(/no pageDims registered/);
  });
});

// ----------------------------------------------------------------------------
// buildSigningFieldsPayload
// ----------------------------------------------------------------------------

describe('buildSigningFieldsPayload', () => {
  const dims = new Map([[0, PAGE_A]]);

  it('processes multiple fields and preserves order', () => {
    const out = buildSigningFieldsPayload(
      [
        { type: 'name', name: 'a', box: { page: 0, x: 0, y: 0, w: 50, h: 30 } },
        { type: 'email', name: 'b', box: { page: 0, x: 0, y: 50, w: 50, h: 30 } },
      ],
      dims,
    );
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.name)).toEqual(['a', 'b']);
  });

  it('rejects empty fields array', () => {
    expect(() => buildSigningFieldsPayload([], dims)).toThrow(/must not be empty/);
  });

  it('rejects duplicate field names (signing engine addresses values by name)', () => {
    expect(() =>
      buildSigningFieldsPayload(
        [
          { type: 'text', name: 'sig', box: { page: 0, x: 0, y: 0, w: 50, h: 30 } },
          { type: 'signature', name: 'sig', box: { page: 0, x: 0, y: 50, w: 50, h: 30 } },
        ],
        dims,
      ),
    ).toThrow(/duplicate field name/);
  });

  it('rejects non-array input', () => {
    expect(() => buildSigningFieldsPayload(/** @type {any} */ ('not an array'), dims)).toThrow(
      /must be an array/,
    );
  });

  it('rejects non-Map pageDimsByPage', () => {
    expect(() =>
      buildSigningFieldsPayload(
        [{ type: 'text', name: 'a', box: { page: 0, x: 0, y: 0, w: 50, h: 30 } }],
        /** @type {any} */ ({ 0: PAGE_A }),
      ),
    ).toThrow(/Map/);
  });
});

// ----------------------------------------------------------------------------
// FIELD_TYPES contract
// ----------------------------------------------------------------------------

describe('FIELD_TYPES (frozen contract per 4VD-43 v1 scope)', () => {
  it('matches the v1 scope exactly', () => {
    expect(__FIELD_TYPES__).toEqual(['name', 'email', 'signature', 'date', 'text', 'checkbox']);
  });
});
