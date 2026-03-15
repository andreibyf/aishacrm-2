import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  listActiveInboundMailboxIntegrations,
  processCommunicationsPollCycle,
  resolveMailboxConnectionForInboundJob,
  processInboundMailboxJob,
} from '../../workers/communicationsWorker.js';

function buildSupabaseStub(rows, updates = []) {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    then(resolve) {
      return Promise.resolve(resolve({ data: rows, error: null }));
    },
  };

  const updateChain = {
    eq() {
      return updateChain;
    },
    then(resolve) {
      return Promise.resolve(resolve({ data: null, error: null }));
    },
  };

  return {
    from(tableName) {
      assert.equal(tableName, 'tenant_integrations');
      return {
        select() {
          return chain;
        },
        update(payload) {
          updates.push(payload);
          return updateChain;
        },
      };
    },
  };
}

function buildRow(overrides = {}) {
  return {
    id: 'integration-001',
    tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
    integration_type: 'communications_provider',
    integration_name: 'Zoho Mail',
    is_active: true,
    api_credentials: {
      inbound_username: 'owner@example.com',
      inbound_password: 'secret-inbound',
      outbound_username: 'owner@example.com',
      outbound_password: 'secret-outbound',
    },
    config: {
      provider_type: 'imap_smtp',
      provider_name: 'zoho_mail',
      mailbox_id: 'owner-primary',
      mailbox_address: 'owner@example.com',
      inbound: {
        host: 'imap.zoho.com',
        port: 993,
        secure: true,
      },
      outbound: {
        host: 'smtp.zoho.com',
        port: 587,
        secure: false,
        from_address: 'owner@example.com',
      },
    },
    metadata: {
      communications: {
        sync: {
          cursor: {
            strategy: 'uid',
            value: 41,
          },
        },
      },
    },
    ...overrides,
  };
}

