/**
 * Cache Route Tests
 * Tests for POST /api/cache/invalidate endpoint validation and behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// --- Inline mock of Express req/res and cacheManager ---

function mockReq(body = {}, tenant = null) {
  return {
    body,
    tenant: tenant ? { id: tenant } : undefined,
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    status(code) {
      res._status = code;
      return res;
    },
    json(data) {
      res._json = data;
      return res;
    },
  };
  return res;
}

// Mock cacheManager state for assertions
const cacheManagerCalls = {
  invalidateAllTenant: [],
  invalidateTenant: [],
  invalidateDashboard: [],
};

function resetCacheManagerCalls() {
  cacheManagerCalls.invalidateAllTenant = [];
  cacheManagerCalls.invalidateTenant = [];
  cacheManagerCalls.invalidateDashboard = [];
}

// Replicate the VALID_MODULES set and MAX_MODULES from cache.js
const VALID_MODULES = new Set([
  'leads',
  'contacts',
  'accounts',
  'opportunities',
  'activities',
  'bizdevsources',
  'users',
  'employees',
  'notes',
  'documents',
  'workflows',
  'reports',
]);

const DASHBOARD_MODULES = new Set([
  'leads',
  'contacts',
  'accounts',
  'opportunities',
  'activities',
  'bizdevsources',
]);

const MAX_MODULES = 20;

/**
 * Inline handler that mirrors the logic from backend/routes/cache.js
 * This allows us to test the validation/logic without Express routing.
 */
async function handleInvalidate(req, res) {
  try {
    const tenant_id = req.tenant?.id;
    const { modules: rawModules = [] } = req.body;

    if (!tenant_id) {
      return res
        .status(400)
        .json({ status: 'error', message: 'tenant_id is required (must be authenticated)' });
    }

    const isWildcard =
      rawModules.length === 0 || (rawModules.length === 1 && rawModules[0] === '*');
    const modules = isWildcard
      ? []
      : [...new Set(rawModules.filter((m) => typeof m === 'string' && VALID_MODULES.has(m)))].slice(
          0,
          MAX_MODULES,
        );

    let invalidated = 0;

    if (isWildcard) {
      cacheManagerCalls.invalidateAllTenant.push(tenant_id);
      invalidated = -1;
    } else if (modules.length === 0) {
      return res
        .status(400)
        .json({
          status: 'error',
          message: 'No valid modules provided. Valid modules: ' + [...VALID_MODULES].join(', '),
        });
    } else {
      for (const mod of modules) {
        cacheManagerCalls.invalidateTenant.push({ tenant_id, mod });
        invalidated++;
      }
    }

    const hasDashboardModule = modules.some((m) => DASHBOARD_MODULES.has(m));
    if (hasDashboardModule || invalidated === -1) {
      cacheManagerCalls.invalidateDashboard.push(tenant_id);
    }

    res.json({
      status: 'success',
      data: {
        tenant_id,
        modules: invalidated === -1 ? ['*'] : modules,
        invalidated: invalidated === -1 ? 'all' : invalidated,
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
}

// --- Tests ---

describe('POST /api/cache/invalidate — validation', () => {
  beforeEach(() => {
    resetCacheManagerCalls();
  });

  it('returns 400 when tenant is not present (no auth)', async () => {
    const req = mockReq({ modules: ['leads'] });
    const res = mockRes();
    await handleInvalidate(req, res);
    assert.equal(res._status, 400);
    assert.match(res._json.message, /tenant_id is required/);
  });

  it('returns 400 when no valid modules are provided', async () => {
    const req = mockReq({ modules: ['not_a_module', 'fake'] }, 'tenant-uuid-123');
    const res = mockRes();
    await handleInvalidate(req, res);
    assert.equal(res._status, 400);
    assert.match(res._json.message, /No valid modules/);
  });

  it('filters out invalid modules and processes only valid ones', async () => {
    const req = mockReq({ modules: ['leads', 'INVALID', 'contacts', 123] }, 'tenant-uuid-123');
    const res = mockRes();
    await handleInvalidate(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._json.data.invalidated, 2);
    assert.deepEqual(res._json.data.modules, ['leads', 'contacts']);
    assert.equal(cacheManagerCalls.invalidateTenant.length, 2);
  });

  it('de-duplicates modules', async () => {
    const req = mockReq({ modules: ['leads', 'leads', 'leads'] }, 'tenant-uuid-123');
    const res = mockRes();
    await handleInvalidate(req, res);
    assert.equal(res._json.data.invalidated, 1);
    assert.deepEqual(res._json.data.modules, ['leads']);
  });

  it('wildcard ["*"] invalidates all cache for the tenant', async () => {
    const req = mockReq({ modules: ['*'] }, 'tenant-uuid-123');
    const res = mockRes();
    await handleInvalidate(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._json.data.invalidated, 'all');
    assert.deepEqual(res._json.data.modules, ['*']);
    assert.equal(cacheManagerCalls.invalidateAllTenant.length, 1);
    assert.equal(cacheManagerCalls.invalidateAllTenant[0], 'tenant-uuid-123');
  });

  it('empty modules array invalidates all cache (wildcard behavior)', async () => {
    const req = mockReq({ modules: [] }, 'tenant-uuid-123');
    const res = mockRes();
    await handleInvalidate(req, res);
    assert.equal(res._json.data.invalidated, 'all');
  });

  it('invalidates dashboard when CRM entity modules are busted', async () => {
    const req = mockReq({ modules: ['leads', 'accounts'] }, 'tenant-uuid-123');
    const res = mockRes();
    await handleInvalidate(req, res);
    assert.equal(cacheManagerCalls.invalidateDashboard.length, 1);
  });

  it('does not invalidate dashboard for non-CRM modules', async () => {
    const req = mockReq({ modules: ['workflows'] }, 'tenant-uuid-123');
    const res = mockRes();
    await handleInvalidate(req, res);
    assert.equal(cacheManagerCalls.invalidateDashboard.length, 0);
  });

  it('uses req.tenant.id not body tenant_id (security)', async () => {
    const req = mockReq({ tenant_id: 'evil-tenant-uuid', modules: ['leads'] }, 'real-tenant-uuid');
    const res = mockRes();
    await handleInvalidate(req, res);
    assert.equal(res._json.data.tenant_id, 'real-tenant-uuid');
    assert.equal(cacheManagerCalls.invalidateTenant[0].tenant_id, 'real-tenant-uuid');
  });
});
