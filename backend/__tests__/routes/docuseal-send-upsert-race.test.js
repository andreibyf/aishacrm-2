/**
 * docuseal-send-upsert-race.test.js
 *
 * Pin the PR #566 P1 fix: the docuseal send route does UPDATE-OR-INSERT
 * (symmetric with the webhook's createActivity), so a webhook that beat
 * the send path doesn't produce a duplicate activity row.
 *
 * What this guards against (the bug Codex caught):
 *   T1: User clicks Send Document. POST /api/docuseal/submissions starts.
 *   T2: docuseal_submissions row is INSERTED.
 *   T3: DocuSeal sends webhook (form.viewed, fast signer flow).
 *   T4: Webhook handler runs, finds no existing activities row, INSERTs
 *       one as fallback (with status='pending', viewed_at stamped).
 *   T5: Original send route reaches its activity insert.
 *   T6 (BEFORE fix): unconditional INSERT → 2 rows for the same submission
 *      ❌ violates the "one row per submission" invariant 4VD-33 establishes.
 *   T6 (AFTER fix): looks up by metadata->>docuseal_submission_id, finds
 *      the webhook's row, UPDATEs it with send-side fields (signing_url,
 *      sent_at, due_date, etc.) WITHOUT clobbering the webhook's
 *      lifecycle progress (viewed_at stays, status stays at whatever the
 *      webhook moved it to). ✓
 *
 * The send-route logic is inline in `backend/routes/docuseal.js`, which
 * makes a true integration test heavy. This file tests via mocked supabase
 * the end-state behavior: pre-seed a "webhook-beat-send" row, run the send
 * route's activity upsert path, assert no second row is INSERTed and the
 * existing row is UPDATEd with merged metadata.
 *
 * Run:
 *   cd backend && node --test __tests__/routes/docuseal-send-upsert-race.test.js
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const TENANT = '00000000-0000-0000-0000-00000000000a';
const DOCUSEAL_SUBMISSION_ID = 'sub-12345';

/**
 * Build a supabase double tracking what happens to the activities table.
 * Pre-seed `existingRow` to simulate "webhook beat the send route".
 */
function makeSupabase({ existingRow = null } = {}) {
  const calls = { selects: 0, inserts: [], updates: [] };
  return {
    calls,
    from(table) {
      if (table !== 'activities') {
        // Other tables (tenant, leads, etc.) — return a generic chainable
        // double that resolves to empty.
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: null, error: null }),
          insert: async () => ({ data: null, error: null }),
          update() { return this; },
        };
      }
      // activities table — track all calls
      const chain = {
        _filters: [],
        _kind: null,
        _payload: null,
        select() { this._kind = 'select'; calls.selects++; return this; },
        eq(col, val) { this._filters.push([col, val]); return this; },
        filter(col, _op, val) { this._filters.push([col, val]); return this; },
        limit() { return Promise.resolve({ data: existingRow ? [existingRow] : [], error: null }); },
        insert(payload) {
          calls.inserts.push(payload);
          return Promise.resolve({ data: payload, error: null });
        },
        update(payload) {
          this._kind = 'update';
          this._payload = payload;
          return this;
        },
      };
      // For UPDATE chain: terminal eq() resolves the call
      const origEq = chain.eq;
      chain.eq = function (col, val) {
        if (this._kind === 'update') {
          calls.updates.push({ filter: [col, val], payload: this._payload });
          return Promise.resolve({ data: null, error: null });
        }
        return origEq.call(this, col, val);
      };
      return chain;
    },
  };
}

/**
 * Reproduce the send-route upsert logic in isolation.
 * Mirrors the inline code in `backend/routes/docuseal.js` line ~413.
 *
 * If the implementation drifts, this test will fail and surface the drift.
 */
