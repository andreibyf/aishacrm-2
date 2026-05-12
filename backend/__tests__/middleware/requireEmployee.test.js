// @ts-check
/**
 * requireEmployee middleware tests (4VD-54).
 *
 * Run: cd backend && node --test __tests__/middleware/requireEmployee.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRequireEmployee } from '../../middleware/requireEmployee.js';

const TENANT_ID = '759a83e8-7340-4482-a586-cd2d049fb0b5';
const USER_EMPLOYEE_ID = 'eb85fb7c-2545-4d91-a20d-77f4b6af75e7';

/**
 * Mock supabase that returns whatever the test sets up.
 *
 * @param {object} opts
 * @param {object|null} opts.row    employees row to return (or null for not-found)
 * @param {Error|null}  [opts.error] error to return
 */
function makeFakeSupabase({ row, error = null }) {
  const calls = { eq: [], ilike: [], select: [] };
  const chain = {
    select: (cols) => {
      calls.select.push(cols);
      return chain;
    },
    eq: (col, val) => {
      calls.eq.push({ col, val });
      return chain;
    },
    ilike: (col, val) => {
      calls.ilike.push({ col, val });
      return chain;
    },
    limit: () => chain,
    maybeSingle: async () => ({ data: row, error }),
  };
  return {
    from: () => chain,
    _calls: calls,
  };
}

/**
 * Make a mock Express res object that captures status + json calls.
 */
function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
  return res;
}

describe('requireEmployee — happy path', () => {
  it('calls next() and sets req.user.employee_id when employees row exists', async () => {
    const fake = makeFakeSupabase({ row: { id: USER_EMPLOYEE_ID, status: 'active' } });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

    const req = {
      user: { id: 'u-1', email: 'andrei.byfield@gmail.com', tenant_id: TENANT_ID },
      tenant: { id: TENANT_ID },
    };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true, 'next() must be called on match');
    assert.equal(req.user.employee_id, USER_EMPLOYEE_ID);
    assert.equal(res._status, 200, 'status was not changed');
  });

  it('selects status column so the inactive filter can apply', async () => {
    const fake = makeFakeSupabase({ row: { id: USER_EMPLOYEE_ID, status: 'active' } });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });
    const req = {
      user: { id: 'u-1', email: 'andrei.byfield@gmail.com', tenant_id: TENANT_ID },
      tenant: { id: TENANT_ID },
    };
    await mw(req, makeRes(), () => {});
    const selectCall = fake._calls.select[0] || '';
    assert.ok(
      String(selectCall).includes('status'),
      'select() must include status column for the active-check',
    );
  });

  it('uses req.user.tenant_id when req.tenant.id is absent', async () => {
    const fake = makeFakeSupabase({ row: { id: USER_EMPLOYEE_ID, status: 'active' } });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

    const req = {
      user: { id: 'u-1', email: 'andrei.byfield@gmail.com', tenant_id: TENANT_ID },
    };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.user.employee_id, USER_EMPLOYEE_ID);
    // Confirm the lookup used tenant_id from req.user
    const tenantEq = fake._calls.eq.find((c) => c.col === 'tenant_id');
    assert.equal(tenantEq?.val, TENANT_ID);
  });

  it('uses ilike for email match (RFC 5321 case-insensitivity)', async () => {
    const fake = makeFakeSupabase({ row: { id: USER_EMPLOYEE_ID, status: 'active' } });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

    const req = {
      user: { id: 'u-1', email: 'Andrei.Byfield@gmail.com', tenant_id: TENANT_ID },
    };
    await mw(req, makeRes(), () => {});

    const emailIlike = fake._calls.ilike.find((c) => c.col === 'email');
    assert.equal(emailIlike?.val, 'Andrei.Byfield@gmail.com');
  });
});

describe('requireEmployee — superadmin bypass', () => {
  it('lets superadmin through without an employees lookup', async () => {
    const fake = makeFakeSupabase({ row: null });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

    const req = {
      user: {
        id: 'u-super',
        email: 'admin@platform.com',
        role: 'superadmin',
        tenant_id: TENANT_ID,
      },
      tenant: { id: TENANT_ID },
    };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res._status, 200);
    // Critical: didn't query employees because bypass fires before the lookup
    assert.equal(fake._calls.ilike.length, 0, 'employees lookup must be skipped for superadmin');
  });

  it('lets is_superadmin=true through even when role is not literally "superadmin"', async () => {
    const fake = makeFakeSupabase({ row: null });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

    const req = {
      user: {
        id: 'u-super',
        email: 'admin@platform.com',
        role: 'user',
        is_superadmin: true,
        tenant_id: TENANT_ID,
      },
      tenant: { id: TENANT_ID },
    };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
  });

  it('does NOT bypass tenant admins (they must be employees on their tenant)', async () => {
    const fake = makeFakeSupabase({ row: null });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

    const req = {
      user: { id: 'u-admin', email: 'admin@tenant.com', role: 'admin', tenant_id: TENANT_ID },
      tenant: { id: TENANT_ID },
    };
    const res = makeRes();
    await mw(req, res, () => {});

    // Admin without employees row → 403, same as any other user
    assert.equal(res._status, 403);
    assert.equal(res._body.code, 'employee_required');
  });
});

