// @ts-check
/**
 * resolveAssignedTo (4VD-44).
 *
 * Pins the contract that the helper:
 *   1. Returns a UUID-input as-is (caller already validated, FK constraint
 *      will reject any non-employee UUID at INSERT time).
 *   2. Resolves an email to the matching `employees.id` for the same
 *      tenant via case-insensitive lookup.
 *   3. Returns null when no employee matches the email — does NOT fall
 *      back to the `users` table (the fallback was the 4VD-44 bug).
 *   4. Returns null on any non-string / falsy / non-email input that
 *      isn't a UUID.
 *   5. Degrades gracefully on supabase error / throw (returns null,
 *      doesn't propagate).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveAssignedTo } from '../../lib/resolveAssignedTo.js';

const TENANT = '00000000-0000-0000-0000-00000000000a';
const EMPLOYEE_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Build a fake supabase client that resolves the .from('employees').
 * select('id').eq().ilike().limit().maybeSingle() chain to a pre-canned
 * response. Captures the table-name + filters applied so tests can
 * assert the call shape.
 */
function makeFakeSupabase({
  employeeRow = null,
  error = null,
  throwOn = null,
} = {}) {
  const calls = [];
  function chain(table) {
    if (table === throwOn) throw new Error('connection refused');
    const ctx = { table, filters: {} };
    const builder = {
      select(cols) {
        ctx.cols = cols;
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
      limit() {
        return builder;
      },
      maybeSingle() {
        calls.push(ctx);
        return Promise.resolve({ data: employeeRow, error });
      },
    };
    return builder;
  }
  return {
    from(table) {
      return chain(table);
    },
    _calls: calls,
  };
}

describe('resolveAssignedTo — UUID input passthrough', () => {
  it('returns a valid UUID as-is without hitting the database', async () => {
    const fake = makeFakeSupabase();
    const out = await resolveAssignedTo(fake, TENANT, EMPLOYEE_ID);
    assert.equal(out, EMPLOYEE_ID);
    assert.equal(fake._calls.length, 0, 'must not query db for already-UUID input');
  });

  it('treats a UUID as case-insensitive (uppercase still matches)', async () => {
    const fake = makeFakeSupabase();
    const upper = EMPLOYEE_ID.toUpperCase();
    const out = await resolveAssignedTo(fake, TENANT, upper);
    assert.equal(out, upper);
  });
});

describe('resolveAssignedTo — email -> employees.id', () => {
  it('looks up employees by tenant + case-insensitive email', async () => {
    const fake = makeFakeSupabase({ employeeRow: { id: EMPLOYEE_ID } });
    const out = await resolveAssignedTo(fake, TENANT, 'Sender@Company.COM');
    assert.equal(out, EMPLOYEE_ID);
    assert.equal(fake._calls.length, 1);
    assert.equal(fake._calls[0].table, 'employees');
    assert.equal(fake._calls[0].filters.tenant_id, TENANT);
    // Email must be normalized to lowercase before passing to ilike
    assert.deepEqual(fake._calls[0].filters.email, {
      op: 'ilike',
      val: 'sender@company.com',
    });
  });

  it('returns null when no employee matches the email (NO users-table fallback)', async () => {
    // 4VD-44: previously this returned a users.id, which was incompatible
    // with the activities.assigned_to FK to employees.id. The fix is to
    // return null and let the caller decide. Pin that behavior.
    const fake = makeFakeSupabase({ employeeRow: null });
    const out = await resolveAssignedTo(fake, TENANT, 'orphan@nowhere.com');
    assert.equal(out, null);
    assert.equal(fake._calls.length, 1, 'must NOT make a fallback users-table call');
    assert.equal(fake._calls[0].table, 'employees');
  });

  it('returns null on supabase error', async () => {
    const fake = makeFakeSupabase({ error: { message: 'permission denied' } });
    const out = await resolveAssignedTo(fake, TENANT, 'sender@company.com');
    assert.equal(out, null);
  });

  it('returns null when the supabase chain throws (no propagation)', async () => {
    const fake = makeFakeSupabase({ throwOn: 'employees' });
    const out = await resolveAssignedTo(fake, TENANT, 'sender@company.com');
    assert.equal(out, null);
  });
});

describe('resolveAssignedTo — invalid input', () => {
  it('returns null for falsy assignedTo', async () => {
    const fake = makeFakeSupabase();
    assert.equal(await resolveAssignedTo(fake, TENANT, null), null);
    assert.equal(await resolveAssignedTo(fake, TENANT, undefined), null);
    assert.equal(await resolveAssignedTo(fake, TENANT, ''), null);
  });

  it('returns null for non-string assignedTo (type-confusion guard)', async () => {
    const fake = makeFakeSupabase();
    // @ts-expect-error — intentional type-violation test
    assert.equal(await resolveAssignedTo(fake, TENANT, 12345), null);
    // @ts-expect-error — intentional type-violation test
    assert.equal(await resolveAssignedTo(fake, TENANT, { id: 'x' }), null);
    // @ts-expect-error — intentional type-violation test
    assert.equal(await resolveAssignedTo(fake, TENANT, ['x']), null);
  });

  it('returns null for a string that is neither UUID nor email', async () => {
    const fake = makeFakeSupabase();
    const out = await resolveAssignedTo(fake, TENANT, 'just-some-name');
    assert.equal(out, null);
    assert.equal(fake._calls.length, 0, 'no db lookup for non-email non-UUID strings');
  });
});