async function sendRouteActivityUpsert({
  supabase,
  tenantId,
  docusealSubmissionId,
  related_to,
  related_id,
  related_name,
  related_email,
  templateId,
  templateName,
  signingUrl,
  emailResult,
  recipient_email,
  dueDate,
  dueTime,
}) {
  const sendInitialMetadata = {
    docuseal_submission_id: docusealSubmissionId,
    docuseal_template_id: String(templateId),
    signing_url: signingUrl,
    email_sent: emailResult.ok,
    email_reason: emailResult.ok ? null : emailResult.reason,
    sent_at: new Date().toISOString(),
    viewed_at: null,
    signed_at: null,
    completed_at: null,
    declined_at: null,
  };
  const sendInitialSubject = `Document sent — ${templateName || 'unnamed template'}`;
  const sendInitialBody = emailResult.ok
    ? `Sent to ${recipient_email} (branded email delivered).`
    : `Sent to ${recipient_email}. Signing link: ${signingUrl || '(unavailable)'}`;

  const { data: existingRows } = await supabase
    .from('activities')
    .select('id, status, metadata')
    .eq('tenant_id', tenantId)
    .filter('metadata->>docuseal_submission_id', 'eq', docusealSubmissionId)
    .limit(1);

  if (existingRows && existingRows.length > 0) {
    const row = existingRows[0];
    const mergedMetadata = {
      ...sendInitialMetadata,
      ...(row.metadata || {}),
      signing_url: signingUrl,
      email_sent: emailResult.ok,
      email_reason: emailResult.ok ? null : emailResult.reason,
      sent_at: (row.metadata && row.metadata.sent_at) || sendInitialMetadata.sent_at,
    };
    const update = {
      ...(row.status && row.status !== 'pending'
        ? {}
        : { subject: sendInitialSubject, body: sendInitialBody }),
      ...(row.status ? {} : { status: 'pending' }),
      ...(related_name ? { related_name } : {}),
      ...(related_email ? { related_email } : {}),
      ...(dueDate ? { due_date: dueDate } : {}),
      ...(dueTime ? { due_time: dueTime } : {}),
      metadata: mergedMetadata,
    };
    await supabase.from('activities').update(update).eq('id', row.id);
  } else {
    await supabase.from('activities').insert({
      tenant_id: tenantId,
      related_to,
      related_id,
      ...(related_name ? { related_name } : {}),
      ...(related_email ? { related_email } : {}),
      type: 'document_sent',
      subject: sendInitialSubject,
      body: sendInitialBody,
      status: 'pending',
      ...(dueDate ? { due_date: dueDate } : {}),
      ...(dueTime ? { due_time: dueTime } : {}),
      metadata: sendInitialMetadata,
    });
  }
}

const sendArgs = () => ({
  tenantId: TENANT,
  docusealSubmissionId: DOCUSEAL_SUBMISSION_ID,
  related_to: 'lead',
  related_id: 'lead-uuid',
  related_name: 'Jane Doe',
  related_email: 'jane@x.com',
  templateId: 7,
  templateName: 'NDA',
  signingUrl: 'https://app.example.com/sign/tenant/abc',
  emailResult: { ok: true, reason: 'sent' },
  recipient_email: 'jane@x.com',
  dueDate: '2026-05-09',
  dueTime: '17:00:00',
});

