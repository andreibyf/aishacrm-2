import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCommunicationsThreadMessages,
  listCommunicationsThreads,
} from '../../services/communicationsReadService.js';

function createQueryResult(data, error = null, count = null) {
  return { data, error, count };
}

function createSupabaseStub() {
  const threadRows = [
    {
      id: 'thread-open',
      tenant_id: 'tenant-1',
      mailbox_id: 'owner-primary',
      mailbox_address: 'aisha@aishacrm.com',
      subject: 'Queued thread',
      normalized_subject: 'queued thread',
      participants: [],
      status: 'open',
      first_message_at: '2026-03-15T12:00:00.000Z',
      last_message_at: '2026-03-15T12:00:00.000Z',
      metadata: {},
      created_at: '2026-03-15T12:00:00.000Z',
      updated_at: '2026-03-15T12:00:00.000Z',
    },
    {
      id: 'thread-delivered',
      tenant_id: 'tenant-1',
      mailbox_id: 'owner-primary',
      mailbox_address: 'aisha@aishacrm.com',
      subject: 'Delivered thread',
      normalized_subject: 'delivered thread',
      participants: [],
      status: 'open',
      first_message_at: '2026-03-15T11:00:00.000Z',
      last_message_at: '2026-03-15T11:00:00.000Z',
      metadata: {},
      created_at: '2026-03-15T11:00:00.000Z',
      updated_at: '2026-03-15T11:00:00.000Z',
    },
  ];

  const messageRows = [
    {
      id: 'message-open',
      thread_id: 'thread-open',
      internet_message_id: '<open@example.com>',
      direction: 'outbound',
      subject: 'Queued thread',
      sender_email: 'aisha@aishacrm.com',
      sender_name: 'AiSHA',
      received_at: '2026-03-15T12:00:00.000Z',
      activity_id: 'activity-open',
      metadata: {
        delivery: { state: 'queued' },
      },
    },
    {
      id: 'message-delivered',
      thread_id: 'thread-delivered',
      internet_message_id: '<delivered@example.com>',
      direction: 'outbound',
      subject: 'Delivered thread',
      sender_email: 'aisha@aishacrm.com',
      sender_name: 'AiSHA',
      received_at: '2026-03-15T11:00:00.000Z',
      activity_id: 'activity-delivered',
      metadata: {
        delivery: { state: 'delivered' },
      },
    },
  ];

  const linksByThreadId = {
    'thread-delivered': [
      {
        thread_id: 'thread-delivered',
        entity_type: 'lead',
        entity_id: 'lead-001',
        link_scope: 'thread',
        source: 'explicit',
        confidence: 1,
      },
    ],
  };

  return {
    from(table) {
      const state = {
        table,
        filters: [],
      };

      const query = {
        select() {
          return this;
        },
        eq(field, value) {
          state.filters.push({ type: 'eq', field, value });
          return this;
        },
        in(field, values) {
          state.filters.push({ type: 'in', field, values });
          return this;
        },
        order() {
          return this;
        },
        range(start, end) {
          state.range = { start, end };
          return this;
        },
        then(resolve, reject) {
          try {
            if (table === 'communications_threads') {
              let rows = [...threadRows];
              const tenantFilter = state.filters.find((filter) => filter.field === 'tenant_id');
              if (tenantFilter) {
                rows = rows.filter((row) => row.tenant_id === tenantFilter.value);
              }
              const statusFilter = state.filters.find((filter) => filter.field === 'status');
              if (statusFilter) {
                rows = rows.filter((row) => row.status === statusFilter.value);
              }
              if (state.range) {
                rows = rows.slice(state.range.start, state.range.end + 1);
              }
              return Promise.resolve(resolve(createQueryResult(rows, null, rows.length)));
            }

            if (table === 'communications_messages') {
              const threadFilter = state.filters.find((filter) => filter.field === 'thread_id');
              const rows = threadFilter?.values
                ? messageRows.filter((row) => threadFilter.values.includes(row.thread_id))
                : messageRows;
              return Promise.resolve(resolve(createQueryResult(rows, null, rows.length)));
            }

            if (table === 'communications_entity_links') {
              const threadFilter = state.filters.find((filter) => filter.field === 'thread_id');
              const rows =
                threadFilter?.values?.flatMap((threadId) => linksByThreadId[threadId] || []) ?? [];
              return Promise.resolve(resolve(createQueryResult(rows, null, rows.length)));
            }

            throw new Error(`Unexpected table ${table}`);
          } catch (error) {
            if (reject) return Promise.resolve(reject(error));
            throw error;
          }
        },
      };

      return query;
    },
  };
}

