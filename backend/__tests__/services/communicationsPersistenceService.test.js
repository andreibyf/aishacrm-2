import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attachActivityToCommunicationsRecords,
  queueInboundLeadCapture,
} from '../../services/communicationsPersistenceService.js';

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

function createLeadCaptureSupabaseStub({ duplicate = null } = {}) {
  const inserts = {
    queue: null,
  };

  const queueTable = {
    select() {
      return this;
    },
    eq(field) {
      this._lastField = field;
      return this;
    },
    order() {
      return this;
    },
    limit() {
      const matches =
        duplicate &&
        ((duplicate.scope === 'thread' && this._lastField === 'thread_id') ||
          (duplicate.scope === 'sender' && this._lastField === 'sender_email') ||
          (duplicate.scope === 'domain' && this._lastField === 'sender_domain'))
          ? [duplicate.row]
          : [];
      return Promise.resolve({ data: matches, error: null });
    },
    insert(rows) {
      inserts.queue = rows;
      return this;
    },
    single() {
      return Promise.resolve({
        data: { id: 'queue-001', status: 'pending_review', reason: 'unknown_sender' },
        error: null,
      });
    },
  };

  return {
    inserts,
    from(table) {
      if (table === 'communications_lead_capture_queue') return queueTable;
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

test('queueInboundLeadCapture creates a review queue item for unknown senders', async () => {
  const supabase = createLeadCaptureSupabaseStub();

  const result = await queueInboundLeadCapture(
    {
      mailbox_id: 'owner-primary',
      mailbox_address: 'owner@example.com',
      source_service: 'communications-worker',
      occurred_at: '2026-03-15T10:00:00.000Z',
      payload: {
        message_id: '<msg-001@example.com>',
        subject: 'Interested in your services',
        received_at: '2026-03-15T10:00:00.000Z',
        from: { email: 'prospect@example.com', name: 'Prospect' },
      },
    },
    { id: 'tenant-1' },
    { thread: { id: 'thread-001' }, message: { id: 'message-001' } },
    [],
    { supabase },
  );

  assert.equal(result.status, 'queued_for_review');
  assert.equal(result.queue_item_id, 'queue-001');
  assert.equal(supabase.inserts.queue[0].sender_email, 'prospect@example.com');
  assert.equal(supabase.inserts.queue[0].sender_domain, 'example.com');
  assert.equal(supabase.inserts.queue[0].status, 'pending_review');
});

test('queueInboundLeadCapture suppresses duplicates for matching sender history', async () => {
  const supabase = createLeadCaptureSupabaseStub({
    duplicate: {
      scope: 'sender',
      row: { id: 'queue-existing', reason: 'unknown_sender' },
    },
  });

  const result = await queueInboundLeadCapture(
    {
      payload: {
        subject: 'Re: Interested in your services',
        from: { email: 'prospect@example.com', name: 'Prospect' },
      },
    },
    { id: 'tenant-1' },
    { thread: { id: 'thread-001' }, message: { id: 'message-001' } },
    [],
    { supabase },
  );

  assert.equal(result.status, 'duplicate_suppressed');
  assert.equal(result.queue_item_id, 'queue-existing');
  assert.equal(supabase.inserts.queue, null);
});

test('attachActivityToCommunicationsRecords persists an activity link even when no entity links exist', async () => {
  const supabase = createSupabaseStub();

  await attachActivityToCommunicationsRecords(
    {
      tenantId: 'tenant-1',
      threadId: 'thread-001',
      messageId: 'message-001',
      activity: {
        id: 'activity-002',
        metadata: {
          communications: {
            thread_id: 'thread-001',
            stored_message_id: 'message-001',
          },
        },
      },
      links: [],
    },
    { supabase },
  );

  assert.equal(Array.isArray(supabase.updates.linkRows), true);
  assert.equal(supabase.updates.linkRows.length, 1);
  assert.equal(supabase.updates.linkRows[0].entity_type, 'activity');
  assert.equal(supabase.updates.linkRows[0].entity_id, 'activity-002');
  assert.equal(supabase.updates.linkRows[0].link_scope, 'activity');
});
