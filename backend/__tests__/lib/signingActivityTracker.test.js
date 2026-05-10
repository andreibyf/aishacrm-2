// @ts-check
/**
 * signingActivityTracker — createSendActivity (4VD-43 day 4a fix).
 *
 * Background: the day-4a v1 of this helper passed `assignedTo: req.user.id`
 * into the activities insert. But `activities.assigned_to` is a FK to
 * `employees(id)`, NOT `users(id)`, so every insert silently failed via the
 * `.catch(() => undefined)` wrapper at the call site. Result: 20 sessions
 * accumulated in dev with zero matching activity rows.
 *
 * The fix: take `sentByUserEmail`, look up the matching employees row for
 * the same tenant, use that id for `assigned_to`. Stash the user_id and
 * email in metadata regardless so audit attribution survives even when no
 * employee record exists.
 *
 * These tests pin the resolution behavior without hitting a real database.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createSendActivity } from '../../lib/signingActivityTracker.js';

// ---------------------------------------------------------------------------
// Fake supabase client. Each .from(table) returns a chainable object that
// records the call and resolves to the configured `result`.
// ---------------------------------------------------------------------------

function makeFakeSupabase({
  employeeId = null,
  insertResult = null,
  leadRow = null,
  contactRow = null,
  accountRow = null,
}) {
  const calls = [];

  function chain(table) {
    const ctx = {
      table,
      filters: {},
      inserted: null,
      selected: null,
      then: undefined,
    };
    const builder = {
      select(cols) {
        ctx.selected = cols;
        return builder;
      },
      eq(col, val) {
        ctx.filters[col] = val;
        return builder;
      },
      ilike(col, val) {
        ctx.filters[col] = { op: 'ilike', val };
        return builder;
      },
      filter(col, op, val) {
        ctx.filters[col] = { op, val };
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle() {
        calls.push({ ...ctx, kind: 'maybeSingle' });
        if (table === 'employees') {
          return Promise.resolve({
            data: employeeId ? { id: employeeId } : null,
            error: null,
          });
        }
        if (table === 'leads') {
          return Promise.resolve({ data: leadRow, error: null });
        }
        if (table === 'contacts') {
          return Promise.resolve({ data: contactRow, error: null });
        }
        if (table === 'accounts') {
          return Promise.resolve({ data: accountRow, error: null });
        }
        if (table === 'activities') {
          // not used in lookup for createSendActivity send-time path
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      insert(payload) {
        ctx.inserted = payload;
        // Mock the chained .select('id').single() call after insert
        return {
          select() {
            return {
              single() {
                calls.push({ ...ctx, kind: 'insert' });
                if (insertResult) return Promise.resolve(insertResult);
                return Promise.resolve({
                  data: { id: 'new-activity-id' },
                  error: null,
                });
              },
            };
          },
        };
      },
      update() {
        return builder;
      },
    };
    return builder;
  }

  return {
    from(table) {
      return chain(table);
    },
    rpc() {
      // computeDocumentDueFields calls supabase.from('tenant').select(...)
      // not rpc, so this is just a stub for safety.
      return Promise.resolve({ data: null, error: null });
    },
    _calls: calls,
  };
}

const TENANT = '00000000-0000-0000-0000-000000000001';
const SESSION = {
  id: '11111111-1111-1111-1111-111111111111',
  related_to: 'lead',
  related_id: '22222222-2222-2222-2222-222222222222',
  recipient_email: 'recipient@example.com',
  recipient_name: 'Jane Recipient',
  message: 'Please review.',
  expires_at: '2026-05-23T00:00:00.000Z',
  created_at: '2026-05-09T20:00:00.000Z',
};

// ---------------------------------------------------------------------------

describe('createSendActivity — assigned_to FK resolution', () => {
  it('resolves user email to employees.id and uses it as assigned_to', async () => {
    const fake = makeFakeSupabase({ employeeId: 'emp-uuid-123' });
    const out = await createSendActivity({
      supabase: fake,
      tenantId: TENANT,
      session: SESSION,
      templateName: 'Service Agreement',
      sentByUserId: 'user-uuid-aaa',
      sentByUserEmail: 'sender@company.com',
    });
    assert.equal(out.ok, true);
    assert.equal(out.activityId, 'new-activity-id');

    // Verify employees lookup happened on tenant + email.
    const empLookup = fake._calls.find((c) => c.table === 'employees' && c.kind === 'maybeSingle');
    assert.ok(empLookup, 'employees lookup must occur');
    assert.equal(empLookup.filters.tenant_id, TENANT);
    assert.deepEqual(empLookup.filters.email, {
      op: 'ilike',
      val: 'sender@company.com',
    });

    // Verify insert was called with the resolved employee id, not the user id.
    const insert = fake._calls.find((c) => c.table === 'activities' && c.kind === 'insert');
    assert.ok(insert, 'activities insert must occur');
    assert.equal(insert.inserted.assigned_to, 'emp-uuid-123');
    // user identifiers stashed in metadata for audit even though they're
    // not the FK target.
    assert.equal(insert.inserted.metadata.sent_by_user_id, 'user-uuid-aaa');
    assert.equal(insert.inserted.metadata.sent_by_user_email, 'sender@company.com');
  });

  it('falls back to assigned_to=null when no matching employee exists', async () => {
    const fake = makeFakeSupabase({ employeeId: null });
    const out = await createSendActivity({
      supabase: fake,
      tenantId: TENANT,
      session: SESSION,
      templateName: 'Service Agreement',
      sentByUserId: 'user-uuid-bbb',
      sentByUserEmail: 'orphan@company.com',
    });
    assert.equal(out.ok, true);

    const insert = fake._calls.find((c) => c.table === 'activities' && c.kind === 'insert');
    // No FK violation — assigned_to is null when lookup misses.
    assert.equal(insert.inserted.assigned_to, null);
    // user metadata still stashed even though no employee match.
    assert.equal(insert.inserted.metadata.sent_by_user_email, 'orphan@company.com');
  });

  it('passes assigned_to=null when no email is provided', async () => {
    const fake = makeFakeSupabase({ employeeId: 'should-not-be-used' });
    const out = await createSendActivity({
      supabase: fake,
      tenantId: TENANT,
      session: SESSION,
      templateName: 'Service Agreement',
      sentByUserId: null,
      sentByUserEmail: null,
    });
    assert.equal(out.ok, true);
    const insert = fake._calls.find((c) => c.table === 'activities' && c.kind === 'insert');
    // Without an email, the lookup is skipped entirely → null.
    assert.equal(insert.inserted.assigned_to, null);
    // Verify the lookup was NOT called for an empty email.
    const empLookup = fake._calls.find((c) => c.table === 'employees' && c.kind === 'maybeSingle');
    assert.equal(empLookup, undefined, 'employees lookup must be skipped when email is null');
  });

  it('writes core metadata fields for downstream lifecycle updates', async () => {
    const fake = makeFakeSupabase({ employeeId: 'emp-uuid-456' });
    await createSendActivity({
      supabase: fake,
      tenantId: TENANT,
      session: SESSION,
      templateName: 'NDA',
      sentByUserId: 'user-uuid-ccc',
      sentByUserEmail: 'sender@company.com',
    });
    const insert = fake._calls.find((c) => c.table === 'activities' && c.kind === 'insert');
    assert.equal(insert.inserted.metadata.signing_session_id, SESSION.id);
    assert.equal(insert.inserted.metadata.template_name, 'NDA');
    assert.equal(insert.inserted.metadata.recipient_email, SESSION.recipient_email);
    assert.equal(insert.inserted.metadata.recipient_name, SESSION.recipient_name);
    // Lifecycle slots pre-allocated so update-for-* paths can stamp into them.
    assert.equal(insert.inserted.metadata.viewed_at, null);
    assert.equal(insert.inserted.metadata.signed_at, null);
    assert.equal(insert.inserted.metadata.declined_at, null);
    // Source tag for downstream filtering / debugging.
    assert.equal(insert.inserted.metadata.source, '4vd-43-signing');
  });
});

describe('createSendActivity — related_name + related_email resolution', () => {
  // Calling-convention regression test: resolveRelatedEntityFields takes
  // POSITIONAL args (supabase, tenantId, relatedTo, relatedId), not an
  // object. The day-4a v1 of createSendActivity called it with a single
  // object argument — destructured params all received undefined, the
  // helper early-returned its `empty` value, and every signing activity
  // ended up with related_name=null. Confirmed in dev: 13/13 rows had
  // null related_name. Pin the correct calling shape so this can't
  // regress silently.

  it('resolves a lead\'s "First Last" + email and stamps it on the activity row', async () => {
    const fake = makeFakeSupabase({
      employeeId: 'emp-1',
      leadRow: { first_name: 'Test', last_name: 'Lead', email: 'test@lead.com' },
    });
    await createSendActivity({
      supabase: fake,
      tenantId: TENANT,
      session: { ...SESSION, related_to: 'lead', related_id: 'lead-uuid' },
      templateName: 'Service Agreement',
      sentByUserId: 'user-1',
      sentByUserEmail: 'sender@company.com',
    });
    const insert = fake._calls.find((c) => c.table === 'activities' && c.kind === 'insert');
    assert.equal(
      insert.inserted.related_name,
      'Test Lead',
      'lead first+last must compose into related_name',
    );
    assert.equal(insert.inserted.related_email, 'test@lead.com');
  });

  it("resolves an account's single name field", async () => {
    const fake = makeFakeSupabase({
      employeeId: 'emp-1',
      accountRow: { name: 'Acme Corp', email: 'info@acme.com' },
    });
    await createSendActivity({
      supabase: fake,
      tenantId: TENANT,
      session: { ...SESSION, related_to: 'account', related_id: 'acct-uuid' },
      templateName: 'NDA',
      sentByUserEmail: 'sender@company.com',
    });
    const insert = fake._calls.find((c) => c.table === 'activities' && c.kind === 'insert');
    assert.equal(insert.inserted.related_name, 'Acme Corp');
    assert.equal(insert.inserted.related_email, 'info@acme.com');
  });

  it('falls back to null on missing entity row without throwing', async () => {
    // leadRow defaults to null in the fake — simulates a row deleted between
    // signing_session creation and activity-tracker firing.
    const fake = makeFakeSupabase({ employeeId: 'emp-1' });
    const out = await createSendActivity({
      supabase: fake,
      tenantId: TENANT,
      session: { ...SESSION, related_to: 'lead', related_id: 'orphan' },
      templateName: 'Service Agreement',
      sentByUserEmail: 'sender@company.com',
    });
    assert.equal(out.ok, true);
    const insert = fake._calls.find((c) => c.table === 'activities' && c.kind === 'insert');
    assert.equal(insert.inserted.related_name, null);
    assert.equal(insert.inserted.related_email, null);
  });

  it('queries the related entity with both tenant_id AND id filters (cross-tenant defense)', async () => {
    // The helper always filters on (tenant_id, id) — important so a stray
    // related_id from a different tenant can't leak the row name.
    const fake = makeFakeSupabase({
      employeeId: 'emp-1',
      leadRow: { first_name: 'Test', last_name: 'Lead', email: 'x@y.com' },
    });
    await createSendActivity({
      supabase: fake,
      tenantId: TENANT,
      session: { ...SESSION, related_to: 'lead', related_id: 'lead-uuid' },
      templateName: 'Service Agreement',
      sentByUserEmail: 'sender@company.com',
    });
    const leadLookup = fake._calls.find((c) => c.table === 'leads' && c.kind === 'maybeSingle');
    assert.ok(leadLookup, 'leads table must be queried');
    assert.equal(leadLookup.filters.tenant_id, TENANT);
    assert.equal(leadLookup.filters.id, 'lead-uuid');
  });
});