describe('communications worker mailbox resolution', () => {
  it('lists only active inbound-enabled mailbox integrations that are due for polling', async () => {
    const dueRow = buildRow({
      metadata: {
        communications: {
          sync: {
            last_polled_at: '2026-03-14T12:00:00.000Z',
          },
        },
      },
      config: {
        ...buildRow().config,
        inbound: {
          ...buildRow().config.inbound,
          poll_interval_ms: 60000,
        },
      },
    });
    const notDueRow = buildRow({
      id: 'integration-002',
      metadata: {
        communications: {
          sync: {
            last_polled_at: '2026-03-14T12:00:30.000Z',
          },
        },
      },
      config: {
        ...buildRow().config,
        mailbox_id: 'secondary-mailbox',
        mailbox_address: 'secondary@example.com',
        inbound: {
          ...buildRow().config.inbound,
          poll_interval_ms: 60000,
        },
      },
    });
    const disabledRow = buildRow({
      id: 'integration-003',
      config: {
        ...buildRow().config,
        mailbox_id: 'disabled-mailbox',
        mailbox_address: 'disabled@example.com',
        features: {
          inbound_enabled: false,
          outbound_enabled: true,
          lead_capture_enabled: true,
          meeting_scheduling_enabled: true,
        },
      },
    });

    const integrations = await listActiveInboundMailboxIntegrations(
      { now: Date.parse('2026-03-14T12:02:00.000Z') },
      { supabase: buildSupabaseStub([dueRow, notDueRow, disabledRow]) },
    );

    assert.equal(integrations.length, 1);
    assert.equal(integrations[0].id, 'integration-001');
  });

  it('resolves mailbox connection from tenant_integrations for inbound jobs', async () => {
    const resolved = await resolveMailboxConnectionForInboundJob(
      {
        tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
        mailbox_id: 'owner-primary',
      },
      { supabase: buildSupabaseStub([buildRow()]) },
    );

    assert.equal(resolved.integration.id, 'integration-001');
    assert.equal(resolved.connection.config.provider_name, 'zoho_mail');
  });

  it('throws when no active mailbox connection matches', async () => {
    await assert.rejects(
      () =>
        resolveMailboxConnectionForInboundJob(
          {
            tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
            mailbox_id: 'missing-mailbox',
          },
          { supabase: buildSupabaseStub([buildRow()]) },
        ),
      (error) => error.code === 'communications_provider_not_found',
    );
  });

  it('fetches inbound mail from the stored cursor and persists the next cursor after successful ingestion', async () => {
    const updates = [];
    const fetchCalls = [];
    const acknowledged = [];
    const row = buildRow();
    const supabase = buildSupabaseStub([row], updates);
    const adapter = {
      async fetchInboundMessages(options) {
        assert.deepEqual(options.cursor, { strategy: 'uid', value: 41 });
        return {
          messages: [
            {
              uid: 42,
              provider_cursor: 42,
              message_id: '<msg-42@example.com>',
              subject: 'New lead',
              received_at: '2026-03-14T13:00:00.000Z',
              from: { email: 'lead@example.com', name: 'Lead' },
              to: [{ email: 'owner@example.com', name: 'Owner' }],
              in_reply_to: '<prior@example.com>',
              headers: {
                in_reply_to: '<prior@example.com>',
                references: ['<root@example.com>', '<prior@example.com>'],
              },
              text_body: 'Hello',
              html_body: '<p>Hello</p>',
              raw_source: 'raw-message',
            },
          ],
          cursor: { strategy: 'uid', value: 42 },
        };
      },
      async acknowledgeCursor(cursor) {
        acknowledged.push(cursor);
        return { ok: true };
      },
    };

    const result = await processInboundMailboxJob(
      {
        tenant_id: row.tenant_id,
        mailbox_id: 'owner-primary',
      },
      {
        supabase,
        internalToken: 'test-internal-token',
        backendUrl: 'http://backend:3001',
        resolveCommunicationsProviderConnection: async () => ({
          integration: row,
          connection: {
            config: row.config,
          },
          adapter,
        }),
        fetchImpl: async (url, options) => {
          fetchCalls.push({ url, options });
          return {
            ok: true,
            async json() {
              return { ok: true, status: 'accepted' };
            },
          };
        },
      },
    );

    assert.equal(result.processed_count, 1);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'http://backend:3001/api/internal/communications/inbound');
    assert.equal(fetchCalls[0].options.headers.Authorization, 'Bearer test-internal-token');
    const postedBody = JSON.parse(fetchCalls[0].options.body);
    assert.equal(postedBody.payload.from.email, 'lead@example.com');
    assert.equal(postedBody.payload.thread_hint, '<prior@example.com>');
    assert.deepEqual(postedBody.payload.to, [{ email: 'owner@example.com', name: 'Owner' }]);
    assert.equal(postedBody.payload.html_body, '<p>Hello</p>');
    assert.deepEqual(acknowledged, [{ strategy: 'uid', value: 42 }]);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].metadata.communications.sync.cursor, {
      strategy: 'uid',
      value: 42,
    });
  });

  it('does not advance the stored cursor when internal ingestion fails', async () => {
    const updates = [];
    const acknowledged = [];
    const row = buildRow();
    const supabase = buildSupabaseStub([row], updates);
    const adapter = {
      async fetchInboundMessages() {
        return {
          messages: [
            {
              uid: 42,
              provider_cursor: 42,
              message_id: '<msg-42@example.com>',
              subject: 'New lead',
              received_at: '2026-03-14T13:00:00.000Z',
              from: { email: 'lead@example.com', name: 'Lead' },
              to: [{ email: 'owner@example.com', name: 'Owner' }],
            },
          ],
          cursor: { strategy: 'uid', value: 42 },
        };
      },
      async acknowledgeCursor(cursor) {
        acknowledged.push(cursor);
        return { ok: true };
      },
    };

    await assert.rejects(
      () =>
        processInboundMailboxJob(
          {
            tenant_id: row.tenant_id,
            mailbox_id: 'owner-primary',
          },
          {
            supabase,
            internalToken: 'test-internal-token',
            backendUrl: 'http://backend:3001',
            resolveCommunicationsProviderConnection: async () => ({
              integration: row,
              connection: {
                config: row.config,
              },
              adapter,
            }),
            fetchImpl: async () => ({
              ok: false,
              status: 502,
              async json() {
                return {
                  ok: false,
                  error: {
                    code: 'communications_orchestration_failed',
                    message: 'orchestration failed',
                  },
                };
              },
            }),
          },
        ),
      (error) => error.code === 'communications_orchestration_failed',
    );

    assert.equal(acknowledged.length, 0);
    assert.equal(updates.length, 0);
  });

  it('processes a communications poll cycle and records success metadata for each due mailbox', async () => {
    const updates = [];
    const row = buildRow({
      metadata: {
        communications: {
          sync: {},
        },
      },
    });

    const cycleResults = await processCommunicationsPollCycle({
      now: Date.parse('2026-03-14T13:00:00.000Z'),
      supabase: buildSupabaseStub([row], updates),
      internalToken: 'test-internal-token',
      backendUrl: 'http://backend:3001',
      resolveCommunicationsProviderConnection: async () => ({
        integration: row,
        connection: { config: row.config },
        adapter: {
          async fetchInboundMessages() {
            return { messages: [], cursor: { strategy: 'uid', value: 41 } };
          },
          async acknowledgeCursor() {
            return { ok: true };
          },
        },
      }),
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { ok: true };
        },
      }),
    });

    assert.equal(cycleResults.length, 1);
    assert.equal(cycleResults[0].ok, true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].metadata.communications.sync.last_result, 'success');
    assert.equal(updates[0].metadata.communications.sync.last_error, null);
    assert.equal(
      updates[0].metadata.communications.sync.last_polled_at,
      '2026-03-14T13:00:00.000Z',
    );
  });
});
