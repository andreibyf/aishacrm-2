/**
 * Tests for cacheMiddleware — invalidateCache middleware
 * Ensures single invalidation, correct tenant UUID resolution, and no double-fire.
 *
 * Strategy: import the real module and spy on cacheManager methods via the
 * default export (which is a mutable singleton object).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import cacheManager from '../../lib/cacheManager.js';
import { invalidateCache } from '../../lib/cacheMiddleware.js';

// Spy tracking
const invalidateTenantCalls = [];
const invalidateDashboardCalls = [];
let origInvalidateTenant;
let origInvalidateDashboard;

function installSpies() {
  origInvalidateTenant = cacheManager.invalidateTenant;
  origInvalidateDashboard = cacheManager.invalidateDashboard;

  cacheManager.invalidateTenant = async (tenantId, module) => {
    invalidateTenantCalls.push({ tenantId, module });
  };
  cacheManager.invalidateDashboard = async (tenantId) => {
    invalidateDashboardCalls.push({ tenantId });
  };
}

function removeSpies() {
  cacheManager.invalidateTenant = origInvalidateTenant;
  cacheManager.invalidateDashboard = origInvalidateDashboard;
}

function createMockReq(overrides = {}) {
  return {
    tenant: overrides.tenant || null,
    user: overrides.user || null,
    query: overrides.query || {},
    body: overrides.body || {},
  };
}

function createMockRes(statusCode = 200) {
  const res = {
    statusCode,
  };
  // Bare-bones res.json that just returns the data
  res.json = function (data) {
    return data;
  };
  res.json = res.json.bind(res);
  return res;
}

describe('invalidateCache middleware', () => {
  beforeEach(() => {
    invalidateTenantCalls.length = 0;
    invalidateDashboardCalls.length = 0;
    installSpies();
  });

  // Restore after all tests in this describe (best-effort)
  it('should invalidate cache exactly once on successful json response', async () => {
    const middleware = invalidateCache('leads');
    const req = createMockReq({ tenant: { id: 'uuid-123' } });
    const res = createMockRes();

    await middleware(req, res, () => {});
    await res.json({ status: 'success' });

    assert.strictEqual(invalidateTenantCalls.length, 1, 'invalidateTenant should be called once');
    assert.strictEqual(invalidateTenantCalls[0].tenantId, 'uuid-123');
    assert.strictEqual(invalidateTenantCalls[0].module, 'leads');
  });

  it('should prefer req.tenant.id (UUID) over req.user.tenant_id', async () => {
    const middleware = invalidateCache('accounts');
    const req = createMockReq({
      tenant: { id: 'canonical-uuid' },
      user: { tenant_id: 'legacy-text-slug' },
    });
    const res = createMockRes();

    await middleware(req, res, () => {});
    await res.json({ status: 'success' });

    assert.strictEqual(invalidateTenantCalls.length, 1);
    assert.strictEqual(
      invalidateTenantCalls[0].tenantId,
      'canonical-uuid',
      'should use req.tenant.id, not req.user.tenant_id',
    );
  });

  it('should fall back to req.user.tenant_id when req.tenant is absent', async () => {
    const middleware = invalidateCache('contacts');
    const req = createMockReq({
      user: { tenant_id: 'user-tenant-id' },
    });
    const res = createMockRes();

    await middleware(req, res, () => {});
    await res.json({ status: 'success' });

    assert.strictEqual(invalidateTenantCalls.length, 1);
    assert.strictEqual(invalidateTenantCalls[0].tenantId, 'user-tenant-id');
  });

  it('should fall back to req.query.tenant_id', async () => {
    const middleware = invalidateCache('notes');
    const req = createMockReq({ query: { tenant_id: 'query-tenant-id' } });
    const res = createMockRes();

    await middleware(req, res, () => {});
    await res.json({ status: 'success' });

    assert.strictEqual(invalidateTenantCalls.length, 1);
    assert.strictEqual(invalidateTenantCalls[0].tenantId, 'query-tenant-id');
  });

  it('should not invalidate on error status codes', async () => {
    const middleware = invalidateCache('leads');
    const req = createMockReq({ tenant: { id: 'uuid-123' } });
    const res = createMockRes(400);

    await middleware(req, res, () => {});
    await res.json({ status: 'error', message: 'Bad request' });

    assert.strictEqual(invalidateTenantCalls.length, 0, 'should not invalidate on 400');
  });

  it('should not invalidate on 500 status', async () => {
    const middleware = invalidateCache('leads');
    const req = createMockReq({ tenant: { id: 'uuid-123' } });
    const res = createMockRes(500);

    await middleware(req, res, () => {});
    await res.json({ status: 'error' });

    assert.strictEqual(invalidateTenantCalls.length, 0, 'should not invalidate on 500');
  });

  it('should not invalidate when no tenantId is available', async () => {
    const middleware = invalidateCache('leads');
    const req = createMockReq();
    const res = createMockRes();

    await middleware(req, res, () => {});
    await res.json({ status: 'success' });

    assert.strictEqual(invalidateTenantCalls.length, 0, 'should not invalidate without tenantId');
  });

  it('should also invalidate dashboard for CRM entity modules', async () => {
    const middleware = invalidateCache('leads');
    const req = createMockReq({ tenant: { id: 'uuid-123' } });
    const res = createMockRes();

    await middleware(req, res, () => {});
    await res.json({ status: 'success' });

    assert.strictEqual(invalidateTenantCalls.length, 1);
    assert.strictEqual(invalidateDashboardCalls.length, 1);
    assert.strictEqual(invalidateDashboardCalls[0].tenantId, 'uuid-123');
  });

  it('should NOT invalidate dashboard for non-CRM modules', async () => {
    const middleware = invalidateCache('webhooks');
    const req = createMockReq({ tenant: { id: 'uuid-123' } });
    const res = createMockRes();

    await middleware(req, res, () => {});
    await res.json({ status: 'success' });

    assert.strictEqual(invalidateTenantCalls.length, 1);
    assert.strictEqual(
      invalidateDashboardCalls.length,
      0,
      'webhooks should not trigger dashboard invalidation',
    );
  });

  it('should call next() to continue the middleware chain', async () => {
    const middleware = invalidateCache('leads');
    const req = createMockReq({ tenant: { id: 'uuid-123' } });
    const res = createMockRes();
    let nextCalled = false;

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'next() should be called');
  });

  // Cleanup
  it('cleanup: restore spies', () => {
    removeSpies();
    assert.ok(true);
  });
});