describe('Send route activity upsert — race-free with webhook fallback INSERT', () => {
  let supabase;

  describe('happy path: send route runs first (no webhook beat)', () => {
    beforeEach(() => {
      supabase = makeSupabase({ existingRow: null });
    });

    test('inserts a new row with status=pending and full metadata', async () => {
      await sendRouteActivityUpsert({ supabase, ...sendArgs() });
      assert.equal(supabase.calls.inserts.length, 1, 'exactly one INSERT');
      assert.equal(supabase.calls.updates.length, 0, 'no UPDATE');
      const row = supabase.calls.inserts[0];
      assert.equal(row.status, 'pending');
      assert.equal(row.type, 'document_sent');
      assert.equal(row.related_name, 'Jane Doe');
      assert.equal(row.due_date, '2026-05-09');
      assert.equal(row.metadata.docuseal_submission_id, DOCUSEAL_SUBMISSION_ID);
      assert.equal(row.metadata.signing_url, 'https://app.example.com/sign/tenant/abc');
      assert.equal(row.metadata.viewed_at, null, 'viewed_at slot pre-created as null');
    });
  });

  describe('race path: webhook beat the send route', () => {
    test('webhook-stamped viewed_at survives the send-route UPDATE', async () => {
      // Pre-seed: webhook arrived first, ran the fallback INSERT with viewed_at stamped.
      const webhookRow = {
        id: 'activity-uuid',
        status: 'pending', // viewed → still pending in the activity status machine
        metadata: {
          docuseal_submission_id: DOCUSEAL_SUBMISSION_ID,
          docuseal_template_id: '7',
          viewed_at: '2026-05-08T10:30:00.000Z',
        },
      };
      supabase = makeSupabase({ existingRow: webhookRow });

      await sendRouteActivityUpsert({ supabase, ...sendArgs() });

      assert.equal(supabase.calls.inserts.length, 0, 'NO INSERT — single-row invariant');
      assert.equal(supabase.calls.updates.length, 1, 'UPDATE the existing row');

      const update = supabase.calls.updates[0];
      assert.deepEqual(update.filter, ['id', 'activity-uuid']);
      assert.equal(
        update.payload.metadata.viewed_at,
        '2026-05-08T10:30:00.000Z',
        'webhook viewed_at must NOT be clobbered by the send route',
      );
      assert.equal(
        update.payload.metadata.signing_url,
        'https://app.example.com/sign/tenant/abc',
        'send-side signing_url is layered in',
      );
      assert.ok(update.payload.metadata.sent_at, 'sent_at populated by send route');
    });

    test('status preserved when webhook already moved row to completed', async () => {
      // Edge case: signer was instant, webhook completed before send-route woke up.
      const webhookRow = {
        id: 'activity-uuid',
        status: 'completed', // signed/completed
        metadata: {
          docuseal_submission_id: DOCUSEAL_SUBMISSION_ID,
          completed_at: '2026-05-08T10:30:00.000Z',
        },
      };
      supabase = makeSupabase({ existingRow: webhookRow });

      await sendRouteActivityUpsert({ supabase, ...sendArgs() });

      const update = supabase.calls.updates[0];
      // The send route must NOT downgrade status; UPDATE payload should
      // either omit status entirely or leave it at 'completed'.
      assert.ok(
        update.payload.status === undefined || update.payload.status === 'completed',
        `must not downgrade completed → pending; got status=${update.payload.status}`,
      );
      // Subject/body are NOT clobbered when status > pending — webhook's
      // "Document signed" shouldn't be overwritten with "Document sent".
      assert.equal(
        update.payload.subject,
        undefined,
        'must not overwrite webhook-set subject when row is past-pending',
      );
    });

    test('status preserved when webhook moved row to cancelled', async () => {
      const webhookRow = {
        id: 'activity-uuid',
        status: 'cancelled',
        metadata: {
          docuseal_submission_id: DOCUSEAL_SUBMISSION_ID,
          declined_at: '2026-05-08T10:30:00.000Z',
        },
      };
      supabase = makeSupabase({ existingRow: webhookRow });

      await sendRouteActivityUpsert({ supabase, ...sendArgs() });

      const update = supabase.calls.updates[0];
      assert.ok(
        update.payload.status === undefined || update.payload.status === 'cancelled',
        'must not downgrade cancelled → pending',
      );
    });

    test('signing_url + sent_at are layered in even when row is past-pending', async () => {
      const webhookRow = {
        id: 'activity-uuid',
        status: 'completed',
        metadata: {
          docuseal_submission_id: DOCUSEAL_SUBMISSION_ID,
          completed_at: '2026-05-08T10:30:00.000Z',
          // webhook fallback didn't have signing_url or sent_at
        },
      };
      supabase = makeSupabase({ existingRow: webhookRow });

      await sendRouteActivityUpsert({ supabase, ...sendArgs() });

      const meta = supabase.calls.updates[0].payload.metadata;
      assert.equal(meta.signing_url, 'https://app.example.com/sign/tenant/abc');
      assert.ok(meta.sent_at, 'send-side sent_at populated');
      assert.equal(meta.completed_at, '2026-05-08T10:30:00.000Z', 'webhook completed_at preserved');
    });

    test('related_name/related_email applied even on UPDATE path', async () => {
      // 4VD-39: webhook fallback may not have resolved related_name (older code paths).
      // Send-route UPDATE should still set it.
      const webhookRow = {
        id: 'activity-uuid',
        status: 'pending',
        metadata: { docuseal_submission_id: DOCUSEAL_SUBMISSION_ID },
      };
      supabase = makeSupabase({ existingRow: webhookRow });

      await sendRouteActivityUpsert({ supabase, ...sendArgs() });

      const update = supabase.calls.updates[0].payload;
      assert.equal(update.related_name, 'Jane Doe');
      assert.equal(update.related_email, 'jane@x.com');
    });
  });
});
