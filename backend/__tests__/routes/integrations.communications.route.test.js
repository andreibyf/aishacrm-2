import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let server;
const port = 3113;

function request(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port, path, method: 'GET', headers: { connection: 'close' } },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          res.status = res.statusCode;
          res.json = () => JSON.parse(raw);
          resolve(res);
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('Integrations communications status route', () => {
  before(async () => {
    const express = (await import('express')).default;
    const createIntegrationRoutes = (await import('../../routes/integrations.js')).default;

    const app = express();
    app.use(express.json());
    app.use(
      '/api/integrations',
      createIntegrationRoutes(null, {
        validateTenantAccessMw: (req, _res, next) => {
          req.tenant = { id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46' };
          req.user = {
            id: 'test-user',
            email: 'test@example.com',
            role: 'admin',
            tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
          };
          next();
        },
        resolveCommunicationsProviderConnectionFn: async ({
          tenantId,
          mailboxId,
          mailboxAddress,
        }) => {
          assert.equal(tenantId, 'a11dfb63-4b18-4eb8-872e-747af2e37c46');
          assert.equal(mailboxId, 'owner-primary');
          assert.equal(mailboxAddress, 'aisha@aishacrm.com');
          return {
            integration: {
              id: 'integration-001',
              integration_name: 'Zoho Mail',
            },
            adapter: {
              async getConnectionHealth() {
                return {
                  ok: true,
                  status: 'connected',
                  provider_type: 'imap_smtp',
                  provider_name: 'zoho_mail',
                  mailbox_id: 'owner-primary',
                };
              },
            },
          };
        },
      }),
    );

    server = app.listen(port);
    await new Promise((resolve) => server.on('listening', resolve));
  });

  after(async () => {
    if (server) {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns mailbox health for a communications provider integration', async () => {
    const res = await request(
      '/api/integrations/communications/status?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46&mailbox_id=owner-primary&mailbox_address=aisha@aishacrm.com',
    );

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.equal(json.data.ok, true);
    assert.equal(json.data.status, 'connected');
    assert.equal(json.data.integration_name, 'Zoho Mail');
  });
});
