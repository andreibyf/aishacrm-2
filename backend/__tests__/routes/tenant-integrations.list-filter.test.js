import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';

import createTenantIntegrationRoutes from '../../routes/tenant-integrations.js';

const tenantId = '11111111-1111-1111-1111-111111111111';

function buildSupabaseStub() {
  return {
    from(table) {
      assert.equal(table, 'tenant_integrations');

      const state = {
        filters: [],
      };

      const chain = {
        select() {
          return chain;
        },
        eq(field, value) {
          state.filters.push({ field, value });
          return chain;
        },
        order() {
          return chain;
        },
        then(resolve, reject) {
          const activeFilter = state.filters.find((f) => f.field === 'is_active');
          const dataAll = [
            { id: 'a', tenant_id: tenantId, integration_type: 'calcom', is_active: true },
            {
              id: 'b',
              tenant_id: tenantId,
              integration_type: 'communications_provider',
              is_active: false,
            },
          ];

          const data =
            activeFilter && activeFilter.value === true
              ? dataAll.filter((row) => row.is_active === true)
              : activeFilter && activeFilter.value === false
                ? dataAll.filter((row) => row.is_active === false)
                : dataAll;

          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };

      return chain;
    },
  };
}

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenantintegrations',
    createTenantIntegrationRoutes({
      supabaseClient: buildSupabaseStub(),
      validateTenantAccessMw: (req, _res, next) => {
        req.tenant = { id: tenantId };
        req.user = { id: 'user-1', role: 'admin', tenant_id: tenantId };
        next();
      },
    }),
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return server;
}

test('GET /api/tenantintegrations without is_active returns active and inactive records', async () => {
  const server = await createServer();
  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/tenantintegrations?tenant_id=${tenantId}`,
    );
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.status, 'success');
    assert.equal(json.data.tenantintegrations.length, 2);
    assert.equal(
      json.data.tenantintegrations.some((row) => row.is_active === true),
      true,
    );
    assert.equal(
      json.data.tenantintegrations.some((row) => row.is_active === false),
      true,
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('GET /api/tenantintegrations?is_active=true returns only active records', async () => {
  const server = await createServer();
  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/tenantintegrations?tenant_id=${tenantId}&is_active=true`,
    );
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.status, 'success');
    assert.equal(json.data.tenantintegrations.length, 1);
    assert.equal(json.data.tenantintegrations[0].is_active, true);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('GET /api/tenantintegrations?is_active=false returns only inactive records', async () => {
  const server = await createServer();
  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/tenantintegrations?tenant_id=${tenantId}&is_active=false`,
    );
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.status, 'success');
    assert.equal(json.data.tenantintegrations.length, 1);
    assert.equal(json.data.tenantintegrations[0].is_active, false);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
