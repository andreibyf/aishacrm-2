// @ts-check
/**
 * finalizeSigningSession tests (4VD-43 day 5).
 *
 * Exercises the full pipeline against a fake supabase client that
 * captures every storage download/upload + DB update. We use a real
 * pdf-lib-built fixture as the "original template PDF" so the stamping
 * + CoC append run against actual bytes; the storage layer is mocked.
 *
 * Coverage:
 *   - sha256Hex helper: known-vector match
 *   - Storage key shape: tenant/signed/session.pdf
 *   - Happy path: pipeline produces a PDF with original_page_count + 1 page
 *     (CoC), uploaded to the right key, session row updated with
 *     storage_path + status='completed' + completed_at + audit append
 *   - Idempotent re-run: status='completed' row → returns ok with reason
 *     'already_completed', no second upload
 *   - Failure modes: each pipeline step's error returns a structured
 *     {ok:false, reason} (template not found / download error / upload
 *     error / final update error)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import crypto from 'node:crypto';

import {
  finalizeSigningSession,
  buildSignedPdfStorageKey,
  sha256Hex,
  buildAttachmentFilename,
} from '../../lib/finalizeSigningSession.js';

const TENANT = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0';
const SESSION_ID = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
const TEMPLATE_ID = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2';

async function makeFixturePdf() {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  doc.getPage(0).drawText('Original template page', {
    x: 50,
    y: 750,
    size: 12,
    font: helv,
  });
  return Buffer.from(await doc.save());
}

/**
 * Build a fake supabase client that:
 *   - returns a configured signing_sessions row + signing_templates row
 *   - downloads a configured original-PDF blob from storage
 *   - captures the upload call so tests can assert on path + bytes
 *   - captures the .update() call so tests can assert on the final row state
 *
 * Configurable hooks let individual tests inject errors at any step.
 */
