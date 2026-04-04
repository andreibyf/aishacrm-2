import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import pg from 'pg';

const tenantId = '11111111-1111-1111-1111-111111111111';
const integrationId = '22222222-2222-2222-2222-222222222222';

function buildSupabaseStub({ existingIntegration = null, writes = [] } = {}) {
  return {
    from(table) {
      if (table === 'tenant') {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: { name: 'Acme Advisory' },
            error: null,
          }),
        };
      }

      assert.equal(table, 'tenant_integrations');

      const state = {
        selection: null,
        insertPayload: null,
        updatePayload: null,
      };

      return {
        select(selection) {
          state.selection = selection;
          return this;
        },
        eq() {
          return this;
        },
        limit() {
          return this;
        },
        insert(payload) {
          state.insertPayload = payload;
          writes.push({ op: 'insert', payload });
          return this;
        },
        update(payload) {
          state.updatePayload = payload;
          writes.push({ op: 'update', payload });
          return this;
        },
        single: async () => {
          if (state.selection === 'integration_type, config, api_credentials, metadata') {
            return {
              data: existingIntegration,
              error: existingIntegration ? null : new Error('missing integration'),
            };
          }

          return {
            data: {
              id: integrationId,
              tenant_id: tenantId,
              ...(state.insertPayload || state.updatePayload || {}),
            },
            error: null,
          };
        },
      };
    },
  };
}

function createFakePool(queryLog, handlers) {
  return class FakePool {
    on() {}

    async query(sql, params = []) {
      queryLog.push({ sql, params });

      for (const [matcher, handler] of handlers) {
        if (matcher(sql, params)) {
          return handler(sql, params);
        }
      }

      throw new Error(`Unhandled Cal.com SQL in test: ${sql}`);
    }
  };
}

