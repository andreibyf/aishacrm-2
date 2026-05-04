/**
 * test-docuseal-mirror.js
 *
 * End-to-end synthetic test for the 4VD-13 Supabase Storage mirror.
 *
 * What it does (no DocuSeal round-trip required):
 *   1. Connects to the dev Supabase project using the service role key.
 *   2. Loads the dev tenant's DocuSeal integration row (api_credentials).
 *   3. Inserts a `docuseal_submissions` row in 'sent' state pointed at a
 *      real, publicly reachable PDF URL.
 *   4. Constructs a synthetic `submission.completed` webhook payload and
 *      signs it with the tenant's webhook_secret (HMAC-SHA256).
 *   5. POSTs the payload to the local backend's webhook endpoint.
 *   6. Polls the row until `supabase_storage_path` is populated (or fails).
 *   7. Verifies the object exists in `tenant-assets`.
 *   8. Verifies `documents.file_url` was flipped to the Supabase URL.
 *   9. Cleans up the row + storage object + documents row by default
 *      (pass --keep to skip cleanup for manual inspection).
 *
 * Usage (Windows PowerShell):
 *   cd C:\Users\andre\Documents\GitHub\aishacrm-2
 *   doppler run --project aishacrm --config dev_personal -- `
 *     node backend\scripts\test-docuseal-mirror.js
 *
 * Or directly with explicit env (assuming .env is loaded by your shell):
 *   node backend\scripts\test-docuseal-mirror.js
 *
 * Flags:
 *   --tenant-id=<uuid>      Override the dev tenant default
 *   --backend-url=<url>     Default http://localhost:4001
 *   --pdf-url=<url>         The "signed" PDF the webhook will mirror.
 *                           Default: a small, stable public test PDF.
 *   --keep                  Skip cleanup so you can inspect the artifacts
 *
 * Exit codes: 0 = pass, 1 = fail.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

// ---------------------------------------------------------------------------
// Args + defaults
// ---------------------------------------------------------------------------

const argv = Object.fromEntries(
  process.argv.slice(2).flatMap((a) => {
    if (a === '--keep') return [['keep', true]];
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [[m[1], m[2]]] : [];
  }),
);

const TENANT_ID = argv['tenant-id'] || '759a83e8-7340-4482-a586-cd2d049fb0b5';
const BACKEND_URL = (argv['backend-url'] || 'http://localhost:4001').replace(/\/$/, '');
// Mozilla-hosted PDF.js demo file — long-stable test asset (~1MB).
// Override with --pdf-url=... if it ever 404s.
const PDF_URL =
  argv['pdf-url'] || 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';
const KEEP = !!argv.keep;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'tenant-assets';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env.');
  console.error(
    'Run via doppler: doppler run --project aishacrm --config dev_personal -- node backend/scripts/test-docuseal-mirror.js',
  );
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Pretty logging
// ---------------------------------------------------------------------------

const STEP_PREFIX = '→'; // →
const OK_PREFIX = '✓'; // ✓
const FAIL_PREFIX = '✗'; // ✗

function step(msg) {
  console.log(`\n${STEP_PREFIX} ${msg}`);
}
function ok(msg) {
  console.log(`  ${OK_PREFIX} ${msg}`);
}
function fail(msg) {
  console.error(`  ${FAIL_PREFIX} ${msg}`);
}

function bail(msg, err) {
  fail(msg);
  if (err) console.error('   ', err.message || err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(72));
  console.log('DocuSeal storage-mirror smoke test (4VD-13)');
  console.log('='.repeat(72));
  console.log(`Tenant:      ${TENANT_ID}`);
  console.log(`Backend:     ${BACKEND_URL}`);
  console.log(`Supabase:    ${SUPABASE_URL}`);
  console.log(`PDF URL:     ${PDF_URL}`);
  console.log(`Keep on end: ${KEEP}`);

  // 1. Load tenant integration ------------------------------------------------
  step('Loading tenant_integrations row (DocuSeal)');
  const { data: integration, error: intErr } = await supa
    .from('tenant_integrations')
    .select('api_credentials, is_active')
    .eq('tenant_id', TENANT_ID)
    .eq('integration_type', 'docuseal')
    .maybeSingle();
  if (intErr) bail('Failed to load tenant_integrations', intErr);
  if (!integration)
    bail(
      'No docuseal integration row for this tenant. Configure it in Settings → Integrations first.',
    );
  if (!integration.is_active)
    bail('Integration is is_active=false. Activate it before running this test.');
  const webhookSecret = integration.api_credentials?.webhook_secret;
  if (!webhookSecret) bail('Integration has no api_credentials.webhook_secret');
  ok(`Webhook secret loaded (${webhookSecret.slice(0, 8)}…)`);

  // 2. Pick a contact ---------------------------------------------------------
  step('Selecting a contact in the dev tenant');
  const { data: contact, error: cErr } = await supa
    .from('contacts')
    .select('id, first_name, last_name, email')
    .eq('tenant_id', TENANT_ID)
    .limit(1)
    .maybeSingle();
  if (cErr) bail('Contact lookup failed', cErr);
  if (!contact) bail('No contacts found in the dev tenant. Create one first.');
  ok(
    `Contact: ${contact.first_name || ''} ${contact.last_name || ''} <${contact.email || 'n/a'}> (${contact.id})`,
  );

  // 3. Insert docuseal_submissions row ---------------------------------------
  step('Inserting synthetic docuseal_submissions row (status=sent)');
  const submissionExternalId = `synthetic-${Date.now()}`;
  const templateName = 'Mirror Smoke Test';
  const recipientEmail = 'mirror-smoke-test@example.com';
  const insertPayload = {
    tenant_id: TENANT_ID,
    docuseal_submission_id: submissionExternalId,
    docuseal_template_id: 'synthetic-template',
    template_name: templateName,
    related_to: 'contact',
    related_id: contact.id,
    recipient_name: 'Mirror Smoke Test',
    recipient_email: recipientEmail,
    status: 'sent',
    sent_at: new Date().toISOString(),
    metadata: { synthetic: true, source: 'test-docuseal-mirror.js' },
  };
  const { data: submission, error: sErr } = await supa
    .from('docuseal_submissions')
    .insert(insertPayload)
    .select()
    .single();
  if (sErr) bail('Insert failed', sErr);
  ok(`Submission row id=${submission.id} external_id=${submissionExternalId}`);

  // 4. Build + sign webhook payload ------------------------------------------
  step('Building synthetic submission.completed payload');
  const payload = {
    event_type: 'submission.completed',
    timestamp: new Date().toISOString(),
    event_id: `evt-${Date.now()}`,
    data: {
      id: submissionExternalId,
      submission_id: submissionExternalId,
      documents: [{ url: PDF_URL }],
      audit_log_url: null,
    },
  };
  const rawBody = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  ok(`Body bytes=${rawBody.length}  signature=sha256=${sig.slice(0, 12)}…`);

  // 5. POST to backend --------------------------------------------------------
  step(`Posting to ${BACKEND_URL}/api/webhooks/docuseal`);
  let postRes;
  try {
    postRes = await fetch(`${BACKEND_URL}/api/webhooks/docuseal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Docuseal-Signature': `sha256=${sig}`,
      },
      body: rawBody,
    });
  } catch (err) {
    await cleanup({
      submissionId: submission.id,
      externalId: submissionExternalId,
      storagePath: null,
    });
    bail('Backend unreachable. Is `docker compose up -d --build backend` complete?', err);
  }
  const respText = await postRes.text();
  if (postRes.status !== 200) {
    await cleanup({
      submissionId: submission.id,
      externalId: submissionExternalId,
      storagePath: null,
    });
    bail(`Webhook returned ${postRes.status}: ${respText.slice(0, 300)}`);
  }
  ok(`HTTP ${postRes.status} — ${respText.slice(0, 120)}`);

  // 6. Poll for supabase_storage_path ----------------------------------------
  step('Polling docuseal_submissions for supabase_storage_path');
  let updated = null;
  let storagePath = null;
  for (let i = 0; i < 20; i++) {
    const { data: row } = await supa
      .from('docuseal_submissions')
      .select('id, status, supabase_storage_path, signed_document_url')
      .eq('id', submission.id)
      .single();
    if (row?.supabase_storage_path) {
      updated = row;
      storagePath = row.supabase_storage_path;
      break;
    }
    if (row?.status !== 'completed') {
      // give the webhook a moment to land — status flip happens before the mirror
    }
    await sleep(500);
  }
  if (!updated) {
    // Even on timeout the documents row from step 8b may exist — look it up
    // explicitly so cleanup doesn't leave an orphan.
    const { data: orphanDocs } = await supa
      .from('documents')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .filter('metadata->>docuseal_submission_id', 'eq', submissionExternalId)
      .limit(1);
    await cleanup({
      submissionId: submission.id,
      externalId: submissionExternalId,
      storagePath: null,
      docId: orphanDocs?.[0]?.id,
    });
    bail(
      'Timed out waiting for supabase_storage_path. Check backend logs: docker compose logs --tail=80 backend',
    );
  }
  ok(`status=${updated.status}  path=${storagePath}`);

  // 7. Confirm the object exists in storage ----------------------------------
  step('Listing the storage object');
  const dir = storagePath.split('/').slice(0, -1).join('/');
  const fname = storagePath.split('/').pop();
  const { data: listing, error: lErr } = await supa.storage
    .from(BUCKET)
    .list(dir, { search: fname });
  if (lErr) {
    await cleanup({ submissionId: submission.id, externalId: submissionExternalId, storagePath });
    bail('Storage list failed', lErr);
  }
  const found = (listing || []).find((o) => o.name === fname);
  if (!found) {
    await cleanup({ submissionId: submission.id, externalId: submissionExternalId, storagePath });
    bail(`Storage object not found at ${BUCKET}:${storagePath}`);
  }
  const sizeKb = found.metadata?.size ? (found.metadata.size / 1024).toFixed(1) : '?';
  ok(`Object found: ${BUCKET}:${storagePath}  size=${sizeKb} KiB`);

  // 8. Verify documents.file_url was flipped ---------------------------------
  step('Checking documents.file_url flip');
  const { data: docs, error: dErr } = await supa
    .from('documents')
    .select('id, file_url, name')
    .eq('tenant_id', TENANT_ID)
    .filter('metadata->>docuseal_submission_id', 'eq', submissionExternalId)
    .limit(1);
  if (dErr) {
    await cleanup({ submissionId: submission.id, externalId: submissionExternalId, storagePath });
    bail('documents lookup failed', dErr);
  }
  const docRow = docs?.[0];
  if (!docRow) {
    fail(
      'No documents row was created (unexpected — the documents-mirror in step 8b should have inserted one).',
    );
  } else if (docRow.file_url === PDF_URL) {
    fail(
      `documents.file_url still points at the original PDF URL (${PDF_URL}). The flip did not happen.`,
    );
    await cleanup({
      submissionId: submission.id,
      externalId: submissionExternalId,
      storagePath,
      docId: docRow?.id,
    });
    process.exit(1);
  } else {
    ok(`documents.file_url=${docRow.file_url.slice(0, 80)}…`);
  }

  // 9. Cleanup ----------------------------------------------------------------
  if (KEEP) {
    console.log('\n--keep flag set; leaving test artifacts in place:');
    console.log(`  docuseal_submissions.id = ${submission.id}`);
    console.log(`  storage path             = ${BUCKET}:${storagePath}`);
    console.log(`  documents.id             = ${docRow?.id || 'n/a'}`);
  } else {
    await cleanup({
      submissionId: submission.id,
      externalId: submissionExternalId,
      storagePath,
      docId: docRow?.id,
    });
  }

  console.log('\n========================================================================');
  console.log('PASS — DocuSeal storage mirror is working end-to-end on dev.');
  console.log('========================================================================');
  process.exit(0);
}

async function cleanup({ submissionId, externalId, storagePath, docId }) {
  step('Cleaning up test artifacts');
  try {
    if (docId) {
      await supa.from('documents').delete().eq('id', docId);
      ok(`Deleted documents row ${docId}`);
    }
  } catch (e) {
    fail(`Failed to delete documents row: ${e.message}`);
  }
  try {
    if (submissionId) {
      // also nuke the related activities so we don't pollute the contact timeline
      await supa
        .from('activities')
        .delete()
        .eq('tenant_id', TENANT_ID)
        .filter('metadata->>docuseal_submission_id', 'eq', externalId);
      await supa.from('docuseal_submissions').delete().eq('id', submissionId);
      ok(`Deleted docuseal_submissions row ${submissionId} + related activities`);
    }
  } catch (e) {
    fail(`Failed to delete submission row: ${e.message}`);
  }
  try {
    if (storagePath) {
      await supa.storage.from(BUCKET).remove([storagePath]);
      ok(`Deleted storage object ${BUCKET}:${storagePath}`);
    }
  } catch (e) {
    fail(`Failed to delete storage object: ${e.message}`);
  }
}

main().catch((err) => {
  console.error('\nUNCAUGHT:', err);
  process.exit(1);
});
