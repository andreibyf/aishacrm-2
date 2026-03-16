import test from 'node:test';
import assert from 'node:assert/strict';

import {
  promoteLeadCaptureQueueItem,
  updateLeadCaptureQueueStatus,
} from '../../services/communicationsStateService.js';

function createSupabaseStub({ queueItemOverrides = {}, leadRecordOverrides = {} } = {}) {
  const updates = {
    queue: null,
    linkRows: [],
    rpcCalls: [],
  };

  const queueItem = {
    id: 'queue-001',
    tenant_id: 'tenant-1',
    thread_id: 'thread-001',
    message_id: 'message-001',
    mailbox_id: 'owner-primary',
    mailbox_address: 'owner@example.com',
    sender_email: 'prospect@example.com',
    sender_name: 'Prospect Person',
    sender_domain: 'example.com',
    subject: 'Interested in your services',
    normalized_subject: 'interested in your services',
    status: 'pending_review',
    reason: 'unknown_sender',
    metadata: {
      source_service: 'communications-worker',
    },
    ...queueItemOverrides,
  };

  const leadRecord = {
    id: 'lead-001',
    tenant_id: 'tenant-1',
    first_name: 'Prospect',
    last_name: 'Person',
    email: 'prospect@example.com',
    company: 'Example Co',
    ...leadRecordOverrides,
  };

  const queueTable = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return {
        data: queueItem,
        error: null,
      };
    },
    update(payload) {
      updates.queue = payload;
      return this;
    },
    async single() {
      return {
        data: {
          ...queueItem,
          status: updates.queue.status,
          metadata: updates.queue.metadata,
        },
        error: null,
      };
    },
  };

  const leadsTable = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return {
        data:
          queueItem.status === 'promoted' && queueItem.metadata?.promotion?.entity_id
            ? {
                ...leadRecord,
                id: queueItem.metadata.promotion.entity_id,
              }
            : null,
        error: null,
      };
    },
    async single() {
      return {
        data: leadRecord,
        error: null,
      };
    },
  };

  const linksTable = {
    insert(row) {
      updates.linkRows.push(row);
      return Promise.resolve({ error: null });
    },
  };

  return {
    updates,
    queueItem,
    leadRecord,
    from(table) {
      if (table === 'communications_lead_capture_queue') return queueTable;
      if (table === 'communications_entity_links') return linksTable;
      if (table === 'leads') return leadsTable;
      throw new Error(`Unexpected table ${table}`);
    },
    rpc(name, payload) {
      updates.rpcCalls.push({ name, payload });
      return Promise.resolve({
        data: leadRecord.id,
        error: null,
      });
    },
  };
}

test('updateLeadCaptureQueueStatus records review metadata for dismissed items', async () => {
  const supabase = createSupabaseStub();

  const result = await updateLeadCaptureQueueStatus(
    {
      tenantId: 'tenant-1',
      queueItemId: 'queue-001',
      status: 'dismissed',
      user: { id: 'user-1', email: 'owner@example.com' },
      note: 'Known partner inbox',
    },
    { supabase },
  );

  assert.equal(result.queue_item.status, 'dismissed');
  assert.equal(supabase.updates.queue.status, 'dismissed');
  assert.equal(supabase.updates.queue.metadata.review.status, 'dismissed');
  assert.equal(supabase.updates.queue.metadata.review.updated_by, 'owner@example.com');
  assert.equal(supabase.updates.queue.metadata.review.note, 'Known partner inbox');
});

test('updateLeadCaptureQueueStatus records promotion metadata', async () => {
  const supabase = createSupabaseStub();

  const result = await updateLeadCaptureQueueStatus(
    {
      tenantId: 'tenant-1',
      queueItemId: 'queue-001',
      status: 'promoted',
      user: { id: 'user-1', email: 'owner@example.com' },
      promotedEntityType: 'lead',
      promotedEntityId: 'lead-001',
    },
    { supabase },
  );

  assert.equal(result.queue_item.status, 'promoted');
  assert.equal(supabase.updates.queue.metadata.promotion.entity_type, 'lead');
  assert.equal(supabase.updates.queue.metadata.promotion.entity_id, 'lead-001');
});

test('promoteLeadCaptureQueueItem creates a lead, links it, and marks the queue item promoted', async () => {
  const supabase = createSupabaseStub({
    leadRecordOverrides: {
      company: 'Example Co',
    },
  });

  const result = await promoteLeadCaptureQueueItem(
    {
      tenantId: 'tenant-1',
      queueItemId: 'queue-001',
      user: { id: 'user-1', email: 'owner@example.com' },
      lead: {
        company: 'Example Co',
        note: 'Approved from inbox review',
      },
    },
    { supabase },
  );

  assert.equal(result.already_promoted, false);
  assert.equal(result.lead.id, 'lead-001');
  assert.equal(supabase.updates.rpcCalls.length, 1);
  assert.equal(supabase.updates.rpcCalls[0].name, 'leads_insert_definer');
  assert.equal(supabase.updates.rpcCalls[0].payload.p_email, 'prospect@example.com');
  assert.equal(supabase.updates.linkRows.length, 2);
  assert.equal(supabase.updates.linkRows[0].entity_type, 'lead');
  assert.equal(result.queue_item.status, 'promoted');
  assert.equal(result.queue_item.metadata.promotion.entity_id, 'lead-001');
  assert.equal(result.queue_item.metadata.review.note, 'Approved from inbox review');
});

test('promoteLeadCaptureQueueItem is idempotent when the queue item is already promoted', async () => {
  const supabase = createSupabaseStub({
    queueItemOverrides: {
      status: 'promoted',
      metadata: {
        promotion: {
          entity_type: 'lead',
          entity_id: 'lead-999',
        },
      },
    },
    leadRecordOverrides: {
      id: 'lead-999',
      email: 'prospect@example.com',
    },
  });

  const result = await promoteLeadCaptureQueueItem(
    {
      tenantId: 'tenant-1',
      queueItemId: 'queue-001',
      user: { id: 'user-1', email: 'owner@example.com' },
    },
    { supabase },
  );

  assert.equal(result.already_promoted, true);
  assert.equal(result.lead.id, 'lead-999');
  assert.equal(supabase.updates.rpcCalls.length, 0);
  assert.equal(supabase.updates.linkRows.length, 0);
});
