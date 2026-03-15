import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requestLocal } from '../helpers/httpRequest.js';

let app;
let server;
const port = 3111;
let setInboundCommunicationsToolExecutorForTests;
let setInboundCommunicationsDependenciesForTests;
let setCommunicationsEventDependenciesForTests;

async function request(method, path, body, headers = {}) {
  return requestLocal({
    port,
    path,
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body,
  });
}

function buildValidInboundBody() {
  return {
    tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
    mailbox_id: 'owner-primary',
    source_service: 'communications-worker',
    event_type: 'communications.inbound.received',
    occurred_at: '2026-03-13T23:15:00.000Z',
    payload: {
      message_id: '<abc123@mail.aishacrm.com>',
      subject: 'Re: Intro call',
      from: { email: 'prospect@example.com', name: 'Prospect Name' },
      to: [{ email: 'andre@mail.aishacrm.com', name: 'Andre Byfield' }],
      received_at: '2026-03-13T23:14:59.000Z',
      text_body: 'Thanks, next week works for me.',
    },
    meta: {
      trace_id: 'trace-001',
      replay: false,
      attempt: 1,
    },
  };
}

describe('Internal Communications Route Scaffolding', () => {
  before(async () => {
    const express = (await import('express')).default;
    const createInternalCommunicationsRoutes = (
      await import('../../routes/internal-communications.js')
    ).default;
    ({ setInboundCommunicationsToolExecutorForTests } = await import(
      '../../services/inboundCommunicationsService.js'
    ));
    ({ setInboundCommunicationsDependenciesForTests } = await import(
      '../../services/inboundCommunicationsService.js'
    ));
    ({ setCommunicationsEventDependenciesForTests } = await import(
      '../../services/communicationsEventService.js'
    ));

    app = express();
    app.use(express.json());

    app.use((req, _res, next) => {
      const authHeader = req.headers.authorization || '';
      if (authHeader === 'Bearer internal-token') {
        req.user = {
          email: 'internal-service@system',
          internal: true,
          role: 'employee',
          tenant_id: null,
        };
      }
      next();
    });

    setInboundCommunicationsToolExecutorForTests(async (toolName, args) => {
      assert.equal(toolName, 'process_inbound_communication');
      return {
        tag: 'Ok',
        value: {
          id: 'activity-inbound-001',
          subject: args.subject,
          metadata: {
            communications: {
              link_status: args.entity_id ? 'linked' : 'pending',
            },
          },
        },
      };
    });
    setInboundCommunicationsDependenciesForTests({
      resolveCanonicalTenant: async (tenantId) => ({
        uuid: tenantId,
        slug: tenantId,
        source: 'test',
      }),
      persistInboundThreadAndMessage: async (_request, resolvedTenant) => ({
        thread: {
          id: 'thread-001',
          tenant_id: resolvedTenant.id,
        },
        message: {
          id: 'message-001',
          tenant_id: resolvedTenant.id,
        },
      }),
      resolveInboundEntityLinks: async (request) => {
        const refs = Array.isArray(request.payload.entity_refs) ? request.payload.entity_refs : [];
        return refs.map((entry) => ({
          type: entry.type,
          id: entry.id,
          source: 'explicit',
        }));
      },
      attachActivityToCommunicationsRecords: async ({ activity, threadId, messageId, links }) => ({
        ...activity,
        metadata: {
          ...(activity.metadata || {}),
          communications: {
            ...(activity.metadata?.communications || {}),
            thread_id: threadId,
            stored_message_id: messageId,
            link_status: links.length > 0 ? 'linked' : 'pending',
          },
        },
      }),
    });

    setCommunicationsEventDependenciesForTests({
      getSupabaseClient: () => ({
        from(table) {
          if (table === 'activities') {
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              maybeSingle: async () => ({
                data: {
                  id: 'activity-email-001',
                  tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
                  status: 'sent',
                  metadata: {
                    communications: {
                      thread_id: '11111111-1111-1111-1111-111111111111',
                      stored_message_id: '22222222-2222-2222-2222-222222222222',
                    },
                  },
                },
                error: null,
              }),
              update() {
                return this;
              },
              single: async () => ({ data: { id: 'activity-email-001' }, error: null }),
            };
          }
          if (table === 'communications_threads') {
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              maybeSingle: async () => ({
                data: {
                  id: '11111111-1111-1111-1111-111111111111',
                  metadata: {},
                },
                error: null,
              }),
              update() {
                return this;
              },
              single: async () => ({
                data: { id: '11111111-1111-1111-1111-111111111111', metadata: {} },
                error: null,
              }),
            };
          }
          if (table === 'communications_messages') {
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              order() {
                return this;
              },
              limit() {
                return this;
              },
              maybeSingle: async () => ({
                data: {
                  id: '22222222-2222-2222-2222-222222222222',
                  thread_id: '11111111-1111-1111-1111-111111111111',
                  metadata: {},
                },
                error: null,
              }),
              update() {
                return this;
              },
              single: async () => ({
                data: { id: '22222222-2222-2222-2222-222222222222', metadata: {} },
                error: null,
              }),
            };
          }
          throw new Error(`Unexpected table ${table}`);
        },
      }),
    });

    app.use('/api/internal/communications', createInternalCommunicationsRoutes(null));
    server = app.listen(port);
    await new Promise((resolve) => server.on('listening', resolve));
  });

  after(async () => {
    setInboundCommunicationsToolExecutorForTests(null);
    setInboundCommunicationsDependenciesForTests(null);
    setCommunicationsEventDependenciesForTests(null);
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('rejects unauthenticated internal communications requests', async () => {
    const res = await request(
      'POST',
      '/api/internal/communications/inbound',
      buildValidInboundBody(),
      {
        'X-AISHA-IDEMPOTENCY-KEY': 'msg-001',
      },
    );

    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.ok, false);
    assert.equal(json.error.code, 'communications_invalid_auth');
  });

  it('rejects requests without idempotency header', async () => {
    const res = await request(
      'POST',
      '/api/internal/communications/inbound',
      buildValidInboundBody(),
      {
        Authorization: 'Bearer internal-token',
      },
    );

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.ok, false);
    assert.equal(json.error.code, 'communications_payload_invalid');
  });

  it('rejects invalid inbound payloads before hitting the inbound handler', async () => {
    const body = buildValidInboundBody();
    delete body.payload.message_id;

    const res = await request('POST', '/api/internal/communications/inbound', body, {
      Authorization: 'Bearer internal-token',
      'X-AISHA-IDEMPOTENCY-KEY': 'msg-002',
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, 'communications_payload_invalid');
    assert.ok(Array.isArray(json.error.details.errors));
  });

  it('returns 202 after successful inbound validation and service wiring', async () => {
    const res = await request(
      'POST',
      '/api/internal/communications/inbound',
      buildValidInboundBody(),
      {
        Authorization: 'Bearer internal-token',
        'X-AISHA-IDEMPOTENCY-KEY': 'msg-003',
      },
    );

    assert.equal(res.status, 202);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.status, 'accepted');
    assert.equal(json.result.processing_status, 'accepted');
    assert.equal(json.result.message_id, '<abc123@mail.aishacrm.com>');
    assert.equal(typeof json.result.thread_id, 'string');
    assert.equal(typeof json.result.stored_message_id, 'string');
    assert.equal(json.result.activity_id, 'activity-inbound-001');
  });

  it('returns 202 after outbound reconcile validation and service wiring', async () => {
    const res = await request(
      'POST',
      '/api/internal/communications/outbound/reconcile',
      {
        tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
        mailbox_id: 'owner-primary',
        source_service: 'communications-worker',
        event_type: 'communications.outbound.reconcile',
        occurred_at: '2026-03-13T23:20:00.000Z',
        payload: {
          outbound_message_id: '<outbound@mail.aishacrm.com>',
          delivery_state: 'delivered',
        },
      },
      {
        Authorization: 'Bearer internal-token',
        'X-AISHA-IDEMPOTENCY-KEY': 'reconcile-001',
      },
    );

    assert.equal(res.status, 202);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.result.processing_status, 'reconciled');
  });

  it('returns 202 after successful thread replay request', async () => {
    const res = await request(
      'POST',
      '/api/internal/communications/threads/replay',
      {
        tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
        mailbox_id: 'owner-primary',
        source_service: 'communications-worker',
        event_type: 'communications.thread.replay',
        occurred_at: '2026-03-13T23:20:00.000Z',
        payload: {
          thread_id: '11111111-1111-1111-1111-111111111111',
          replay_job_id: 'replay-001',
          replay_reason: 'operator_retry',
          original_event_type: 'communications.inbound.received',
        },
      },
      {
        Authorization: 'Bearer internal-token',
        'X-AISHA-IDEMPOTENCY-KEY': 'replay-001',
      },
    );

    assert.equal(res.status, 202);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.result.processing_status, 'replay_requested');
  });

  it('returns 202 after successful scheduling reply processing', async () => {
    const res = await request(
      'POST',
      '/api/internal/communications/scheduling/replies',
      {
        tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
        mailbox_id: 'owner-primary',
        source_service: 'communications-worker',
        event_type: 'communications.scheduling.reply',
        occurred_at: '2026-03-13T23:20:00.000Z',
        payload: {
          thread_id: '11111111-1111-1111-1111-111111111111',
          invite_id: 'invite-001',
          attendee_email: 'prospect@example.com',
          reply_state_hint: 'accepted',
        },
      },
      {
        Authorization: 'Bearer internal-token',
        'X-AISHA-IDEMPOTENCY-KEY': 'reply-001',
      },
    );

    assert.equal(res.status, 202);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.result.processing_status, 'meeting_reply_processed');
    assert.equal(json.result.activity_id, 'activity-email-001');
  });

  it('returns a health stub for internal monitoring', async () => {
    const res = await request('GET', '/api/internal/communications/health', undefined, {
      Authorization: 'Bearer internal-token',
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.status, 'stub');
  });
});
