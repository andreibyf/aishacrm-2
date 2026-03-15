import test from 'node:test';
import assert from 'node:assert/strict';

import { listCommunicationsThreads } from '../../services/communicationsReadService.js';

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