async function createServer({ supabaseClient, FakePoolClass }) {
  const originalPool = pg.Pool;
  pg.Pool = FakePoolClass;
  process.env.CALCOM_DB_URL = 'postgresql://calcom:test@calcom-db:5432/calcom';
  process.env.CALCOM_WEBHOOK_BACKEND_URL = 'http://backend:3001';

  try {
    const moduleUrl = new URL('../../routes/tenant-integrations.js', import.meta.url);
    moduleUrl.searchParams.set('test', `${Date.now()}-${Math.random()}`);
    const { default: createTenantIntegrationRoutes } = await import(moduleUrl.href);

    const app = express();
    app.use(express.json());
    app.use(
      '/api/tenantintegrations',
      createTenantIntegrationRoutes({
        supabaseClient,
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
  } finally {
    pg.Pool = originalPool;
  }
}

test('POST /api/tenantintegrations auto-provisions Cal.com using preferred cal_link username', async () => {
  const queryLog = [];
  const writes = [];
  const FakePool = createFakePool(queryLog, [
    [
      (sql, params) => sql.includes('FROM users WHERE id = $1'),
      async (_sql, params) => {
        if (Number(params[0]) === 77) {
          return {
            rows: [
              {
                id: 77,
                username: 'shared-user',
                email: 'shared@example.com',
                name: 'Shared User',
              },
            ],
          };
        }
        return { rows: [] };
      },
    ],
    [(sql) => sql.includes('FROM users WHERE username = $1 LIMIT 1'), async () => ({ rows: [] })],
    [
      (sql) => sql.includes('INSERT INTO users (username, name, email, uuid)'),
      async (_sql, params) => ({ rows: [{ id: 501, username: params[0], email: params[2], name: params[1] }] }),
    ],
    [(sql) => sql.includes('SELECT id, "timeZone" FROM "Schedule"'), async () => ({ rows: [] })],
    [(sql) => sql.includes('INSERT INTO "Schedule"'), async () => ({ rows: [{ id: 901 }] })],
    [(sql) => sql.includes('SELECT id FROM "Availability"'), async () => ({ rows: [] })],
    [(sql) => sql.includes('INSERT INTO "Availability"'), async () => ({ rows: [] })],
    [(sql) => sql.includes('UPDATE users'), async () => ({ rows: [] })],
    [(sql) => sql.includes('SELECT id FROM "EventType" WHERE "userId" = $1 AND slug = $2'), async () => ({ rows: [] })],
    [
      (sql, params) =>
        sql.includes('SELECT id, slug, title, length, "userId" FROM "EventType" WHERE id = $1 LIMIT 1') &&
        Number(params[0]) === 999,
      async () => ({
        rows: [{ id: 999, slug: 'wrong-user-event', title: 'Wrong', length: 30, userId: 12 }],
      }),
    ],
    [(sql) => sql.includes('SELECT id, slug, title, length FROM "EventType" WHERE "userId" = $1 AND slug = $2'), async () => ({ rows: [] })],
    [
      (sql) => sql.includes('INSERT INTO "EventType"'),
      async (_sql, params) => ({ rows: [{ id: 701, slug: params[1], title: params[0], length: params[2] }] }),
    ],
    [(sql) => sql.includes('INSERT INTO "ApiKey"'), async () => ({ rows: [] })],
    [(sql) => sql.includes('SELECT id FROM "Webhook"'), async () => ({ rows: [] })],
    [(sql) => sql.includes('INSERT INTO "Webhook"'), async () => ({ rows: [] })],
  ]);

  const server = await createServer({
    supabaseClient: buildSupabaseStub({ writes }),
    FakePoolClass: FakePool,
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/tenantintegrations?tenant_id=${tenantId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integration_type: 'calcom',
          integration_name: 'Tenant Booking',
          config: {
            auto_provision: true,
            cal_link: 'preferred-user/team-meeting',
          },
          api_credentials: {},
        }),
      },
    );

    const json = await response.json();

    assert.equal(response.status, 201);
    assert.equal(json.status, 'success');

    const insertCall = writes.find((entry) => entry.op === 'insert');
    assert.equal(insertCall.payload.config.calcom_user_id, 501);
    assert.ok(Number.isFinite(Number(insertCall.payload.config.event_type_id)));
    assert.equal(insertCall.payload.config.cal_link, 'preferred-user/team-meeting');
    assert.equal(insertCall.payload.config.auto_provision, true);
    assert.match(insertCall.payload.api_credentials.api_key, /^cal_auto_/);
    assert.match(insertCall.payload.api_credentials.webhook_secret, /^whsec_/);
    assert.equal(insertCall.payload.metadata.auto_provisioned_by, 'tenant-integrations-route');

    const userInsert = queryLog.find((entry) => entry.sql.includes('INSERT INTO users'));
    assert.equal(userInsert.params[0], 'preferred-user');
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('PUT /api/tenantintegrations/:id preserves calcom_user_id and replaces cross-user event_type_id', async () => {
  const writes = [];
  const FakePool = createFakePool([], [
    [
      (sql, params) => sql.includes('FROM users WHERE id = $1 LIMIT 1') && params[0] === 77,
      async () => ({ rows: [{ id: 77, username: 'shared-user', email: 'shared@example.com', name: 'Shared User' }] }),
    ],
    [
      (sql, params) => sql.includes('SELECT id, slug, title, length, "userId" FROM "EventType" WHERE id = $1 LIMIT 1') && params[0] === 999,
      async () => ({ rows: [{ id: 999, slug: 'wrong-user-event', title: 'Wrong', length: 30, userId: 12 }] }),
    ],
    [(sql) => sql.includes('SELECT id FROM "EventType" WHERE "userId" = $1 AND slug = $2'), async () => ({ rows: [] })],
    [(sql) => sql.includes('SELECT id, slug, title, length FROM "EventType" WHERE "userId" = $1 AND slug = $2'), async () => ({ rows: [] })],
    [
      (sql) => sql.includes('INSERT INTO "EventType"'),
      async (_sql, params) => ({ rows: [{ id: 333, slug: params[1], title: params[0], length: params[2] }] }),
    ],
    [(sql) => sql.includes('INSERT INTO "ApiKey"'), async () => ({ rows: [] })],
    [(sql) => sql.includes('SELECT id FROM "Webhook"'), async () => ({ rows: [] })],
    [(sql) => sql.includes('INSERT INTO "Webhook"'), async () => ({ rows: [] })],
    [(sql) => sql.includes('UPDATE users'), async () => ({ rows: [] })],
    [(sql) => sql.includes('SELECT id, "timeZone" FROM "Schedule"'), async () => ({ rows: [{ id: 55, timeZone: 'America/New_York' }] })],
    [(sql) => sql.includes('SELECT id FROM "Availability"'), async () => ({ rows: [{ id: 88 }] })],
  ]);

  const existingIntegration = {
    integration_type: 'calcom',
    integration_name: 'Tenant Booking',
    config: {
      auto_provision: true,
      calcom_user_id: 77,
      event_type_id: 999,
      cal_link: 'preferred-user/team-meeting',
    },
    api_credentials: {},
    metadata: {},
  };

  const server = await createServer({
    supabaseClient: buildSupabaseStub({ existingIntegration, writes }),
    FakePoolClass: FakePool,
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/tenantintegrations/${integrationId}?tenant_id=${tenantId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            auto_provision: true,
            cal_link: 'preferred-user/team-meeting',
          },
        }),
      },
    );

    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.status, 'success');

    const updateCall = writes.find((entry) => entry.op === 'update');
    assert.equal(updateCall.payload.config.calcom_user_id, 77);
    assert.ok(Number.isFinite(Number(updateCall.payload.config.event_type_id)));
    assert.notEqual(updateCall.payload.config.event_type_id, 999);
    assert.equal(updateCall.payload.config.cal_link, 'shared-user/team-meeting');
    assert.match(updateCall.payload.api_credentials.api_key, /^cal_auto_/);
    assert.match(updateCall.payload.api_credentials.webhook_secret, /^whsec_/);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});