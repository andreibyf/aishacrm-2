/**
 * Security gate for POST /api/testing/cleanup-test-data.
 *
 * The /api/testing mount carries no auth middleware, and cleanup-test-data is a
 * DESTRUCTIVE mass-delete. It now gates itself with authenticateRequest +
 * requireSuperAdminRole so only a superadmin can clear test data — matching the
 * superadmin-only control of the finance Test/Live data mode. These tests pin:
 *   - superadmin  -> passes the gate (200)
 *   - regular user -> 403 (forbidden), even with no `confirm` (gate runs first)
 *   - no user      -> 401 (unauthenticated)
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import createTestingRoutes from '../../routes/testing.js';

// Each per-table DELETE in the handler is individually try/caught, so a no-op
// pool yields a clean 200 with zero deletions — enough to prove the gate let a
// superadmin THROUGH (the real DB work is exercised elsewhere / in integration).
const STUB_POOL = { query: async () => ({ rowCount: 0 }) };

const SUPERADMIN = { id: 'sa-1', role: 'superadmin', is_superadmin: true };
const REGULAR = { id: 'u-1', role: 'admin', tenant_id: 't-1' };

// Inject the test's user BEFORE the router. authenticateRequest runs inside the
// route stack but only SETS req.user on real auth; with no auth headers it passes
// through as anonymous and leaves our injected user intact.
function buildApp({ user } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) req.user = { ...user };
    next();
  });
  app.use('/api/testing', createTestingRoutes(STUB_POOL));
  return app;
}

describe('POST /api/testing/cleanup-test-data — superadmin gate', () => {
  test('a superadmin passes the gate (200)', async () => {
    const res = await request(buildApp({ user: SUPERADMIN }))
      .post('/api/testing/cleanup-test-data')
      .send({ confirm: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
  });

  test('a regular (non-superadmin) user is forbidden (403)', async () => {
    const res = await request(buildApp({ user: REGULAR }))
      .post('/api/testing/cleanup-test-data')
      .send({ confirm: true });
    assert.equal(res.status, 403);
    assert.match(res.body.message, /superadmin/i);
  });

  test('the gate runs BEFORE the confirm check — a regular user cannot even reach the 400', async () => {
    // Without `confirm`, an authorized caller would get 400; a non-superadmin must
    // still be stopped at the gate (403), proving the order can't be probed around.
    const res = await request(buildApp({ user: REGULAR }))
      .post('/api/testing/cleanup-test-data')
      .send({});
    assert.equal(res.status, 403);
  });

  test('an unauthenticated caller is rejected (401)', async () => {
    const prev = process.env.NODE_ENV;
    // Ensure the requireSuperAdminRole dev mock-superadmin bypass is OFF.
    process.env.NODE_ENV = 'test';
    try {
      const res = await request(buildApp({ user: null }))
        .post('/api/testing/cleanup-test-data')
        .send({ confirm: true });
      assert.equal(res.status, 401);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