test('listCommunicationsThreads paginates after delivery_state filtering', async () => {
  const result = await listCommunicationsThreads(
    {
      tenantId: 'tenant-1',
      limit: 1,
      offset: 0,
      deliveryState: 'delivered',
    },
    { supabase: createSupabaseStub() },
  );

  assert.equal(result.total, 1);
  assert.equal(result.threads.length, 1);
  assert.equal(result.threads[0].id, 'thread-delivered');
  assert.equal(result.threads[0].state.delivery.state, 'delivered');
});

function createThreadMessagesSupabaseStub() {
  const threadRow = {
    id: 'thread-001',
    tenant_id: 'tenant-1',
    mailbox_id: 'owner-primary',
    mailbox_address: 'aisha@aishacrm.com',
    subject: 'Thread',
    normalized_subject: 'thread',
    participants: [],
    status: 'open',
    first_message_at: '2026-03-15T10:00:00.000Z',
    last_message_at: '2026-03-15T12:00:00.000Z',
    metadata: {},
    created_at: '2026-03-15T10:00:00.000Z',
    updated_at: '2026-03-15T12:00:00.000Z',
  };

  const pageMessages = [
    {
      id: 'message-older',
      thread_id: 'thread-001',
      internet_message_id: '<older@example.com>',
      direction: 'inbound',
      provider_cursor: null,
      subject: 'Thread',
      sender_email: 'prospect@example.com',
      sender_name: 'Prospect',
      recipients: [],
      cc: [],
      bcc: [],
      received_at: '2026-03-15T10:00:00.000Z',
      text_body: 'Older',
      html_body: '',
      headers: {},
      activity_id: null,
      metadata: {
        delivery: { state: 'queued' },
      },
      created_at: '2026-03-15T10:00:00.000Z',
      updated_at: '2026-03-15T10:00:00.000Z',
    },
  ];

  const latestMessage = {
    id: 'message-latest',
    thread_id: 'thread-001',
    internet_message_id: '<latest@example.com>',
    direction: 'outbound',
    provider_cursor: null,
    subject: 'Thread',
    sender_email: 'aisha@aishacrm.com',
    sender_name: 'AiSHA',
    recipients: [],
    cc: [],
    bcc: [],
    received_at: '2026-03-15T12:00:00.000Z',
    text_body: 'Latest',
    html_body: '',
    headers: {},
    activity_id: null,
    metadata: {
      delivery: { state: 'delivered' },
    },
    created_at: '2026-03-15T12:00:00.000Z',
    updated_at: '2026-03-15T12:00:00.000Z',
  };

  return {
    from(table) {
      const state = { table, filters: [], orderAscending: null };
      return {
        select() {
          return this;
        },
        eq(field, value) {
          state.filters.push({ field, value });
          return this;
        },
        order(_field, options) {
          state.orderAscending = options?.ascending;
          return this;
        },
        range() {
          return Promise.resolve({ data: pageMessages, error: null });
        },
        limit(limitValue) {
          if (
            table === 'communications_messages' &&
            state.orderAscending === false &&
            limitValue === 1
          ) {
            return Promise.resolve({ data: [latestMessage], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          if (table === 'communications_threads') {
            return Promise.resolve({ data: threadRow, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve, reject) {
          try {
            if (table === 'communications_entity_links') {
              return Promise.resolve(resolve({ data: [], error: null }));
            }
            throw new Error(`Unexpected then() call for table ${table}`);
          } catch (error) {
            if (reject) return Promise.resolve(reject(error));
            throw error;
          }
        },
      };
    },
  };
}

test('getCommunicationsThreadMessages derives thread state from the true latest message', async () => {
  const result = await getCommunicationsThreadMessages(
    {
      tenantId: 'tenant-1',
      threadId: 'thread-001',
      limit: 1,
      offset: 0,
    },
    { supabase: createThreadMessagesSupabaseStub() },
  );

  assert.equal(result.thread.state.delivery.state, 'delivered');
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].state.delivery.state, 'queued');
});
