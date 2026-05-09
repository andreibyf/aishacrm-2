// @ts-check
/**
 * templates.test.js (4VD-43 day 1)
 *
 * Pure-validator tests for the new in-house eSign template route.
 * Route-level integration tests (with mocked Supabase + Storage) are deferred
 * to day 6 of 4VD-43 — these tests pin the wire-format and tenant-isolation
 * contracts that the integration tests will rely on.
 *
 * Run with:
 *   cd backend && node --test __tests__/routes/templates.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateSigningFields,
  validateTemplateInput,
  buildTemplateStorageKey,
} from '../../routes/templates.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Minimal valid PDF header — `%PDF-` + a few bytes — base64 encoded.
const MINIMAL_PDF_BASE64 = Buffer.from('%PDF-1.4\n1 0 obj\n', 'utf8').toString(
  'base64',
);

const VALID_FIELD = {
  name: 'sig1',
  type: 'signature',
  required: true,
  role: 'First Party',
  areas: [{ page: 0, x: 0.1, y: 0.1, w: 0.3, h: 0.05 }],
};

// ---------------------------------------------------------------------------
// validateSigningFields
// ---------------------------------------------------------------------------

describe('validateSigningFields — happy path', () => {
  test('accepts a single valid signature field', () => {
    const out = validateSigningFields([VALID_FIELD]);
    assert.equal(out.length, 1);
    assert.equal(out[0].name, 'sig1');
    assert.equal(out[0].type, 'signature');
    assert.equal(out[0].required, true);
    assert.equal(out[0].role, 'First Party');
    assert.equal(out[0].areas.length, 1);
  });

  test('preserves order across multiple fields', () => {
    const out = validateSigningFields([
      { ...VALID_FIELD, name: 'a' },
      { ...VALID_FIELD, name: 'b', type: 'text' },
      { ...VALID_FIELD, name: 'c', type: 'date' },
    ]);
    assert.deepEqual(
      out.map((f) => f.name),
      ['a', 'b', 'c'],
    );
  });

  test('defaults required=true for signature, false otherwise', () => {
    const out = validateSigningFields([
      { ...VALID_FIELD, name: 'sig', type: 'signature', required: undefined },
      { ...VALID_FIELD, name: 'txt', type: 'text', required: undefined },
    ]);
    assert.equal(out[0].required, true);
    assert.equal(out[1].required, false);
  });

  test('default role is "First Party"', () => {
    const out = validateSigningFields([
      { ...VALID_FIELD, name: 'a', role: undefined },
    ]);
    assert.equal(out[0].role, 'First Party');
  });

  test('honours explicit role override', () => {
    const out = validateSigningFields([{ ...VALID_FIELD, name: 'a', role: 'Witness' }]);
    assert.equal(out[0].role, 'Witness');
  });

  test('trims whitespace on field name', () => {
    const out = validateSigningFields([{ ...VALID_FIELD, name: '  sig1  ' }]);
    assert.equal(out[0].name, 'sig1');
  });
});

describe('validateSigningFields — type validation', () => {
  for (const type of ['name', 'email', 'signature', 'date', 'text', 'checkbox']) {
    test(`accepts type=${type}`, () => {
      const out = validateSigningFields([{ ...VALID_FIELD, type }]);
      assert.equal(out[0].type, type);
    });
  }

  test('rejects unknown type', () => {
    assert.throws(
      () => validateSigningFields([{ ...VALID_FIELD, type: 'initials' }]),
      /must be one of/,
    );
  });

  test('rejects missing type', () => {
    assert.throws(
      () => validateSigningFields([{ ...VALID_FIELD, type: undefined }]),
      /must be one of/,
    );
  });
});

describe('validateSigningFields — input shape', () => {
  test('rejects empty array', () => {
    assert.throws(() => validateSigningFields([]), /non-empty array/);
  });

  test('rejects non-array', () => {
    // @ts-expect-error testing wrong runtime type
    assert.throws(() => validateSigningFields('not an array'), /non-empty array/);
  });

  test('rejects null', () => {
    // @ts-expect-error testing wrong runtime type
    assert.throws(() => validateSigningFields(null), /non-empty array/);
  });

  test('rejects null entries', () => {
    assert.throws(
      () => validateSigningFields([null]),
      /must be an object/,
    );
  });

  test('rejects empty field name', () => {
    assert.throws(
      () => validateSigningFields([{ ...VALID_FIELD, name: '' }]),
      /non-empty string/,
    );
  });

  test('rejects whitespace-only field name', () => {
    assert.throws(
      () => validateSigningFields([{ ...VALID_FIELD, name: '   ' }]),
      /non-empty string/,
    );
  });

  test('rejects duplicate field names', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, name: 'same' },
          { ...VALID_FIELD, name: 'same' },
        ]),
      /duplicate field name/,
    );
  });
});

describe('validateSigningFields — area validation', () => {
  test('rejects missing areas', () => {
    assert.throws(
      () => validateSigningFields([{ ...VALID_FIELD, areas: undefined }]),
      /non-empty array/,
    );
  });

  test('rejects empty areas array', () => {
    assert.throws(
      () => validateSigningFields([{ ...VALID_FIELD, areas: [] }]),
      /non-empty array/,
    );
  });

  test('rejects area with negative coords', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, areas: [{ page: 0, x: -0.1, y: 0, w: 0.1, h: 0.1 }] },
        ]),
      /must be in \[0,1\]/,
    );
  });

  test('rejects area with coords > 1', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, areas: [{ page: 0, x: 0, y: 0, w: 1.5, h: 0.1 }] },
        ]),
      /must be in \[0,1\]/,
    );
  });

  test('rejects non-integer page', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, areas: [{ page: 1.5, x: 0, y: 0, w: 0.1, h: 0.1 }] },
        ]),
      /non-negative integer/,
    );
  });

  test('rejects negative page', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, areas: [{ page: -1, x: 0, y: 0, w: 0.1, h: 0.1 }] },
        ]),
      /non-negative integer/,
    );
  });

  test('rejects NaN coord', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, areas: [{ page: 0, x: NaN, y: 0, w: 0.1, h: 0.1 }] },
        ]),
      /finite number/,
    );
  });

  test('rejects Infinity coord', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, areas: [{ page: 0, x: 0, y: 0, w: Infinity, h: 0.1 }] },
        ]),
      /finite number/,
    );
  });
});

// ---------------------------------------------------------------------------
// validateTemplateInput
// ---------------------------------------------------------------------------

describe('validateTemplateInput', () => {
  test('accepts a valid name + minimal PDF base64', () => {
    const out = validateTemplateInput({ name: 'My NDA', file: MINIMAL_PDF_BASE64 });
    assert.equal(out.name, 'My NDA');
    assert.ok(Buffer.isBuffer(out.pdfBuffer));
    assert.equal(out.pdfBuffer.toString('utf8').startsWith('%PDF-'), true);
  });

  test('trims name', () => {
    const out = validateTemplateInput({ name: '  My NDA  ', file: MINIMAL_PDF_BASE64 });
    assert.equal(out.name, 'My NDA');
  });

  test('rejects empty name', () => {
    assert.throws(
      () => validateTemplateInput({ name: '', file: MINIMAL_PDF_BASE64 }),
      /non-empty string/,
    );
  });

  test('rejects whitespace-only name', () => {
    assert.throws(
      () => validateTemplateInput({ name: '   ', file: MINIMAL_PDF_BASE64 }),
      /non-empty string/,
    );
  });

  test('rejects name >200 chars', () => {
    assert.throws(
      () => validateTemplateInput({ name: 'a'.repeat(201), file: MINIMAL_PDF_BASE64 }),
      /≤200 chars/,
    );
  });

  test('rejects empty file', () => {
    assert.throws(
      () => validateTemplateInput({ name: 'NDA', file: '' }),
      /non-empty base64 string/,
    );
  });

  test('rejects non-string file', () => {
    assert.throws(
      // @ts-expect-error wrong type
      () => validateTemplateInput({ name: 'NDA', file: 12345 }),
      /non-empty base64 string/,
    );
  });

  test('rejects non-PDF magic bytes', () => {
    const txtBase64 = Buffer.from('hello world', 'utf8').toString('base64');
    assert.throws(
      () => validateTemplateInput({ name: 'NDA', file: txtBase64 }),
      /missing %PDF- header/,
    );
  });

  test('rejects PDF over 25 MB ceiling', () => {
    const big = Buffer.alloc(26 * 1024 * 1024);
    big.write('%PDF-', 0);
    const b64 = big.toString('base64');
    assert.throws(
      () => validateTemplateInput({ name: 'NDA', file: b64 }),
      /byte ceiling/,
    );
  });
});

// ---------------------------------------------------------------------------
// buildTemplateStorageKey
// ---------------------------------------------------------------------------

describe('buildTemplateStorageKey', () => {
  test('produces tenant-scoped path', () => {
    const key = buildTemplateStorageKey({
      tenantId: '759a83e8-7340-4482-a586-cd2d049fb0b5',
      templateId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    assert.equal(
      key,
      '759a83e8-7340-4482-a586-cd2d049fb0b5/templates/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf',
    );
  });

  test('is deterministic', () => {
    const args = { tenantId: 't1', templateId: 't2' };
    assert.equal(buildTemplateStorageKey(args), buildTemplateStorageKey(args));
  });
});
