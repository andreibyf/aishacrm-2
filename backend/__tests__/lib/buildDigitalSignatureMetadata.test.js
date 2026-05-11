// @ts-check
/**
 * buildDigitalSignatureMetadata tests (4VD-43 post-PR3 follow-up).
 *
 * Pin the pure helpers that build the digital-signature metadata
 * payload embedded into the stamped PDF's Info dict.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  buildDigitalSignatureMetadata,
  detectSignatureMethod,
  findAuditEntry,
  sha256Hex,
  __TEST__,
} from '../../lib/buildDigitalSignatureMetadata.js';

const SESSION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const BASE_SESSION = {
  id: SESSION_ID,
  tenant_id: 'tttttttt-tttt-tttt-tttt-tttttttttttt',
  recipient_email: 'jane@example.com',
  recipient_name: 'Jane Recipient',
  signed_at: '2026-05-11T14:00:00.000Z',
  audit: [
    { action: 'sent', at: '2026-05-10T09:00:00Z', ip: '203.0.113.5' },
    { action: 'viewed', at: '2026-05-10T15:30:00Z', ip: '198.51.100.42' },
    {
      action: 'signed',
      at: '2026-05-11T14:00:00Z',
      ip: '198.51.100.42',
      ua: 'Mozilla/5.0',
    },
  ],
  field_values: { _signer_name: 'Jane R. Recipient', _signature_mode: 'draw' },
};

const BASE_TEMPLATE = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  name: 'Service Agreement',
};

const ORIGINAL_SHA = 'a'.repeat(64);
const FINAL_SHA = 'b'.repeat(64);

// ---------------------------------------------------------------------------
// sha256Hex
// ---------------------------------------------------------------------------

describe('sha256Hex', () => {
  it('matches Node crypto for a Buffer', () => {
    const b = Buffer.from('hello');
    assert.equal(sha256Hex(b), crypto.createHash('sha256').update(b).digest('hex'));
  });

  it('matches Node crypto for a Uint8Array', () => {
    const u = new Uint8Array([1, 2, 3, 4, 5]);
    assert.equal(sha256Hex(u), crypto.createHash('sha256').update(Buffer.from(u)).digest('hex'));
  });

  it('matches Node crypto for a string', () => {
    assert.equal(sha256Hex('hello'), crypto.createHash('sha256').update('hello').digest('hex'));
  });

  it('returns empty string for null/undefined', () => {
    assert.equal(sha256Hex(null), '');
    assert.equal(sha256Hex(undefined), '');
  });

  it('throws TypeError for unsupported types', () => {
    assert.throws(() => sha256Hex(123), TypeError);
    assert.throws(() => sha256Hex({ foo: 'bar' }), TypeError);
  });
});

// ---------------------------------------------------------------------------
// findAuditEntry
// ---------------------------------------------------------------------------

describe('findAuditEntry', () => {
  it('returns null when audit is missing or not an array', () => {
    assert.equal(findAuditEntry(null, 'signed'), null);
    assert.equal(findAuditEntry(undefined, 'signed'), null);
    assert.equal(findAuditEntry('not-an-array', 'signed'), null);
  });

  it('returns null when action not found', () => {
    const audit = [{ action: 'sent' }, { action: 'viewed' }];
    assert.equal(findAuditEntry(audit, 'signed'), null);
  });

  it('returns the MOST RECENT entry when action repeats', () => {
    const audit = [
      { action: 'viewed', at: 't1', ip: '1.1.1.1' },
      { action: 'viewed', at: 't2', ip: '2.2.2.2' },
      { action: 'signed', at: 't3', ip: '3.3.3.3' },
    ];
    assert.equal(findAuditEntry(audit, 'viewed').ip, '2.2.2.2');
  });

  it('locates the signed entry in a normal session audit', () => {
    const entry = findAuditEntry(BASE_SESSION.audit, 'signed');
    assert.ok(entry);
    assert.equal(entry.ip, '198.51.100.42');
    assert.equal(entry.ua, 'Mozilla/5.0');
  });
});

// ---------------------------------------------------------------------------
// detectSignatureMethod
// ---------------------------------------------------------------------------

describe('detectSignatureMethod', () => {
  it('returns drawn for _signature_mode draw|drawn', () => {
    assert.equal(detectSignatureMethod({ _signature_mode: 'draw' }), 'drawn');
    assert.equal(detectSignatureMethod({ _signature_mode: 'drawn' }), 'drawn');
  });

  it('returns typed for _signature_mode type|typed', () => {
    assert.equal(detectSignatureMethod({ _signature_mode: 'type' }), 'typed');
    assert.equal(detectSignatureMethod({ _signature_mode: 'typed' }), 'typed');
  });

  it('returns unknown for missing/unrecognized modes', () => {
    assert.equal(detectSignatureMethod(undefined), 'unknown');
    assert.equal(detectSignatureMethod(null), 'unknown');
    assert.equal(detectSignatureMethod({}), 'unknown');
    assert.equal(detectSignatureMethod({ _signature_mode: 'garbled' }), 'unknown');
    assert.equal(detectSignatureMethod('not-an-object'), 'unknown');
  });
});

// ---------------------------------------------------------------------------
// buildDigitalSignatureMetadata
// ---------------------------------------------------------------------------

describe('buildDigitalSignatureMetadata — happy path', () => {
  it('produces a structured payload with all expected keys', () => {
    const out = buildDigitalSignatureMetadata({
      session: BASE_SESSION,
      template: BASE_TEMPLATE,
      originalPdfSha256: ORIGINAL_SHA,
      finalPdfSha256: FINAL_SHA,
      signatureImageSha256: 'c'.repeat(64),
      producerVersion: '3.1.0',
    });
    assert.equal(out.schema_version, __TEST__.SCHEMA_VERSION);
    assert.equal(out.producer, __TEST__.PRODUCER);
    assert.equal(out.producer_version, '3.1.0');
    assert.equal(out.envelope_id, SESSION_ID);
    assert.equal(out.template_name, 'Service Agreement');
    assert.equal(out.signed_at, '2026-05-11T14:00:00.000Z');
    assert.equal(out.signer.email, 'jane@example.com');
    assert.equal(out.signer.name, 'Jane R. Recipient'); // prefers _signer_name
    assert.equal(out.signer.ip, '198.51.100.42');
    assert.equal(out.signer.user_agent, 'Mozilla/5.0');
    assert.equal(out.signer.method, 'drawn');
    assert.equal(out.hashes.original_pdf_sha256, ORIGINAL_SHA);
    assert.equal(out.hashes.final_pdf_sha256, FINAL_SHA);
    assert.equal(out.hashes.signature_image_sha256, 'c'.repeat(64));
    assert.equal(out.audit_trail_count, 3);
  });

  it('falls back to recipient_name when _signer_name is missing', () => {
    const session = { ...BASE_SESSION, field_values: {} };
    const out = buildDigitalSignatureMetadata({
      session,
      template: BASE_TEMPLATE,
      originalPdfSha256: ORIGINAL_SHA,
      finalPdfSha256: FINAL_SHA,
    });
    assert.equal(out.signer.name, 'Jane Recipient');
  });

  it('signer.name is null when neither typed nor recipient name present', () => {
    const session = { ...BASE_SESSION, recipient_name: undefined, field_values: {} };
    const out = buildDigitalSignatureMetadata({
      session,
      template: BASE_TEMPLATE,
      originalPdfSha256: ORIGINAL_SHA,
      finalPdfSha256: FINAL_SHA,
    });
    assert.equal(out.signer.name, null);
  });

  it('signer.ip and signer.user_agent are null when no signed audit entry', () => {
    const session = { ...BASE_SESSION, audit: [{ action: 'sent' }] };
    const out = buildDigitalSignatureMetadata({
      session,
      template: BASE_TEMPLATE,
      originalPdfSha256: ORIGINAL_SHA,
      finalPdfSha256: FINAL_SHA,
    });
    assert.equal(out.signer.ip, null);
    assert.equal(out.signer.user_agent, null);
  });

  it('audit_trail_count is 0 when audit is missing', () => {
    const session = { ...BASE_SESSION, audit: undefined };
    const out = buildDigitalSignatureMetadata({
      session,
      template: BASE_TEMPLATE,
      originalPdfSha256: ORIGINAL_SHA,
      finalPdfSha256: FINAL_SHA,
    });
    assert.equal(out.audit_trail_count, 0);
  });

  it('accepts signed_at as a Date object', () => {
    const session = { ...BASE_SESSION, signed_at: new Date('2026-05-11T14:00:00.000Z') };
    const out = buildDigitalSignatureMetadata({
      session,
      template: BASE_TEMPLATE,
      originalPdfSha256: ORIGINAL_SHA,
      finalPdfSha256: FINAL_SHA,
    });
    assert.equal(out.signed_at, '2026-05-11T14:00:00.000Z');
  });

  it('falls back to now() when signed_at is missing', () => {
    const session = { ...BASE_SESSION, signed_at: undefined };
    const out = buildDigitalSignatureMetadata({
      session,
      template: BASE_TEMPLATE,
      originalPdfSha256: ORIGINAL_SHA,
      finalPdfSha256: FINAL_SHA,
    });
    // Just verify it's a valid ISO string near the test run time
    assert.match(out.signed_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('signature_image_sha256 is null when not provided', () => {
    const out = buildDigitalSignatureMetadata({
      session: BASE_SESSION,
      template: BASE_TEMPLATE,
      originalPdfSha256: ORIGINAL_SHA,
      finalPdfSha256: FINAL_SHA,
    });
    assert.equal(out.hashes.signature_image_sha256, null);
  });

  it('template_name falls back when template.name missing', () => {
    const out = buildDigitalSignatureMetadata({
      session: BASE_SESSION,
      template: { id: 'x' },
      originalPdfSha256: ORIGINAL_SHA,
      finalPdfSha256: FINAL_SHA,
    });
    assert.equal(out.template_name, '(untitled template)');
  });

  it('producer_version defaults to 0.0.0 when not provided', () => {
    const out = buildDigitalSignatureMetadata({
      session: BASE_SESSION,
      template: BASE_TEMPLATE,
      originalPdfSha256: ORIGINAL_SHA,
      finalPdfSha256: FINAL_SHA,
    });
    assert.equal(out.producer_version, '0.0.0');
  });
});

describe('buildDigitalSignatureMetadata — validation', () => {
  it('throws on null input', () => {
    assert.throws(() => buildDigitalSignatureMetadata(null), TypeError);
  });

  it('throws on missing session', () => {
    assert.throws(
      () =>
        buildDigitalSignatureMetadata({
          template: BASE_TEMPLATE,
          originalPdfSha256: ORIGINAL_SHA,
          finalPdfSha256: FINAL_SHA,
        }),
      /session is required/,
    );
  });

  it('throws on missing template', () => {
    assert.throws(
      () =>
        buildDigitalSignatureMetadata({
          session: BASE_SESSION,
          originalPdfSha256: ORIGINAL_SHA,
          finalPdfSha256: FINAL_SHA,
        }),
      /template is required/,
    );
  });

  it('throws on missing originalPdfSha256', () => {
    assert.throws(
      () =>
        buildDigitalSignatureMetadata({
          session: BASE_SESSION,
          template: BASE_TEMPLATE,
          finalPdfSha256: FINAL_SHA,
        }),
      /originalPdfSha256/,
    );
  });

  it('throws on missing finalPdfSha256', () => {
    assert.throws(
      () =>
        buildDigitalSignatureMetadata({
          session: BASE_SESSION,
          template: BASE_TEMPLATE,
          originalPdfSha256: ORIGINAL_SHA,
        }),
      /finalPdfSha256/,
    );
  });
});

describe('buildDigitalSignatureMetadata — JSON-safe output', () => {
  it('result is JSON-stringify-able (no circular refs, no functions)', () => {
    const out = buildDigitalSignatureMetadata({
      session: BASE_SESSION,
      template: BASE_TEMPLATE,
      originalPdfSha256: ORIGINAL_SHA,
      finalPdfSha256: FINAL_SHA,
    });
    const json = JSON.stringify(out);
    const reparsed = JSON.parse(json);
    assert.deepEqual(reparsed, out);
  });

  it('keys are stable snake_case for cross-language parsing', () => {
    const out = buildDigitalSignatureMetadata({
      session: BASE_SESSION,
      template: BASE_TEMPLATE,
      originalPdfSha256: ORIGINAL_SHA,
      finalPdfSha256: FINAL_SHA,
    });
    // Top-level keys
    const topKeys = Object.keys(out).sort();
    assert.deepEqual(topKeys, [
      'audit_trail_count',
      'envelope_id',
      'hashes',
      'producer',
      'producer_version',
      'schema_version',
      'signed_at',
      'signer',
      'template_name',
    ]);
    // Hashes subkeys
    assert.deepEqual(Object.keys(out.hashes).sort(), [
      'final_pdf_sha256',
      'original_pdf_sha256',
      'signature_image_sha256',
    ]);
    // Signer subkeys
    assert.deepEqual(Object.keys(out.signer).sort(), [
      'email',
      'ip',
      'method',
      'name',
      'user_agent',
    ]);
  });
});
