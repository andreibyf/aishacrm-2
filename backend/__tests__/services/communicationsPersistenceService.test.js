import test from 'node:test';
import assert from 'node:assert/strict';

import { attachActivityToCommunicationsRecords } from '../../services/communicationsPersistenceService.js';

function createSupabaseStub() {
  const updates = {
    message: null,
    activity: null,
    linkRows: null,
  };

  const messageTable = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return {
        data: {
          metadata: {
            delivery: { state: 'delivered' },
            attachments: [{ filename: 'proposal.pdf' }],
            provider_metadata: { provider: 'zoho' },
            event_log: [{ type: 'delivery_reconciled' }],
          },
        },
        error: null,
      };
    },
    update(payload) {
      updates.message = payload;
      return this;
    },
    then(resolve) {
      return Promise.resolve(resolve({ error: null }));
    },
  };

  const entityLinksTable = {
    insert(rows) {
      updates.linkRows = rows;
      return Promise.resolve({ error: null });
    },
  };

  const activitiesTable = {
    update(payload) {
      updates.activity = payload;
      return this;
    },
    eq() {
      return this;
    },
    select() {
      return this;
    },
    async single() {
      return {
        data: {
          id: 'activity-001',
          metadata: updates.activity?.metadata || {},
        },
        error: null,
      };
    },
  };

  return {
    updates,
    from(table) {
      if (table === 'communications_messages') return messageTable;
      if (table === 'communications_entity_links') return entityLinksTable;
      if (table === 'activities') return activitiesTable;
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

test('attachActivityToCommunicationsRecords preserves message metadata when linking activity', async () => {
  const supabase = createSupabaseStub();

  await attachActivityToCommunicationsRecords(
    {
      tenantId: 'tenant-1',
      threadId: 'thread-001',
      messageId: 'message-001',
      activity: {
        id: 'activity-001',
        metadata: {
          communications: {
            thread_id: 'thread-001',
            stored_message_id: 'message-001',
          },
        },
      },
      links: [
        {
          type: 'lead',
          id: 'lead-001',
          source: 'explicit',
          confidence: 1,
        },
      ],
    },
    { supabase },
  );

  assert.equal(supabase.updates.message.activity_id, 'activity-001');
  assert.equal(supabase.updates.message.metadata.activity_id, 'activity-001');
  assert.equal(supabase.updates.message.metadata.delivery.state, 'delivered');
  assert.equal(supabase.updates.message.metadata.attachments[0].filename, 'proposal.pdf');
  assert.equal(supabase.updates.message.metadata.provider_metadata.provider, 'zoho');
  assert.equal(supabase.updates.message.metadata.event_log[0].type, 'delivery_reconciled');
  assert.equal(supabase.updates.message.metadata.communications.thread_id, 'thread-001');
});
