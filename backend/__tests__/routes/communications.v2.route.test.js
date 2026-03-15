import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let server;
const port = 3112;
const listThreadsCalls = [];
const replayThreadCalls = [];
const updateThreadStatusCalls = [];
const purgeThreadCalls = [];

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

describe('Communications v2 routes', () => {
  before(async () => {
    const express = (await import('express')).default;
    const createCommunicationsV2Routes = (await import('../../routes/communications.v2.js'))
      .default;

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = {
        id: 'test-user',
        email: 'test@example.com',
        role: 'admin',
        tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      };
      req.tenant = { id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46' };
      next();
    });

    app.use(
      '/api/v2/communications',
      createCommunicationsV2Routes(null, {
        listThreads: async (args) => {
          listThreadsCalls.push(args);
          const { tenantId, limit, offset } = args;
          return {
            threads: [
              {
                id: 'thread-001',
                tenant_id: tenantId,
                mailbox_id: 'owner-primary',
                subject: 'Re: Intro call',
                linked_entities: [
                  {
                    entity_type: 'lead',
                    entity_id: '11111111-1111-1111-1111-111111111111',
                  },
                ],
                latest_message: {
                  id: 'message-002',
                  thread_id: 'thread-001',
                  subject: 'Re: Intro call',
                  metadata: {
                    attachments: [
                      {
                        filename: 'proposal.pdf',
                        content_type: 'application/pdf',
                      },
                    ],
                    delivery: {
                      state: 'delivered',
                    },
                  },
                },
                metadata: {
                  replay: {
                    replay_job_id: 'replay-001',
                  },
                  event_log: [
                    {
                      type: 'thread_replay_requested',
                      occurred_at: '2026-03-14T12:05:00.000Z',
                      actor: 'owner@example.com',
                      replay_job_id: 'replay-001',
                    },
                  ],
                },
              },
            ],
            total: 1,
            limit: Number.parseInt(limit, 10) || 25,
            offset: Number.parseInt(offset, 10) || 0,
            applied_filters: {
              mailbox_id: args.mailboxId || null,
              status: args.status || null,
              view: args.view || null,
              entity_type: args.entityType || null,
              entity_id: args.entityId || null,
              delivery_state: args.deliveryState || null,
            },
          };
        },
        getThreadMessages: async ({ tenantId, threadId, limit, offset }) => {
          if (threadId === 'missing-thread') return null;
          return {
            thread: {
              id: threadId,
              tenant_id: tenantId,
              mailbox_id: 'owner-primary',
              subject: 'Re: Intro call',
              linked_entities: [
                {
                  entity_type: 'lead',
                  entity_id: '11111111-1111-1111-1111-111111111111',
                },
              ],
              metadata: {
                event_log: [
                  {
                    type: 'delivery_reconciled',
                    occurred_at: '2026-03-14T12:06:00.000Z',
                    actor: 'communications-worker',
                    delivery_state: 'delivered',
                  },
                ],
              },
            },
            messages: [
              {
                id: 'message-001',
                thread_id: threadId,
                direction: 'inbound',
                subject: 'Intro call',
                linked_entities: [],
              },
              {
                id: 'message-002',
                thread_id: threadId,
                direction: 'outbound',
                subject: 'Re: Intro call',
                metadata: {
                  attachments: [
                    {
                      filename: 'proposal.pdf',
                      content_type: 'application/pdf',
                    },
                  ],
                  delivery: { state: 'delivered' },
                  meeting: { reply_state: 'accepted' },
                },
                linked_entities: [
                  {
                    entity_type: 'activity',
                    entity_id: '22222222-2222-2222-2222-222222222222',
                  },
                ],
              },
            ],
            limit: Number.parseInt(limit, 10) || 50,
            offset: Number.parseInt(offset, 10) || 0,
          };
        },
        replayThread: async (request) => {
          replayThreadCalls.push(request);
          return {
            ok: true,
            status: 'accepted',
            result: {
              thread_id: request.payload.thread_id,
              replay_job_id: request.payload.replay_job_id,
              processing_status: 'replay_requested',
            },
          };
        },
        updateThreadStatus: async (request) => {
          updateThreadStatusCalls.push(request);
          return {
            thread: {
              id: request.threadId,
              tenant_id: request.tenantId,
              mailbox_id: 'owner-primary',
              subject: 'Re: Intro call',
              status: request.status,
              metadata: {},
            },
          };
        },
        purgeThread: async (request) => {
          purgeThreadCalls.push(request);
          return {
            thread_id: request.threadId,
            tenant_id: request.tenantId,
            purged_at: '2026-03-15T02:00:00.000Z',
            purged_by: request.user?.email || null,
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

  it('lists communication threads for a tenant', async () => {
    listThreadsCalls.length = 0;
    const res = await request(
      '/api/v2/communications/threads?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46&limit=10',
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.equal(json.data.total, 1);
    assert.equal(json.data.threads[0].id, 'thread-001');
    assert.equal(json.data.threads[0].latest_message.id, 'message-002');
    assert.equal(json.data.threads[0].state.delivery.state, 'delivered');
    assert.equal(json.data.threads[0].state.replay.replay_job_id, 'replay-001');
    assert.equal(json.data.threads[0].state.events[0].type, 'thread_replay_requested');
    assert.equal(json.data.threads[0].latest_message_attachments[0].filename, 'proposal.pdf');
  });

  it('returns 400 when tenant_id is missing for thread list', async () => {
    const res = await request('/api/v2/communications/threads');
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.status, 'error');
  });

  it('returns messages for a communication thread', async () => {
    const res = await request(
      '/api/v2/communications/threads/thread-001/messages?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46&limit=2',
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.equal(json.data.thread.id, 'thread-001');
    assert.equal(json.data.messages.length, 2);
    assert.equal(json.data.messages[1].linked_entities[0].entity_type, 'activity');
    assert.equal(json.data.messages[1].state.delivery.state, 'delivered');
    assert.equal(json.data.messages[1].state.meeting.reply_state, 'accepted');
    assert.equal(json.data.thread.event_log[0].type, 'delivery_reconciled');
    assert.equal(json.data.messages[1].attachments[0].filename, 'proposal.pdf');
  });

  it('passes mailbox, linked entity, view, and delivery filters through to the thread reader', async () => {
    listThreadsCalls.length = 0;
    const res = await request(
      '/api/v2/communications/threads?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46&mailbox_id=owner-primary&entity_type=lead&entity_id=11111111-1111-1111-1111-111111111111&view=unread&status=open&delivery_state=delivered',
    );
    assert.equal(res.status, 200);
    assert.equal(listThreadsCalls.length, 1);
    assert.deepEqual(listThreadsCalls[0], {
      tenantId: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      limit: undefined,
      offset: undefined,
      mailboxId: 'owner-primary',
      status: 'open',
      view: 'unread',
      entityType: 'lead',
      entityId: '11111111-1111-1111-1111-111111111111',
      deliveryState: 'delivered',
    });
  });

  it('rejects invalid view values', async () => {
    const res = await request(
      '/api/v2/communications/threads?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46&view=pending',
    );
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.code, 'communications_invalid_view');
  });

  it('rejects invalid entity_type values', async () => {
    const res = await request(
      '/api/v2/communications/threads?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46&entity_type=deal&entity_id=11111111-1111-1111-1111-111111111111',
    );
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.code, 'communications_invalid_entity_type');
  });

  it('rejects invalid delivery_state values', async () => {
    const res = await request(
      '/api/v2/communications/threads?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46&delivery_state=deferred',
    );
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.code, 'communications_invalid_delivery_state');
  });

  it('returns 404 when a communication thread does not exist', async () => {
    const res = await request(
      '/api/v2/communications/threads/missing-thread/messages?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46',
    );
    assert.equal(res.status, 404);
    const json = await res.json();
    assert.equal(json.code, 'communications_thread_not_found');
  });

  it('requests a replay for a communication thread', async () => {
    replayThreadCalls.length = 0;
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path: '/api/v2/communications/threads/thread-001/replay',
          method: 'POST',
          headers: {
            connection: 'close',
            'Content-Type': 'application/json',
          },
        },
        (response) => {
          let raw = '';
          response.on('data', (chunk) => {
            raw += chunk;
          });
          response.on('end', () => {
            response.status = response.statusCode;
            response.json = () => JSON.parse(raw);
            resolve(response);
          });
        },
      );
      req.on('error', reject);
      req.write(
        JSON.stringify({
          tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
          mailbox_id: 'owner-primary',
        }),
      );
      req.end();
    });

    assert.equal(res.status, 202);
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.equal(json.data.result.processing_status, 'replay_requested');
    assert.equal(replayThreadCalls.length, 1);
    assert.equal(replayThreadCalls[0].payload.thread_id, 'thread-001');
  });

  it('updates the status of a communication thread', async () => {
    updateThreadStatusCalls.length = 0;
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path: '/api/v2/communications/threads/thread-001/status',
          method: 'POST',
          headers: {
            connection: 'close',
            'Content-Type': 'application/json',
          },
        },
        (response) => {
          let raw = '';
          response.on('data', (chunk) => {
            raw += chunk;
          });
          response.on('end', () => {
            response.status = response.statusCode;
            response.json = () => JSON.parse(raw);
            resolve(response);
          });
        },
      );
      req.on('error', reject);
      req.write(
        JSON.stringify({
          tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
          status: 'closed',
        }),
      );
      req.end();
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.equal(json.data.thread.status, 'closed');
    assert.equal(updateThreadStatusCalls.length, 1);
    assert.deepEqual(updateThreadStatusCalls[0], {
      tenantId: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      threadId: 'thread-001',
      status: 'closed',
      user: {
        id: 'test-user',
        email: 'test@example.com',
        role: 'admin',
        tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      },
    });
  });

  it('purges a communication thread', async () => {
    purgeThreadCalls.length = 0;
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path: '/api/v2/communications/threads/thread-001?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46',
          method: 'DELETE',
          headers: {
            connection: 'close',
          },
        },
        (response) => {
          let raw = '';
          response.on('data', (chunk) => {
            raw += chunk;
          });
          response.on('end', () => {
            response.status = response.statusCode;
            response.json = () => JSON.parse(raw);
            resolve(response);
          });
        },
      );
      req.on('error', reject);
      req.end();
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.equal(json.data.thread_id, 'thread-001');
    assert.equal(purgeThreadCalls.length, 1);
    assert.deepEqual(purgeThreadCalls[0], {
      tenantId: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      threadId: 'thread-001',
      user: {
        id: 'test-user',
        email: 'test@example.com',
        role: 'admin',
        tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      },
    });
  });

  it('rejects invalid thread status values', async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path: '/api/v2/communications/threads/thread-001/status',
          method: 'POST',
          headers: {
            connection: 'close',
            'Content-Type': 'application/json',
          },
        },
        (response) => {
          let raw = '';
          response.on('data', (chunk) => {
            raw += chunk;
          });
          response.on('end', () => {
            response.status = response.statusCode;
            response.json = () => JSON.parse(raw);
            resolve(response);
          });
        },
      );
      req.on('error', reject);
      req.write(
        JSON.stringify({
          tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
          status: 'pending',
        }),
      );
      req.end();
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.code, 'communications_invalid_thread_status');
  });
});
