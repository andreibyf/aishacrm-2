import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

let server;
const port = 3112;
const listThreadsCalls = [];

async function request(path) {
  return fetch(`http://localhost:${port}${path}`);
}

describe('Communications v2 routes', () => {
  before(async () => {
    const express = (await import('express')).default;
    const createCommunicationsV2Routes = (await import('../../routes/communications.v2.js')).default;

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
      }),
    );

    server = app.listen(port);
    await new Promise((resolve) => server.on('listening', resolve));
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('lists communication threads for a tenant', async () => {
    listThreadsCalls.length = 0;
    const res = await request('/api/v2/communications/threads?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46&limit=10');
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.equal(json.data.total, 1);
    assert.equal(json.data.threads[0].id, 'thread-001');
    assert.equal(json.data.threads[0].latest_message.id, 'message-002');
  });

  it('returns 400 when tenant_id is missing for thread list', async () => {
    const res = await request('/api/v2/communications/threads');
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.status, 'error');
  });

  it('returns messages for a communication thread', async () => {
    const res = await request('/api/v2/communications/threads/thread-001/messages?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46&limit=2');
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.equal(json.data.thread.id, 'thread-001');
    assert.equal(json.data.messages.length, 2);
    assert.equal(json.data.messages[1].linked_entities[0].entity_type, 'activity');
  });

  it('passes mailbox, linked entity, and view filters through to the thread reader', async () => {
    listThreadsCalls.length = 0;
    const res = await request(
      '/api/v2/communications/threads?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46&mailbox_id=owner-primary&entity_type=lead&entity_id=11111111-1111-1111-1111-111111111111&view=unread&status=open',
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

  it('returns 404 when a communication thread does not exist', async () => {
    const res = await request('/api/v2/communications/threads/missing-thread/messages?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46');
    assert.equal(res.status, 404);
    const json = await res.json();
    assert.equal(json.code, 'communications_thread_not_found');
  });
});
