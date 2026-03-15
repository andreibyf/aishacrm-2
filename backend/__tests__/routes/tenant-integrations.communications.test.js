import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';

import createTenantIntegrationRoutes from '../../routes/tenant-integrations.js';

const tenantId = '11111111-1111-1111-1111-111111111111';
const integrationId = '22222222-2222-2222-2222-222222222222';

function buildSupabaseStub(calls) {
  return {
    from(table) {
      assert.equal(table, 'tenant_integrations');

      const chain = {
        select(selection) {
          calls.push({ op: 'select', selection });
          return chain;
        },
        eq(field, value) {
          calls.push({ op: 'eq', field, value });
          return chain;
        },
        limit(value) {
          calls.push({ op: 'limit', value });
          return chain;
        },
        update(payload) {
          calls.push({ op: 'update', payload });
          return chain;
        },
        single: async () => {
          const lastSelect = calls.filter((call) => call.op === 'select').at(-1);

          if (lastSelect?.selection === 'integration_type, config, api_credentials, metadata') {
            return {
              data: {
                integration_type: 'communications_provider',
                config: {
                  provider_type: 'imap_smtp',
                  provider_name: 'zoho_mail',
                  mailbox_id: 'owner-primary',
                  mailbox_address: 'aisha@aishacrm.com',
                  inbound: {
                    host: 'imap.zoho.com',
                    port: 993,
                    secure: true,
                    auth_mode: 'password',
                    folder: 'INBOX',
                    poll_interval_ms: 60000,
                  },
                  outbound: {
                    host: 'smtp.zoho.com',
                    port: 587,
                    secure: false,
                    auth_mode: 'password',
                    from_address: 'aisha@aishacrm.com',
                    reply_to_address: 'aisha@aishacrm.com',
                  },
                  sync: {
                    cursor_strategy: 'uid',
                    raw_retention_days: 30,
                    replay_enabled: true,
                  },
                  features: {
                    inbound_enabled: true,
                    outbound_enabled: true,
                    lead_capture_enabled: true,
                    meeting_scheduling_enabled: true,
                  },
                },
                api_credentials: {
                  inbound_username: 'aisha@aishacrm.com',
                  inbound_password: 'secret',
                  outbound_username: 'aisha@aishacrm.com',
                  outbound_password: 'secret',
                },
                metadata: {},
              },
              error: null,
            };
          }

          return {
            data: {
              id: integrationId,
              tenant_id: tenantId,
              integration_type: 'communications_provider',
              sync_status: 'connected',
            },
            error: null,
          };
        },
      };

      return chain;
    },
  };
}

test('PUT /api/tenantintegrations/:id allows partial sync updates for communications providers', async () => {
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenantintegrations',
    createTenantIntegrationRoutes({
      supabaseClient: buildSupabaseStub(calls),
      validateTenantAccessMw: (req, _res, next) => {
        req.tenant = { id: tenantId };
        req.user = { id: 'user-1', role: 'admin', tenant_id: tenantId };
        next();
      },
    }),
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/tenantintegrations/${integrationId}?tenant_id=${tenantId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sync_status: 'connected',
          error_message: null,
        }),
      },
    );

    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.status, 'success');

    const updateCall = calls.find((call) => call.op === 'update');
    assert.equal(updateCall.payload.sync_status, 'connected');
    assert.ok(updateCall.payload.updated_at);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