function makeFakeSupabase({
  sessionRow,
  templateRow,
  originalBytes,
  downloadError = null,
  uploadError = null,
  sessionUpdateError = null,
}) {
  const calls = { storage: { uploads: [], downloads: [] }, dbUpdates: [] };

  function fromTable(table) {
    const ctx = { table, filters: {}, updateValues: null };
    const builder = {
      select() {
        return builder;
      },
      eq(col, val) {
        ctx.filters[col] = val;
        return builder;
      },
      maybeSingle() {
        if (table === 'signing_sessions') {
          return Promise.resolve({ data: sessionRow, error: null });
        }
        if (table === 'signing_templates') {
          return Promise.resolve({ data: templateRow, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      update(values) {
        ctx.updateValues = values;
        return {
          eq(col, val) {
            ctx.filters[col] = val;
            calls.dbUpdates.push({
              table,
              filters: { ...ctx.filters },
              values,
            });
            if (table === 'signing_sessions' && sessionUpdateError) {
              return Promise.resolve({ error: sessionUpdateError });
            }
            return Promise.resolve({ error: null });
          },
        };
      },
    };
    return builder;
  }

  return {
    from: fromTable,
    storage: {
      from(_bucket) {
        return {
          download(path) {
            calls.storage.downloads.push(path);
            if (downloadError) return Promise.resolve({ data: null, error: downloadError });
            return Promise.resolve({
              data: {
                arrayBuffer: () =>
                  Promise.resolve(
                    originalBytes.buffer.slice(
                      originalBytes.byteOffset,
                      originalBytes.byteOffset + originalBytes.byteLength,
                    ),
                  ),
              },
              error: null,
            });
          },
          upload(path, bytes, opts) {
            calls.storage.uploads.push({ path, bytes, opts });
            return Promise.resolve({ error: uploadError });
          },
        };
      },
    },
    _calls: calls,
  };
}

const BASE_SESSION = {
  id: SESSION_ID,
  tenant_id: TENANT,
  template_id: TEMPLATE_ID,
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
  field_values: { _signer_name: 'Jane Recipient', _signature_data_url: null },
  status: 'signed',
};

const BASE_TEMPLATE = {
  id: TEMPLATE_ID,
  name: 'Service Agreement',
  pdf_storage_path: `${TENANT}/templates/${TEMPLATE_ID}.pdf`,
  fields: [],
};

// ---------------------------------------------------------------------------

describe('buildAttachmentFilename', () => {
  it('appends .pdf and keeps clean names intact', () => {
    assert.equal(buildAttachmentFilename('Service Agreement'), 'Service-Agreement.pdf');
  });

  it('collapses runs of non-alphanumeric chars to a single dash', () => {
    assert.equal(
      buildAttachmentFilename('Service Agreement / NDA (FINAL)'),
      'Service-Agreement-NDA-FINAL.pdf',
    );
  });

  it('strips leading and trailing dashes after sanitization', () => {
    assert.equal(buildAttachmentFilename('!!!Contract!!!'), 'Contract.pdf');
  });

  it('caps base length at 80 chars + ".pdf"', () => {
    const long = 'a'.repeat(200);
    const out = buildAttachmentFilename(long);
    assert.equal(out.length, 84); // 80 + '.pdf'
    assert.ok(out.endsWith('.pdf'));
  });

  it('falls back to "signed-document.pdf" for empty / falsy / non-string input', () => {
    assert.equal(buildAttachmentFilename(''), 'signed-document.pdf');
    assert.equal(buildAttachmentFilename(null), 'signed-document.pdf');
    assert.equal(buildAttachmentFilename(undefined), 'signed-document.pdf');
    assert.equal(buildAttachmentFilename('!!!'), 'signed-document.pdf');
  });

  it('preserves underscores and dots in the source name', () => {
    assert.equal(buildAttachmentFilename('contract_v2.draft'), 'contract_v2.draft.pdf');
  });
});

describe('sha256Hex helper', () => {
  it('matches Node crypto for a Buffer input', () => {
    const buf = Buffer.from('hello world');
    const expected = crypto.createHash('sha256').update(buf).digest('hex');
    assert.equal(sha256Hex(buf), expected);
  });

  it('matches Node crypto for a Uint8Array input', () => {
    const ua = new Uint8Array(Buffer.from('hello world'));
    const expected = crypto.createHash('sha256').update(Buffer.from(ua)).digest('hex');
    assert.equal(sha256Hex(ua), expected);
  });

  it('rejects an unsupported input type', () => {
    assert.throws(() => sha256Hex({ not: 'bytes' }));
  });
});

// ---------------------------------------------------------------------------

describe('buildSignedPdfStorageKey', () => {
  it('uses tenant/signed/session.pdf layout', () => {
    assert.equal(
      buildSignedPdfStorageKey({ tenantId: TENANT, sessionId: SESSION_ID }),
      `${TENANT}/signed/${SESSION_ID}.pdf`,
    );
  });
});

// ---------------------------------------------------------------------------

describe('finalizeSigningSession — happy path', () => {
  it('runs end-to-end and updates the session', async () => {
    const original = await makeFixturePdf();
    const fake = makeFakeSupabase({
      sessionRow: BASE_SESSION,
      templateRow: BASE_TEMPLATE,
      originalBytes: original,
    });
    const out = await finalizeSigningSession({
      supabase: fake,
      bucket: 'tenant-assets',
      sessionId: SESSION_ID,
      signerName: 'Jane Recipient',
    });
    assert.equal(out.ok, true);
    assert.equal(out.signedPdfStoragePath, `${TENANT}/signed/${SESSION_ID}.pdf`);
    // SHA-256 of the original
    assert.equal(out.originalSha256, crypto.createHash('sha256').update(original).digest('hex'));

    // Storage download was called against the template path
    assert.deepEqual(fake._calls.storage.downloads, [BASE_TEMPLATE.pdf_storage_path]);
    // Storage upload was called against the signed path
    assert.equal(fake._calls.storage.uploads.length, 1);
    assert.equal(fake._calls.storage.uploads[0].path, `${TENANT}/signed/${SESSION_ID}.pdf`);
    // Uploaded bytes are a valid PDF with original page count + CoC page
    const uploadedBuf = fake._calls.storage.uploads[0].bytes;
    const reloaded = await PDFDocument.load(
      uploadedBuf instanceof Buffer ? uploadedBuf : Buffer.from(uploadedBuf),
    );
    assert.equal(reloaded.getPageCount(), 2, 'expected original 1 page + CoC 1 page');

    // DB update transitions to completed + appends 'completed' audit
    const dbUpdate = fake._calls.dbUpdates.find((c) => c.table === 'signing_sessions');
    assert.ok(dbUpdate);
    assert.equal(dbUpdate.values.status, 'completed');
    assert.equal(dbUpdate.values.signed_pdf_storage_path, `${TENANT}/signed/${SESSION_ID}.pdf`);
    assert.ok(dbUpdate.values.completed_at, 'completed_at must be set');
    assert.ok(
      dbUpdate.values.audit.some((e) => e.action === 'completed'),
      "audit must include a 'completed' entry",
    );
  });
});

// ---------------------------------------------------------------------------

describe('finalizeSigningSession — idempotent re-run', () => {
  it('returns ok+already_completed when row is already at completed', async () => {
    const fake = makeFakeSupabase({
      sessionRow: { ...BASE_SESSION, status: 'completed' },
      templateRow: BASE_TEMPLATE,
      originalBytes: Buffer.from(''),
    });
    const out = await finalizeSigningSession({
      supabase: fake,
      bucket: 'tenant-assets',
      sessionId: SESSION_ID,
      signerName: 'Jane',
    });
    assert.equal(out.ok, true);
    assert.equal(out.reason, 'already_completed');
    assert.equal(fake._calls.storage.uploads.length, 0, 'no upload on re-run');
  });
});

// ---------------------------------------------------------------------------

describe('finalizeSigningSession — failure modes', () => {
  it('returns missing_args when required args are absent', async () => {
    const out = await finalizeSigningSession({});
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'missing_args');
  });

  it('returns session_lookup_failed when session is not found', async () => {
    const fake = makeFakeSupabase({
      sessionRow: null,
      templateRow: BASE_TEMPLATE,
      originalBytes: Buffer.from(''),
    });
    const out = await finalizeSigningSession({
      supabase: fake,
      bucket: 'tenant-assets',
      sessionId: SESSION_ID,
      signerName: 'X',
    });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'session_lookup_failed');
  });

  it('returns template_lookup_failed when template is not found', async () => {
    const fake = makeFakeSupabase({
      sessionRow: BASE_SESSION,
      templateRow: null,
      originalBytes: Buffer.from(''),
    });
    const out = await finalizeSigningSession({
      supabase: fake,
      bucket: 'tenant-assets',
      sessionId: SESSION_ID,
      signerName: 'X',
    });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'template_lookup_failed');
  });

  it('returns original_download_failed on storage error', async () => {
    const fake = makeFakeSupabase({
      sessionRow: BASE_SESSION,
      templateRow: BASE_TEMPLATE,
      originalBytes: Buffer.from(''),
      downloadError: { message: 'object not found' },
    });
    const out = await finalizeSigningSession({
      supabase: fake,
      bucket: 'tenant-assets',
      sessionId: SESSION_ID,
      signerName: 'X',
    });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'original_download_failed');
  });

  it('returns storage_upload_failed when upload errors', async () => {
    const original = await makeFixturePdf();
    const fake = makeFakeSupabase({
      sessionRow: BASE_SESSION,
      templateRow: BASE_TEMPLATE,
      originalBytes: original,
      uploadError: { message: 'permission denied' },
    });
    const out = await finalizeSigningSession({
      supabase: fake,
      bucket: 'tenant-assets',
      sessionId: SESSION_ID,
      signerName: 'X',
    });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'storage_upload_failed');
  });

  it('returns session_update_failed but reports the storage path', async () => {
    const original = await makeFixturePdf();
    const fake = makeFakeSupabase({
      sessionRow: BASE_SESSION,
      templateRow: BASE_TEMPLATE,
      originalBytes: original,
      sessionUpdateError: { message: 'row was deleted' },
    });
    const out = await finalizeSigningSession({
      supabase: fake,
      bucket: 'tenant-assets',
      sessionId: SESSION_ID,
      signerName: 'X',
    });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'session_update_failed');
    // The PDF IS in storage even though the row update failed — surface the
    // path so the operator can investigate / re-run.
    assert.equal(out.signedPdfStoragePath, `${TENANT}/signed/${SESSION_ID}.pdf`);
  });
});
