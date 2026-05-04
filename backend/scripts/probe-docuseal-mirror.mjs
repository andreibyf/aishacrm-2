/**
 * probe-docuseal-mirror.mjs
 *
 * Isolates each stage of the mirror pipeline so we can pinpoint which one
 * is failing inside the running backend container.
 *
 * Run:
 *   docker compose exec backend node /app/scripts/probe-docuseal-mirror.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { fetchDocusealSignedPdf } from '../routes/docuseal-webhook.js';

const TENANT_ID = '759a83e8-7340-4482-a586-cd2d049fb0b5';
const PDF_URL = 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'tenant-assets';

console.log('---------------------------------------------------------------');
console.log('DocuSeal mirror probe');
console.log('---------------------------------------------------------------');
console.log('SUPABASE_URL  =', process.env.SUPABASE_URL || '(unset)');
console.log('SERVICE_ROLE  =', process.env.SUPABASE_SERVICE_ROLE_KEY ? '(present)' : '(MISSING)');
console.log('BUCKET        =', BUCKET);
console.log('PDF_URL       =', PDF_URL);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in container env.');
  process.exit(1);
}

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// Stage 1: fetch the PDF
// ---------------------------------------------------------------------------
console.log('\n[1/4] Fetching PDF...');
let pdf;
try {
  pdf = await fetchDocusealSignedPdf({ url: PDF_URL, fetchImpl: fetch });
  console.log(`  ✓ ${pdf.length} bytes`);
} catch (e) {
  console.error(`  ✗ FAIL: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Stage 2: list buckets (sanity)
// ---------------------------------------------------------------------------
console.log('\n[2/4] Listing storage buckets...');
const { data: buckets, error: bErr } = await supa.storage.listBuckets();
if (bErr) {
  console.error(`  ✗ FAIL: ${bErr.message}`);
  process.exit(1);
}
console.log('  Buckets:', buckets.map((b) => `${b.name}${b.public ? ' (public)' : ''}`).join(', '));
const target = buckets.find((b) => b.name === BUCKET);
if (!target) {
  console.error(`  ✗ Bucket "${BUCKET}" does not exist on this project.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Stage 3: upload the bytes
// ---------------------------------------------------------------------------
console.log('\n[3/4] Uploading to storage...');
const key = `uploads/${TENANT_ID}/docuseal/probe-${Date.now()}.pdf`;
const { data: up, error: uErr } = await supa.storage.from(BUCKET).upload(key, pdf, {
  contentType: 'application/pdf',
  upsert: true,
});
if (uErr) {
  console.error(`  ✗ FAIL: ${uErr.message}`);
  console.error('  Full error:', JSON.stringify(uErr, null, 2));
  process.exit(1);
}
console.log(`  ✓ uploaded path=${up.path}`);

// ---------------------------------------------------------------------------
// Stage 4: getPublicUrl + cleanup
// ---------------------------------------------------------------------------
console.log('\n[4/4] Resolving public URL + cleanup...');
const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(key);
console.log(`  publicUrl = ${pub?.publicUrl || '(none)'}`);
const { error: rErr } = await supa.storage.from(BUCKET).remove([key]);
if (rErr) console.error(`  cleanup error: ${rErr.message}`);
else console.log('  ✓ removed probe object');

console.log('\nALL STAGES PASSED — the mirror pipeline is healthy in isolation.');
console.log('If the webhook is still failing, the bug is in the helper plumbing,');
console.log('not the underlying network/storage path.');
