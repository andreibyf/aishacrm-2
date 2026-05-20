/**
 * financeRuntimeMount.test.js
 *
 * Verifies that the Finance Ops route surface is absent when
 * ENABLE_FINANCE_OPS is falsy and present (and correctly gated) when true.
 *
 * Builds a minimal Express harness — does NOT start server.js — so the test
 * is fast and isolated from Supabase/Redis/pgPool startup.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import createFinanceV2Routes from '../../routes/finance.v2.js';
import { isFinanceRuntimeEnabled } from '../../lib/finance/financeRuntimeGate.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000011';
const OTHER_TENANT_ID = '00000000-0000-4000-8000-000000000099';

/**
 * Builds a minimal app that mirrors the server.js conditional mount pattern.
 *
 * Deliberately does NOT pre-set req.tenant — validateTenantAccess (inside the
 * router) owns that field. Pre-setting it would short-circuit the mismatch check.
 */
function buildApp({ financeEnabled = false, authenticated = true, tenantId = TENANT_ID } = {}) {
  const app = express();
  app.use(express.json());

  // Simulate authenticateRequest: populate req.user only.
  app.use((req, _res, next) => {
    if (authenticated) {
      req.user = {
        id: 'user-1',
        role: 'admin',
        tenant_id: tenantId,
        tenant_uuid: tenantId,
      };
    }
    next();
  });

  if (financeEnabled) {
    app.use(
      '/api/v2/finance',
      createFinanceV2Routes(null, {
        isFinanceModuleEnabled: async () => true,
      }),
    );
  }

  return app;
}

describe('Finance Ops route mount — gated by ENABLE_FINANCE_OPS', () => {
  test('routes return 404 when finance is disabled (surface not mounted)', async () => {
    const app = buildApp({ financeEnabled: false });

    const endpoints = [
      { method: 'get', path: '/api/v2/finance/journal-entries' },
      { method: 'get', path: '/api/v2/finance/ledger' },
      { method: 'get', path: '/api/v2/finance/profit-loss' },
      { method: 'get', path: '/api/v2/finance/balance-sheet' },
      { method: 'post', path: '/api/v2/finance/journal-drafts' },
      { method: 'post', path: '/api/v2/finance/simulate/deal-won' },
    ];

    for (const { method, path } of endpoints) {
      const res = await request(app)[method](path).send({});
      assert.equal(
        res.status,
        404,
        `expected 404 for ${method.toUpperCase()} ${path} when gate is off`,
      );
    }
  });

  test('routes are reachable when finance is enabled', async () => {
    const app = buildApp({ financeEnabled: true });
    const res = await request(app).get('/api/v2/finance/journal-entries');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
  });

  test('unauthenticated request returns 401 when finance is enabled', async () => {
    // No req.user → validateTenantAccess (inside the router) returns 401.
    const app = buildApp({ financeEnabled: true, authenticated: false });
    const res = await request(app).get('/api/v2/finance/journal-entries');
    assert.equal(res.status, 401);
  });

  test('tenant mismatch is blocked with 403 when finance is enabled', async () => {
    // User is authed as TENANT_ID; request queries OTHER_TENANT_ID.
    // validateTenantAccess detects the mismatch and returns 403.
    const app = buildApp({ financeEnabled: true });
    const res = await request(app).get(
      `/api/v2/finance/journal-entries?tenant_id=${OTHER_TENANT_ID}`,
    );
    assert.equal(res.status, 403);
    assert.match(res.body.message, /access denied/i);
  });

  test('isFinanceRuntimeEnabled() returns false when env flag is absent', () => {
    const saved = process.env.ENABLE_FINANCE_OPS;
    try {
      delete process.env.ENABLE_FINANCE_OPS;
      assert.equal(isFinanceRuntimeEnabled(), false);
    } finally {
      if (saved !== undefined) process.env.ENABLE_FINANCE_OPS = saved;
    }
  });
});