describe('requireEmployee — rejects non-employees', () => {
  it('returns 403 employee_required when employees lookup returns null', async () => {
    const fake = makeFakeSupabase({ row: null });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

    const req = {
      user: { id: 'u-1', email: 'client@external.com', tenant_id: TENANT_ID },
      tenant: { id: TENANT_ID },
    };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, 'next() must not be called');
    assert.equal(res._status, 403);
    assert.equal(res._body.code, 'employee_required');
    assert.equal(res._body.status, 'error');
    assert.match(res._body.message, /employees/i);
  });

  it('returns 403 employee_inactive when employees.status != "active"', async () => {
    const fake = makeFakeSupabase({ row: { id: USER_EMPLOYEE_ID, status: 'inactive' } });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

    const req = {
      user: { id: 'u-1', email: 'offboarded@org.com', tenant_id: TENANT_ID },
      tenant: { id: TENANT_ID },
    };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.equal(res._body.code, 'employee_inactive');
    assert.notEqual(
      res._body.code,
      'employee_required',
      'inactive must use its own code so UX can distinguish "never was" from "deactivated"',
    );
  });

  it('returns 403 employee_inactive when status is "suspended" too', async () => {
    const fake = makeFakeSupabase({ row: { id: USER_EMPLOYEE_ID, status: 'suspended' } });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

    const req = {
      user: { id: 'u-1', email: 'suspended@org.com', tenant_id: TENANT_ID },
      tenant: { id: TENANT_ID },
    };
    const res = makeRes();
    await mw(req, res, () => {});

    assert.equal(res._status, 403);
    assert.equal(res._body.code, 'employee_inactive');
  });

  it('allows when status column is null/undefined (legacy rows pre-status)', async () => {
    const fake = makeFakeSupabase({ row: { id: USER_EMPLOYEE_ID, status: null } });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

    const req = {
      user: { id: 'u-1', email: 'legacy@org.com', tenant_id: TENANT_ID },
      tenant: { id: TENANT_ID },
    };
    const res = makeRes();
    let nextCalled = false;
    await mw(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true, 'null status should not block — back-compat for older rows');
  });

  it('returns 403 employee_required when user has no email', async () => {
    const fake = makeFakeSupabase({ row: null });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

    const req = {
      user: { id: 'u-1', email: '', tenant_id: TENANT_ID },
      tenant: { id: TENANT_ID },
    };
    const res = makeRes();
    await mw(req, res, () => {});

    assert.equal(res._status, 403);
    assert.equal(res._body.code, 'employee_required');
  });
});

describe('requireEmployee — rejects missing prerequisites', () => {
  it('returns 401 when req.user is not populated and NODE_ENV is not development', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const fake = makeFakeSupabase({ row: null });
      const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

      const req = { tenant: { id: TENANT_ID } };
      const res = makeRes();
      let nextCalled = false;
      await mw(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res._status, 401);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('returns 400 tenant_required when neither req.tenant.id nor req.user.tenant_id is set', async () => {
    const fake = makeFakeSupabase({ row: null });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

    const req = {
      user: { id: 'u-1', email: 'x@y.com' },
    };
    const res = makeRes();
    await mw(req, res, () => {});

    assert.equal(res._status, 400);
    assert.equal(res._body.code, 'tenant_required');
  });
});

describe('requireEmployee — DB / infrastructure errors', () => {
  it('returns 500 when supabase factory throws', async () => {
    const mw = createRequireEmployee({
      getSupabaseAdmin: () => {
        throw new Error('boom');
      },
    });

    const req = {
      user: { id: 'u-1', email: 'andrei.byfield@gmail.com', tenant_id: TENANT_ID },
      tenant: { id: TENANT_ID },
    };
    const res = makeRes();
    await mw(req, res, () => {});

    assert.equal(res._status, 500);
  });

  it('returns 500 when employees lookup errors out', async () => {
    const fake = makeFakeSupabase({
      row: null,
      error: { message: 'connection refused' },
    });
    const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

    const req = {
      user: { id: 'u-1', email: 'andrei.byfield@gmail.com', tenant_id: TENANT_ID },
      tenant: { id: TENANT_ID },
    };
    const res = makeRes();
    await mw(req, res, () => {});

    assert.equal(res._status, 500);
  });
});

describe('requireEmployee — local-dev bypass', () => {
  it('bypasses auth check in development when req.user is missing', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const fake = makeFakeSupabase({ row: null });
      const mw = createRequireEmployee({ getSupabaseAdmin: () => fake });

      const req = { tenant: { id: TENANT_ID } };
      const res = makeRes();
      let nextCalled = false;
      await mw(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(req.user?.role, 'superadmin');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
