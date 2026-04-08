import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';

import createNotificationRoutes from '../../routes/notifications.js';
import * as supabaseDb from '../../lib/supabase-db.js';

const tenantId = '11111111-1111-1111-1111-111111111111';

function buildSupabaseDeleteStub({ found = true, capture }) {
  const state = { filters: [] };

  const chain = {
    delete() {
      return chain;
    },
    eq(field, value) {
      state.filters.push({ field, value });
      return chain;
    },
    select() {
      return chain;
    },
    maybeSingle() {
      if (capture) capture(state);
      return Promise.resolve({ data: found ? { id: 'n1' } : null, error: null });
    },
  };

  return {
    from(table) {
      assert.equal(table, 'notifications');
      return chain;
    },
  };
}

async function createServer({ injectTenant = true, supabaseClient }) {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    if (injectTenant) req.tenant = { id: tenantId };
    next();
  });

  const methodMock = mock.method(supabaseDb, 'getSupabaseClient', () => supabaseClient);

  app.use('/api/notifications', createNotificationRoutes(null));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  return {
    server,
    restore: () => methodMock.mock.restore(),
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

test('DELETE /api/notifications/:id returns 400 when tenant context is missing', async () => {
  const supabaseClient = buildSupabaseDeleteStub({ found: true });
  const { server, restore } = await createServer({ injectTenant: false, supabaseClient });

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/notifications/n1`, {
      method: 'DELETE',
    });
    const json = await res.json();

    assert.equal(res.status, 400);
    assert.equal(json.status, 'error');
    assert.equal(json.message, 'tenant_id is required');
  } finally {
    restore();
    await closeServer(server);
  }
});

test('DELETE /api/notifications/:id returns 404 when row not found and scopes by tenant', async () => {
  let capturedFilters = [];
  const supabaseClient = buildSupabaseDeleteStub({
    found: false,
    capture: (state) => {
      capturedFilters = state.filters;
    },
  });
  const { server, restore } = await createServer({ injectTenant: true, supabaseClient });

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/notifications/missing-id`, {
      method: 'DELETE',
    });
    const json = await res.json();

    assert.equal(res.status, 404);
    assert.equal(json.status, 'error');
    assert.equal(json.message, 'Notification not found');

    assert.deepEqual(capturedFilters, [
      { field: 'id', value: 'missing-id' },
      { field: 'tenant_id', value: tenantId },
    ]);
  } finally {
    restore();
    await closeServer(server);
  }
});

test('DELETE /api/notifications/:id returns success when row exists', async () => {
  const supabaseClient = buildSupabaseDeleteStub({ found: true });
  const { server, restore } = await createServer({ injectTenant: true, supabaseClient });

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/notifications/n1`, {
      method: 'DELETE',
    });
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.status, 'success');
    assert.equal(json.data.id, 'n1');
  } finally {
    restore();
    await closeServer(server);
  }
});
