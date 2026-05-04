/**
 * docuseal-webhook.test.js
 *
 * Unit tests for the Supabase Storage mirror helpers added in 4VD-13.
 * These exercise the pure / mockable helpers exported from
 * routes/docuseal-webhook.js and do NOT require a running backend, a real
 * Supabase project, or DocuSeal connectivity.
 *
 * Run with:
 *   cd backend && node --test __tests__/routes/docuseal-webhook.test.js
 * or via the existing scripts (npm test / test:routes).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeTemplateName,
  buildDocusealStorageKey,
  fetchDocusealSignedPdf,
  mirrorSignedPdfToStorage,
} from '../../routes/docuseal-webhook.js';

// ---------------------------------------------------------------------------
// Helpers — fakes/stubs
// ---------------------------------------------------------------------------

/**
 * Build a minimal supabase client double whose .from(table).update(...)
 * .eq(...).filter(...) chain captures the calls. Each call returns either
 * { error: null } or { error: new Error(...) } depending on the configured
 * map. The chain returns `this` for builder methods until a Promise is
 * needed — both .update() and .filter() are awaitable here because tests
 * need them to behave as terminal operations.
 */
function makeFakeSupabase({ updateErrors = {} } = {}) {
  const calls = [];
  function makeBuilder(table) {
    const state = { table, op: null, payload: null, eqs: [], filters: [] };
    const builder = {
      update(payload) {
        state.op = 'update';
        state.payload = payload;
        return builder;
      },
      eq(col, val) {
        state.eqs.push([col, val]);
        return builder;
      },
      filter(col, op, val) {
        state.filters.push([col, op, val]);
        return builder;
      },
      then(resolve, reject) {
        // Awaiting the builder triggers the recorded operation.
        calls.push(state);
        const err = updateErrors[table];
        const result = err ? { error: err } : { error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  }
  return {
    calls,
    from(table) {
      return makeBuilder(table);
    },
  };
}

/**
 * Build a fake storage admin that records uploads and lets tests configure
 * upload errors and which URL flavor (public vs signed) to return.
 */
function makeFakeStorage({
  uploadError = null,
  publicUrl = 'https://example.supabase.co/object/public/tenant-assets/x.pdf',
  signedUrl = null,
} = {}) {
  const uploads = [];
  return {
    uploads,
    storage: {
      from(bucket) {
        return {
          async upload(key, body, opts) {
            uploads.push({ bucket, key, byteLength: body?.length ?? 0, opts });
            if (uploadError) return { error: uploadError, data: null };
            return { error: null, data: { path: key } };
          },
          getPublicUrl(_key) {
            return { data: { publicUrl } };
          },
          async createSignedUrl(_key, _expires) {
            if (!signedUrl) return { error: new Error('no_signed'), data: null };
            return { error: null, data: { signedUrl } };
          },
        };
      },
    },
  };
}

function makeFakeFetch({ status = 200, body = Buffer.from('%PDF-1.4 fake bytes') } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      async arrayBuffer() {
        return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
      },
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const BASE_SUBMISSION = {
  id: 'cf6f1a3e-0000-4000-a000-000000000001',
  docuseal_submission_id: '12345',
  template_name: 'MSA v1',
  signed_document_url: 'https://docuseal.example.com/d/abc.pdf',
};

// ---------------------------------------------------------------------------
// sanitizeTemplateName
// ---------------------------------------------------------------------------

describe('sanitizeTemplateName', () => {
  test('replaces unsafe characters with underscore', () => {
    assert.equal(
      sanitizeTemplateName('Master Services Agreement v1!'),
      'Master_Services_Agreement_v1',
    );
  });

  test('collapses repeated underscores and trims', () => {
    assert.equal(sanitizeTemplateName('  ___weird///name__  '), 'weird_name');
  });

  test('returns fallback for empty / non-string input', () => {
    assert.equal(sanitizeTemplateName(''), 'document');
    assert.equal(sanitizeTemplateName(null), 'document');
    assert.equal(sanitizeTemplateName(undefined), 'document');
    assert.equal(sanitizeTemplateName(42), 'document');
  });

  test('truncates to 80 chars max', () => {
    const long = 'a'.repeat(200);
    const out = sanitizeTemplateName(long);
    assert.ok(out.length <= 80, `expected ≤80, got ${out.length}`);
  });

  test('preserves dots and dashes', () => {
    assert.equal(sanitizeTemplateName('NDA-2026.v3'), 'NDA-2026.v3');
  });
});

// ---------------------------------------------------------------------------
// buildDocusealStorageKey
// ---------------------------------------------------------------------------

describe('buildDocusealStorageKey', () => {
  test('produces uploads/<tenant>/docuseal/<submission>_<template>.pdf', () => {
    const key = buildDocusealStorageKey({
      tenantId: '759a83e8-7340-4482-a586-cd2d049fb0b5',
      submissionId: '12345',
      templateName: 'MSA v1',
    });
    assert.equal(key, 'uploads/759a83e8-7340-4482-a586-cd2d049fb0b5/docuseal/12345_MSA_v1.pdf');
  });

  test('uses fallback template slug when name is missing', () => {
    const key = buildDocusealStorageKey({
      tenantId: 't1',
      submissionId: '99',
      templateName: null,
    });
    assert.equal(key, 'uploads/t1/docuseal/99_document.pdf');
  });
});

// ---------------------------------------------------------------------------
// fetchDocusealSignedPdf
// ---------------------------------------------------------------------------

describe('fetchDocusealSignedPdf', () => {
  test('sends X-Auth-Token when apiKey provided and returns Buffer', async () => {
    const fakeFetch = makeFakeFetch({ status: 200, body: Buffer.from('%PDF') });
    const buf = await fetchDocusealSignedPdf({
      url: 'https://docuseal.example.com/d/x.pdf',
      apiKey: 'secret-key',
      fetchImpl: fakeFetch,
    });
    assert.ok(Buffer.isBuffer(buf), 'expected Buffer');
    assert.equal(buf.toString(), '%PDF');
    assert.equal(fakeFetch.calls.length, 1);
    assert.equal(fakeFetch.calls[0].init.headers['X-Auth-Token'], 'secret-key');
    assert.equal(fakeFetch.calls[0].init.headers.Accept, 'application/pdf');
  });

  test('omits X-Auth-Token when no apiKey', async () => {
    const fakeFetch = makeFakeFetch();
    await fetchDocusealSignedPdf({
      url: 'https://x/y.pdf',
      apiKey: null,
      fetchImpl: fakeFetch,
    });
    assert.equal(
      fakeFetch.calls[0].init.headers['X-Auth-Token'],
      undefined,
      'should not send token without apiKey',
    );
  });

  test('throws on non-OK response', async () => {
    const fakeFetch = makeFakeFetch({ status: 502 });
    await assert.rejects(
      () =>
        fetchDocusealSignedPdf({
          url: 'https://x/y.pdf',
          apiKey: 'k',
          fetchImpl: fakeFetch,
        }),
      /docuseal_pdf_fetch_failed.*502/,
    );
  });
});

// ---------------------------------------------------------------------------
// mirrorSignedPdfToStorage — the integration of the above
// ---------------------------------------------------------------------------

describe('mirrorSignedPdfToStorage', () => {
  test('happy path: uploads, persists path, flips documents.file_url', async () => {
    const supabase = makeFakeSupabase();
    const storage = makeFakeStorage({ publicUrl: 'https://supabase.example/x.pdf' });
    const fakeFetch = makeFakeFetch({ body: Buffer.from('%PDF-fake') });

    const result = await mirrorSignedPdfToStorage({
      supabase,
      storageAdmin: storage,
      bucket: 'tenant-assets',
      tenantId: 'tnt-1',
      submission: { ...BASE_SUBMISSION },
      apiKey: 'k',
      fetchImpl: fakeFetch,
    });

    assert.equal(result.storagePath, 'uploads/tnt-1/docuseal/12345_MSA_v1.pdf');
    assert.equal(result.publicUrl, 'https://supabase.example/x.pdf');
    assert.ok(result.bytesUploaded > 0);

    // 1 upload occurred to the right bucket+key with PDF content type
    assert.equal(storage.uploads.length, 1);
    assert.equal(storage.uploads[0].bucket, 'tenant-assets');
    assert.equal(storage.uploads[0].key, 'uploads/tnt-1/docuseal/12345_MSA_v1.pdf');
    assert.equal(storage.uploads[0].opts.contentType, 'application/pdf');
    assert.equal(storage.uploads[0].opts.upsert, true);

    // Two updates: docuseal_submissions (storage path) and documents (file_url flip)
    const tables = supabase.calls.map((c) => c.table).sort();
    assert.deepEqual(tables, ['documents', 'docuseal_submissions']);

    const subUpdate = supabase.calls.find((c) => c.table === 'docuseal_submissions');
    assert.deepEqual(subUpdate.payload, {
      supabase_storage_path: 'uploads/tnt-1/docuseal/12345_MSA_v1.pdf',
    });
    assert.deepEqual(subUpdate.eqs, [['id', BASE_SUBMISSION.id]]);

    const docUpdate = supabase.calls.find((c) => c.table === 'documents');
    assert.deepEqual(docUpdate.payload, { file_url: 'https://supabase.example/x.pdf' });
    assert.deepEqual(docUpdate.eqs, [['tenant_id', 'tnt-1']]);
    assert.deepEqual(docUpdate.filters, [['metadata->>docuseal_submission_id', 'eq', '12345']]);
  });

  test('throws when signed_document_url is missing (caller swallows)', async () => {
    await assert.rejects(
      () =>
        mirrorSignedPdfToStorage({
          supabase: makeFakeSupabase(),
          storageAdmin: makeFakeStorage(),
          bucket: 'tenant-assets',
          tenantId: 'tnt-1',
          submission: { ...BASE_SUBMISSION, signed_document_url: null },
          apiKey: 'k',
          fetchImpl: makeFakeFetch(),
        }),
      /mirror_skipped/,
    );
  });

  test('throws when storage upload errors out', async () => {
    const storage = makeFakeStorage({ uploadError: new Error('boom') });
    await assert.rejects(
      () =>
        mirrorSignedPdfToStorage({
          supabase: makeFakeSupabase(),
          storageAdmin: storage,
          bucket: 'tenant-assets',
          tenantId: 'tnt-1',
          submission: { ...BASE_SUBMISSION },
          apiKey: 'k',
          fetchImpl: makeFakeFetch(),
        }),
      /storage_upload_failed.*boom/,
    );
  });

  test('throws when DB pointer update fails (bytes durable, retry safe)', async () => {
    const supabase = makeFakeSupabase({
      updateErrors: { docuseal_submissions: new Error('db_dead') },
    });
    await assert.rejects(
      () =>
        mirrorSignedPdfToStorage({
          supabase,
          storageAdmin: makeFakeStorage(),
          bucket: 'tenant-assets',
          tenantId: 'tnt-1',
          submission: { ...BASE_SUBMISSION },
          apiKey: 'k',
          fetchImpl: makeFakeFetch(),
        }),
      /storage_path_update_failed.*db_dead/,
    );
  });

  test('non-fatal when documents.file_url flip fails (still resolves)', async () => {
    const supabase = makeFakeSupabase({
      updateErrors: { documents: new Error('docs_dead') },
    });
    const result = await mirrorSignedPdfToStorage({
      supabase,
      storageAdmin: makeFakeStorage(),
      bucket: 'tenant-assets',
      tenantId: 'tnt-1',
      submission: { ...BASE_SUBMISSION },
      apiKey: 'k',
      fetchImpl: makeFakeFetch(),
    });
    assert.equal(result.storagePath, 'uploads/tnt-1/docuseal/12345_MSA_v1.pdf');
    // Both update calls happened; only documents errored.
    assert.equal(supabase.calls.length, 2);
  });

  test('falls back to signed URL when getPublicUrl returns nothing', async () => {
    const storage = makeFakeStorage({
      publicUrl: null,
      signedUrl: 'https://supabase.example/signed.pdf?token=zzz',
    });
    const result = await mirrorSignedPdfToStorage({
      supabase: makeFakeSupabase(),
      storageAdmin: storage,
      bucket: 'tenant-assets',
      tenantId: 'tnt-1',
      submission: { ...BASE_SUBMISSION },
      apiKey: 'k',
      fetchImpl: makeFakeFetch(),
    });
    assert.equal(result.publicUrl, 'https://supabase.example/signed.pdf?token=zzz');
  });
});
