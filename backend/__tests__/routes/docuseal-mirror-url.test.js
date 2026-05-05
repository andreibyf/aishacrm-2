/**
 * docuseal-mirror-url.test.js
 *
 * Tests for the GET /api/docuseal/submissions response enrichment that adds
 * `mirror_url` (resolved Supabase Storage URL of the signed PDF) so the
 * Contact panel's Document Signatures card can prefer the durable mirror
 * over DocuSeal's hosted URL — closes the durability mismatch where the
 * paperclip and Document Management page already pointed at the Supabase
 * mirror but the workflow card pointed at the DocuSeal-hosted URL only.
 *
 * Run:
 *   cd backend && node --test __tests__/routes/docuseal-mirror-url.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSupabaseStorageUrl,
  enrichSubmissionsWithMirrorUrl,
} from '../../routes/docuseal.js';

// ---------------------------------------------------------------------------
// Storage client fakes
// ---------------------------------------------------------------------------

function makeStorageClient({ publicUrl, signedUrl, signedError } = {}) {
  return {
    storage: {
      from(_bucket) {
        return {
          getPublicUrl(_path) {
            return { data: publicUrl ? { publicUrl } : {} };
          },
          async createSignedUrl(_path, _ttl) {
            if (signedError) return { data: null, error: { message: signedError } };
            return { data: signedUrl ? { signedUrl } : null, error: null };
          },
        };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// resolveSupabaseStorageUrl
// ---------------------------------------------------------------------------

describe('resolveSupabaseStorageUrl', () => {
  test('returns null when path is empty/null/undefined', async () => {
    const supa = makeStorageClient({ publicUrl: 'https://x' });
    assert.equal(await resolveSupabaseStorageUrl(supa, 'tenant-assets', ''), null);
    assert.equal(await resolveSupabaseStorageUrl(supa, 'tenant-assets', null), null);
    assert.equal(await resolveSupabaseStorageUrl(supa, 'tenant-assets', undefined), null);
  });

  test('returns the public URL when bucket is public', async () => {
    const supa = makeStorageClient({ publicUrl: 'https://supa.example/public.pdf' });
    const url = await resolveSupabaseStorageUrl(supa, 'tenant-assets', 'uploads/t/x.pdf');
    assert.equal(url, 'https://supa.example/public.pdf');
  });

  test('falls back to a signed URL when no public URL is available', async () => {
    const supa = makeStorageClient({ signedUrl: 'https://supa.example/signed.pdf?token=abc' });
    const url = await resolveSupabaseStorageUrl(supa, 'tenant-assets', 'uploads/t/x.pdf');
    assert.equal(url, 'https://supa.example/signed.pdf?token=abc');
  });

  test('returns null and logs (not throws) when signed-url generation errors', async () => {
    const supa = makeStorageClient({ signedError: 'private bucket, key revoked' });
    const url = await resolveSupabaseStorageUrl(supa, 'tenant-assets', 'uploads/t/x.pdf');
    assert.equal(url, null);
  });

  test('returns null when storage client throws synchronously', async () => {
    const broken = {
      storage: {
        from() {
          throw new Error('storage unavailable');
        },
      },
    };
    const url = await resolveSupabaseStorageUrl(broken, 'tenant-assets', 'uploads/t/x.pdf');
    assert.equal(url, null);
  });
});

// ---------------------------------------------------------------------------
// enrichSubmissionsWithMirrorUrl
// ---------------------------------------------------------------------------

describe('enrichSubmissionsWithMirrorUrl', () => {
  test('returns input unchanged when array is empty or non-array', async () => {
    const supa = makeStorageClient({ publicUrl: 'https://x' });
    assert.deepEqual(await enrichSubmissionsWithMirrorUrl(supa, []), []);
    assert.deepEqual(await enrichSubmissionsWithMirrorUrl(supa, null), []);
    assert.deepEqual(await enrichSubmissionsWithMirrorUrl(supa, undefined), []);
  });

  test('leaves submissions without supabase_storage_path untouched', async () => {
    const supa = makeStorageClient({ publicUrl: 'https://supa.example/x.pdf' });
    const input = [
      { id: '1', status: 'sent', supabase_storage_path: null },
      { id: '2', status: 'pending' },
    ];
    const out = await enrichSubmissionsWithMirrorUrl(supa, input);
    assert.equal(out[0].mirror_url, undefined);
    assert.equal(out[1].mirror_url, undefined);
    // and the original objects should be unchanged
    assert.equal(out[0], input[0]);
    assert.equal(out[1], input[1]);
  });

  test('adds mirror_url to submissions that have a storage path', async () => {
    const supa = makeStorageClient({ publicUrl: 'https://supa.example/signed.pdf' });
    const input = [
      {
        id: '1',
        status: 'completed',
        supabase_storage_path: 'uploads/tnt/docuseal/abc.pdf',
        signed_document_url: 'https://docuseal.example/d/abc',
      },
    ];
    const out = await enrichSubmissionsWithMirrorUrl(supa, input);
    assert.equal(out[0].mirror_url, 'https://supa.example/signed.pdf');
    // and signed_document_url is preserved as the fallback
    assert.equal(out[0].signed_document_url, 'https://docuseal.example/d/abc');
  });

  test('omits mirror_url when storage resolution fails (frontend falls back to DocuSeal URL)', async () => {
    const supa = makeStorageClient({ signedError: 'bucket private, key missing' });
    const input = [
      {
        id: '1',
        status: 'completed',
        supabase_storage_path: 'uploads/tnt/docuseal/abc.pdf',
        signed_document_url: 'https://docuseal.example/d/abc',
      },
    ];
    const out = await enrichSubmissionsWithMirrorUrl(supa, input);
    assert.equal(out[0].mirror_url, undefined);
    // signed_document_url still present so the UI can use it
    assert.equal(out[0].signed_document_url, 'https://docuseal.example/d/abc');
  });

  test('mixed list — only entries with storage path get enriched', async () => {
    const supa = makeStorageClient({ publicUrl: 'https://supa.example/p.pdf' });
    const input = [
      { id: '1', status: 'completed', supabase_storage_path: 'a.pdf' },
      { id: '2', status: 'sent' },
      { id: '3', status: 'completed', supabase_storage_path: 'b.pdf' },
    ];
    const out = await enrichSubmissionsWithMirrorUrl(supa, input);
    assert.equal(out[0].mirror_url, 'https://supa.example/p.pdf');
    assert.equal(out[1].mirror_url, undefined);
    assert.equal(out[2].mirror_url, 'https://supa.example/p.pdf');
    // length and order preserved
    assert.equal(out.length, 3);
    assert.equal(out[0].id, '1');
    assert.equal(out[2].id, '3');
  });

  test('respects custom bucket option', async () => {
    let capturedBucket = null;
    const supa = {
      storage: {
        from(bucket) {
          capturedBucket = bucket;
          return {
            getPublicUrl: () => ({ data: { publicUrl: 'https://x/y.pdf' } }),
            createSignedUrl: async () => ({ data: null, error: null }),
          };
        },
      },
    };
    await enrichSubmissionsWithMirrorUrl(
      supa,
      [{ id: '1', supabase_storage_path: 'a.pdf' }],
      { bucket: 'custom-bucket' },
    );
    assert.equal(capturedBucket, 'custom-bucket');
  });
});
