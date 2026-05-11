// @ts-check
/**
 * public-sign.test.js (4VD-43 day 3)
 *
 * Pure-helper tests for the public sign route. Route-level integration
 * tests with mocked Supabase + Storage are deferred to 4VD-43 day 6 — these
 * tests pin the validators, audit-entry shape, IP/UA extraction, and
 * status-machine helpers that day 6 will rely on.
 *
 * Run with:
 *   cd backend && node --test __tests__/routes/public-sign.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';

import {
  isValidSigningToken,
  extractClientIp,
  extractClientUa,
  makeAuditEntry,
  appendAudit,
  validateSubmitInput,
  isExpired,
} from '../../routes/public-sign.js';
import createPublicSignRoutes from '../../routes/public-sign.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'a'.repeat(64);
const ALL_F_TOKEN = 'f'.repeat(64);
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

const SIG_FIELD = { name: 'sig', type: 'signature', required: true };
const TEXT_FIELD = { name: 'company', type: 'text', required: false };
const REQUIRED_TEXT_FIELD = { name: 'name', type: 'name', required: true };
const CHECKBOX_FIELD = { name: 'agree', type: 'checkbox', required: false };

// ---------------------------------------------------------------------------
// isValidSigningToken
// ---------------------------------------------------------------------------

describe('isValidSigningToken', () => {
  test('accepts 64-char lowercase hex', () => {
    assert.equal(isValidSigningToken(VALID_TOKEN), true);
    assert.equal(isValidSigningToken(ALL_F_TOKEN), true);
  });
  test('rejects uppercase hex (we issue lowercase only)', () => {
    assert.equal(isValidSigningToken(VALID_TOKEN.toUpperCase()), false);
  });
  test('rejects wrong length', () => {
    assert.equal(isValidSigningToken('a'.repeat(63)), false);
    assert.equal(isValidSigningToken('a'.repeat(65)), false);
  });
  test('rejects non-hex chars', () => {
    assert.equal(isValidSigningToken('g'.repeat(64)), false);
    assert.equal(isValidSigningToken('a'.repeat(63) + '!'), false);
  });
  test('rejects empty/non-string', () => {
    assert.equal(isValidSigningToken(''), false);
    assert.equal(isValidSigningToken(null), false);
    assert.equal(isValidSigningToken(undefined), false);
    assert.equal(isValidSigningToken(123), false);
  });
});

// ---------------------------------------------------------------------------
// extractClientIp / extractClientUa
// ---------------------------------------------------------------------------

describe('extractClientIp', () => {
  test('prefers req.ip (Express trust-proxy resolved value)', () => {
    assert.equal(
      extractClientIp({ ip: '203.0.113.7', headers: { 'x-forwarded-for': '198.51.100.1' } }),
      '203.0.113.7',
    );
  });
  test('falls back to first XFF hop when req.ip empty', () => {
    assert.equal(
      extractClientIp({ ip: '', headers: { 'x-forwarded-for': '198.51.100.1, 10.0.0.1' } }),
      '198.51.100.1',
    );
  });
  test('handles XFF as array', () => {
    assert.equal(
      extractClientIp({ ip: '', headers: { 'x-forwarded-for': ['198.51.100.1, 10.0.0.1'] } }),
      '198.51.100.1',
    );
  });
  test('returns null when neither set', () => {
    assert.equal(extractClientIp({ ip: '', headers: {} }), null);
    assert.equal(extractClientIp({}), null);
  });
});

describe('extractClientUa', () => {
  test('returns the UA header verbatim when ≤1024 chars', () => {
    assert.equal(
      extractClientUa({ headers: { 'user-agent': 'Mozilla/5.0 ...' } }),
      'Mozilla/5.0 ...',
    );
  });
  test('truncates pathological UAs to 1024 chars', () => {
    const big = 'A'.repeat(2048);
    assert.equal(extractClientUa({ headers: { 'user-agent': big } }).length, 1024);
  });
  test('returns null when missing', () => {
    assert.equal(extractClientUa({ headers: {} }), null);
  });
});

// ---------------------------------------------------------------------------
// makeAuditEntry / appendAudit
// ---------------------------------------------------------------------------

describe('makeAuditEntry', () => {
  test('shape: { at, action, ip, ua }', () => {
    const at = new Date('2026-05-09T15:00:00Z');
    const e = makeAuditEntry({ action: 'viewed', ip: '203.0.113.7', ua: 'UA', at });
    assert.deepEqual(e, {
      at: '2026-05-09T15:00:00.000Z',
      action: 'viewed',
      ip: '203.0.113.7',
      ua: 'UA',
    });
  });
  test('includes reason only when provided', () => {
    const e = makeAuditEntry({
      action: 'declined',
      ip: '1.2.3.4',
      ua: null,
      reason: 'wrong template',
    });
    assert.equal(e.reason, 'wrong template');
  });
  test('caps reason at 1000 chars', () => {
    const big = 'x'.repeat(2000);
    const e = makeAuditEntry({ action: 'declined', ip: null, ua: null, reason: big });
    assert.equal(e.reason.length, 1000);
  });
  test('null ip/ua are preserved', () => {
    const e = makeAuditEntry({ action: 'viewed', ip: null, ua: null });
    assert.equal(e.ip, null);
    assert.equal(e.ua, null);
  });
});

describe('appendAudit', () => {
  test('appends to existing array', () => {
    const e1 = makeAuditEntry({ action: 'viewed', ip: '1.1.1.1', ua: null });
    const e2 = makeAuditEntry({ action: 'signed', ip: '1.1.1.1', ua: null });
    const out = appendAudit([e1], e2);
    assert.equal(out.length, 2);
    assert.equal(out[0].action, 'viewed');
    assert.equal(out[1].action, 'signed');
  });
  test('treats non-array existing as fresh start', () => {
    const e = makeAuditEntry({ action: 'viewed', ip: null, ua: null });
    assert.deepEqual(appendAudit(null, e), [e]);
    assert.deepEqual(appendAudit(undefined, e), [e]);
    assert.deepEqual(appendAudit('garbage', e), [e]);
  });
  test('does not mutate input', () => {
    const original = [makeAuditEntry({ action: 'viewed', ip: null, ua: null })];
    const beforeLen = original.length;
    appendAudit(original, makeAuditEntry({ action: 'signed', ip: null, ua: null }));
    assert.equal(original.length, beforeLen);
  });
  test('caps at 1000 entries (drops oldest)', () => {
    const initial = Array.from({ length: 1000 }, (_, i) =>
      makeAuditEntry({ action: 'viewed', ip: null, ua: `ua-${i}` }),
    );
    const next = makeAuditEntry({ action: 'signed', ip: null, ua: 'last' });
    const out = appendAudit(initial, next);
    assert.equal(out.length, 1000);
    // Oldest (ua-0) dropped, last entry is the new 'signed' one
    assert.equal(out[out.length - 1].ua, 'last');
    assert.equal(out[0].ua, 'ua-1');
  });
});

// ---------------------------------------------------------------------------
// validateSubmitInput
// ---------------------------------------------------------------------------

describe('validateSubmitInput — happy path', () => {
  test('accepts a body that satisfies a single-signature template', () => {
    const out = validateSubmitInput(
      {
        field_values: { name: 'Jane Doe' },
        signature_data_url: TINY_PNG_DATA_URL,
        signer_name: 'Jane Doe',
      },
      [SIG_FIELD, REQUIRED_TEXT_FIELD],
    );
    assert.equal(out.field_values.name, 'Jane Doe');
    assert.equal(out.signature_data_url, TINY_PNG_DATA_URL);
    assert.equal(out.signer_name, 'Jane Doe');
  });

  test('coerces checkbox to boolean', () => {
    const out = validateSubmitInput(
      {
        field_values: { agree: 'yes-truthy-string' },
        signature_data_url: TINY_PNG_DATA_URL,
        signer_name: 'Jane',
      },
      [SIG_FIELD, CHECKBOX_FIELD],
    );
    assert.equal(out.field_values.agree, true);
  });

  test('strips unknown keys from field_values', () => {
    const out = validateSubmitInput(
      {
        field_values: { name: 'Jane', evil_extra: 'should be dropped' },
        signature_data_url: TINY_PNG_DATA_URL,
        signer_name: 'Jane',
      },
      [SIG_FIELD, REQUIRED_TEXT_FIELD],
    );
    assert.equal(out.field_values.evil_extra, undefined);
  });

  test('omits optional fields when not provided', () => {
    const out = validateSubmitInput(
      {
        field_values: { name: 'Jane' },
        signature_data_url: TINY_PNG_DATA_URL,
        signer_name: 'Jane',
      },
      [SIG_FIELD, REQUIRED_TEXT_FIELD, TEXT_FIELD],
    );
    assert.equal(out.field_values.company, undefined);
    assert.equal(out.field_values.name, 'Jane');
  });

  test('signer_name is trimmed', () => {
    const out = validateSubmitInput(
      {
        field_values: { name: 'Jane' },
        signature_data_url: TINY_PNG_DATA_URL,
        signer_name: '  Jane Doe  ',
      },
      [SIG_FIELD, REQUIRED_TEXT_FIELD],
    );
    assert.equal(out.signer_name, 'Jane Doe');
  });
});

describe('validateSubmitInput — rejects bad input', () => {
  test('null body', () => {
    assert.throws(() => validateSubmitInput(null, [SIG_FIELD]), /body must be an object/);
  });
  test('missing required field', () => {
    assert.throws(
      () =>
        validateSubmitInput({ signature_data_url: TINY_PNG_DATA_URL, signer_name: 'Jane' }, [
          SIG_FIELD,
          REQUIRED_TEXT_FIELD,
        ]),
      /required field "name" is missing/,
    );
  });
  test('empty-string for required field also fails', () => {
    assert.throws(
      () =>
        validateSubmitInput(
          {
            field_values: { name: '' },
            signature_data_url: TINY_PNG_DATA_URL,
            signer_name: 'Jane',
          },
          [SIG_FIELD, REQUIRED_TEXT_FIELD],
        ),
      /required field "name" is missing/,
    );
  });
  test('text field exceeding 5000 chars', () => {
    assert.throws(
      () =>
        validateSubmitInput(
          {
            field_values: { name: 'Jane', company: 'x'.repeat(5001) },
            signature_data_url: TINY_PNG_DATA_URL,
            signer_name: 'Jane',
          },
          [SIG_FIELD, REQUIRED_TEXT_FIELD, TEXT_FIELD],
        ),
      /exceeds 5000 chars/,
    );
  });
  test('non-string non-number text field rejected', () => {
    assert.throws(
      () =>
        validateSubmitInput(
          {
            field_values: { name: { evil: 'object' } },
            signature_data_url: TINY_PNG_DATA_URL,
            signer_name: 'Jane',
          },
          [SIG_FIELD, REQUIRED_TEXT_FIELD],
        ),
      /must be a string or number/,
    );
  });
  test('signature data URL with wrong scheme rejected', () => {
    assert.throws(
      () =>
        validateSubmitInput(
          {
            field_values: { name: 'Jane' },
            signature_data_url: 'data:application/pdf;base64,JVBERi0xLjQK',
            signer_name: 'Jane',
          },
          [SIG_FIELD, REQUIRED_TEXT_FIELD],
        ),
      /must be a PNG\/JPEG data URL/,
    );
  });
  test('signature missing entirely when template has required signature', () => {
    assert.throws(
      () =>
        validateSubmitInput({ field_values: { name: 'Jane' }, signer_name: 'Jane' }, [
          SIG_FIELD,
          REQUIRED_TEXT_FIELD,
        ]),
      /a signature is required/,
    );
  });
  test('signature too large (>1.5MB)', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(1_500_001);
    assert.throws(
      () =>
        validateSubmitInput(
          { field_values: { name: 'Jane' }, signature_data_url: huge, signer_name: 'Jane' },
          [SIG_FIELD, REQUIRED_TEXT_FIELD],
        ),
      /exceeds size limit/,
    );
  });
  test('signer_name missing when template has required signature', () => {
    assert.throws(
      () =>
        validateSubmitInput(
          { field_values: { name: 'Jane' }, signature_data_url: TINY_PNG_DATA_URL },
          [SIG_FIELD, REQUIRED_TEXT_FIELD],
        ),
      /a signer name is required/,
    );
  });
  test('signer_name empty/whitespace when required', () => {
    assert.throws(
      () =>
        validateSubmitInput(
          {
            field_values: { name: 'Jane' },
            signature_data_url: TINY_PNG_DATA_URL,
            signer_name: '   ',
          },
          [SIG_FIELD, REQUIRED_TEXT_FIELD],
        ),
      /a signer name is required/,
    );
  });
  test('signer_name >200 chars rejected', () => {
    assert.throws(
      () =>
        validateSubmitInput(
          {
            field_values: { name: 'Jane' },
            signature_data_url: TINY_PNG_DATA_URL,
            signer_name: 'x'.repeat(201),
          },
          [SIG_FIELD, REQUIRED_TEXT_FIELD],
        ),
      /signer_name must be ≤200 chars/,
    );
  });
  test('signer_name non-string rejected', () => {
    assert.throws(
      () =>
        validateSubmitInput(
          {
            field_values: { name: 'Jane' },
            signature_data_url: TINY_PNG_DATA_URL,
            signer_name: 123,
          },
          [SIG_FIELD, REQUIRED_TEXT_FIELD],
        ),
      /signer_name must be a string/,
    );
  });
});

// ---------------------------------------------------------------------------
// isExpired
// ---------------------------------------------------------------------------

describe('isExpired', () => {
  const now = new Date('2026-05-09T12:00:00Z');
  test('past timestamp returns true', () => {
    assert.equal(isExpired('2026-05-08T12:00:00Z', now), true);
  });
  test('future timestamp returns false', () => {
    assert.equal(isExpired('2026-05-23T12:00:00Z', now), false);
  });
  test('null/undefined/invalid all return false (no false expiries)', () => {
    assert.equal(isExpired(null, now), false);
    assert.equal(isExpired(undefined, now), false);
    assert.equal(isExpired('not a date', now), false);
  });
  test('Date instance accepted', () => {
    assert.equal(isExpired(new Date('2026-05-08T12:00:00Z'), now), true);
  });
});

// ---------------------------------------------------------------------------
// Route is reachable WITHOUT auth (defines the public-route invariant).
//
// We don't have a mocked Supabase, so requests will hit the lookup and
// fail with 500 (no real DB) or pass through the early-validation gate
// with 404 for malformed tokens. The only assertion that matters here is
// that the route doesn't return 401/403 — i.e., no auth middleware is
// short-circuiting the public surface.
// ---------------------------------------------------------------------------

describe('Public sign routes — no auth required', () => {
  function buildApp() {
    const app = express();
    app.use(express.json());
    // No authenticateRequest, no validateTenantAccess. Direct mount.
    app.use('/api/sign', createPublicSignRoutes());
    return app;
  }

  async function send(app, method, path, body) {
    return new Promise((resolve, reject) => {
      const server = http.createServer(app).listen(0, async () => {
        try {
          const port = server.address().port;
          const init = { method, headers: { 'Content-Type': 'application/json' } };
          if (body !== undefined) init.body = JSON.stringify(body);
          const resp = await fetch(`http://127.0.0.1:${port}${path}`, init);
          const json = await resp.json().catch(() => ({}));
          server.close();
          resolve({ status: resp.status, body: json });
        } catch (err) {
          server.close();
          reject(err);
        }
      });
    });
  }

  test('GET with malformed token returns 404 (token shape gate fires before DB)', async () => {
    const app = buildApp();
    const { status, body } = await send(app, 'GET', '/api/sign/not-a-token');
    assert.equal(status, 404);
    assert.equal(body.error, 'not_found');
  });

  test('GET never returns 401/403 (no auth required on public surface)', async () => {
    const app = buildApp();
    const { status } = await send(app, 'GET', `/api/sign/${VALID_TOKEN}`);
    assert.notEqual(status, 401);
    assert.notEqual(status, 403);
  });

  test('POST submit with malformed token returns 404', async () => {
    const app = buildApp();
    const { status } = await send(app, 'POST', '/api/sign/short/submit', {
      field_values: {},
      signature_data_url: TINY_PNG_DATA_URL,
    });
    assert.equal(status, 404);
  });

  test('POST decline with malformed token returns 404', async () => {
    const app = buildApp();
    const { status } = await send(app, 'POST', '/api/sign/short/decline', { reason: 'no' });
    assert.equal(status, 404);
  });

  test('GET /:token/signed-pdf-url with malformed token returns 404', async () => {
    // Same token-shape gate as the other public endpoints — fires
    // before any DB call, so a leaked endpoint can't be probed for
    // valid tokens via timing attack.
    const app = buildApp();
    const { status, body } = await send(app, 'GET', '/api/sign/not-a-token/signed-pdf-url');
    assert.equal(status, 404);
    assert.equal(body.error, 'not_found');
  });

  test('GET /:token/signed-pdf-url never returns 401/403', async () => {
    const app = buildApp();
    const { status } = await send(app, 'GET', `/api/sign/${VALID_TOKEN}/signed-pdf-url`);
    assert.notEqual(status, 401);
    assert.notEqual(status, 403);
  });
});
