import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCommunicationsThreadMessages,
  getLeadCaptureQueueItem,
  listLeadCaptureQueue,
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
      {
        thread_id: 'thread-delivered',
        entity_type: 'activity',
        entity_id: 'activity-delivered',
        link_scope: 'thread',
        source: 'activity_attachment',
        confidence: 1,
      },
    ],
  };

  const activityRows = [
    {
      id: 'activity-open',
      tenant_id: 'tenant-1',
      type: 'email',
      activity_type: 'email',
      subject: 'Queued thread',
      status: 'queued',
      due_date: '2026-03-15T12:00:00.000Z',
      due_time: null,
      related_to: 'lead',
      related_id: 'lead-open',
      metadata: {},
      created_date: '2026-03-15T12:00:00.000Z',
      updated_at: '2026-03-15T12:00:00.000Z',
    },
    {
      id: 'activity-delivered',
      tenant_id: 'tenant-1',
      type: 'email',
      activity_type: 'email',
      subject: 'Delivered thread',
      status: 'sent',
      due_date: '2026-03-15T11:00:00.000Z',
      due_time: null,
      related_to: 'lead',
      related_id: 'lead-001',
      metadata: {},
      created_date: '2026-03-15T11:00:00.000Z',
      updated_at: '2026-03-15T11:00:00.000Z',
    },
  ];

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

            if (table === 'activities') {
              const idsFilter = state.filters.find((filter) => filter.field === 'id');
              const rows = idsFilter?.values
                ? activityRows.filter((row) => idsFilter.values.includes(row.id))
                : activityRows;
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
  assert.equal(result.threads[0].latest_message.activity.id, 'activity-delivered');
  assert.equal(result.threads[0].linked_activities[0].id, 'activity-delivered');
});

test('listCommunicationsThreads activity hydration selects canonical activities columns', async () => {
  let activitiesSelect = null;

  const supabase = {
    from(table) {
      const state = { table, filters: [], select: null };
      return {
        select(value) {
          state.select = value;
          if (table === 'activities') {
            activitiesSelect = value;
          }
          return this;
        },
        eq(field, value) {
          state.filters.push({ field, value });
          return this;
        },
        in(field, values) {
          state.filters.push({ field, values });
          return this;
        },
        order() {
          return this;
        },
        range() {
          if (table === 'communications_threads') {
            return Promise.resolve({
              data: [
                {
                  id: 'thread-001',
                  tenant_id: 'tenant-1',
                  mailbox_id: 'owner-primary',
                  mailbox_address: 'aisha@aishacrm.com',
                  subject: 'Thread',
                  normalized_subject: 'thread',
                  participants: [],
                  status: 'open',
                  first_message_at: '2026-03-15T12:00:00.000Z',
                  last_message_at: '2026-03-15T12:00:00.000Z',
                  metadata: {},
                  created_at: '2026-03-15T12:00:00.000Z',
                  updated_at: '2026-03-15T12:00:00.000Z',
                },
              ],
              error: null,
              count: 1,
            });
          }
          return Promise.resolve({ data: [], error: null, count: 0 });
        },
        then(resolve, reject) {
          try {
            if (table === 'communications_messages') {
              return Promise.resolve(
                resolve({
                  data: [
                    {
                      id: 'message-001',
                      thread_id: 'thread-001',
                      internet_message_id: '<thread@example.com>',
                      direction: 'outbound',
                      subject: 'Thread',
                      sender_email: 'aisha@aishacrm.com',
                      sender_name: 'AiSHA',
                      received_at: '2026-03-15T12:00:00.000Z',
                      activity_id: 'activity-001',
                      metadata: { delivery: { state: 'queued' } },
                    },
                  ],
                  error: null,
                  count: 1,
                }),
              );
            }

            if (table === 'communications_entity_links') {
              return Promise.resolve(
                resolve({
                  data: [
                    {
                      thread_id: 'thread-001',
                      entity_type: 'activity',
                      entity_id: 'activity-001',
                      link_scope: 'thread',
                      source: 'activity_attachment',
                      confidence: 1,
                    },
                  ],
                  error: null,
                  count: 1,
                }),
              );
            }

            if (table === 'activities') {
              return Promise.resolve(
                resolve({
                  data: [
                    {
                      id: 'activity-001',
                      tenant_id: 'tenant-1',
                      type: 'email',
                      subject: 'Thread',
                      status: 'queued',
                      due_date: null,
                      due_time: null,
                      related_to: 'lead',
                      related_id: 'lead-001',
                      metadata: {},
                      created_date: '2026-03-15T12:00:00.000Z',
                      updated_at: '2026-03-15T12:00:00.000Z',
                    },
                  ],
                  error: null,
                  count: 1,
                }),
              );
            }

            throw new Error(`Unexpected table ${table}`);
          } catch (error) {
            if (reject) return Promise.resolve(reject(error));
            throw error;
          }
        },
      };
    },
  };

  const result = await listCommunicationsThreads(
    {
      tenantId: 'tenant-1',
      limit: 10,
      offset: 0,
    },
    { supabase },
  );

  assert.equal(result.threads.length, 1);
  assert.ok(activitiesSelect);
  assert.equal(activitiesSelect.includes('activity_type'), false);
  assert.equal(result.threads[0].linked_activities[0].type, 'email');
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
    activity_id: 'activity-latest',
    metadata: {
      delivery: { state: 'delivered' },
    },
    created_at: '2026-03-15T12:00:00.000Z',
    updated_at: '2026-03-15T12:00:00.000Z',
  };

  const activityRows = [
    {
      id: 'activity-latest',
      tenant_id: 'tenant-1',
      type: 'email',
      activity_type: 'email',
      subject: 'Thread',
      status: 'sent',
      due_date: '2026-03-15T12:00:00.000Z',
      due_time: null,
      related_to: 'lead',
      related_id: 'lead-001',
      metadata: {},
      created_date: '2026-03-15T12:00:00.000Z',
      updated_at: '2026-03-15T12:00:00.000Z',
    },
  ];

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
        in(field, values) {
          state.filters.push({ field, values });
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
              return Promise.resolve(
                resolve({
                  data: [
                    {
                      thread_id: 'thread-001',
                      message_id: 'message-older',
                      entity_type: 'activity',
                      entity_id: 'activity-latest',
                      link_scope: 'activity',
                      source: 'activity_attachment',
                      confidence: 1,
                    },
                  ],
                  error: null,
                }),
              );
            }
            if (table === 'activities') {
              return Promise.resolve(resolve({ data: activityRows, error: null }));
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
  assert.equal(result.thread.linked_activities[0].id, 'activity-latest');
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].state.delivery.state, 'queued');
  assert.equal(result.messages[0].linked_activities[0].id, 'activity-latest');
});

function createLeadCaptureQueueSupabaseStub() {
  const queueRows = [
    {
      id: 'queue-001',
      tenant_id: 'tenant-1',
      thread_id: 'thread-001',
      message_id: 'message-001',
      mailbox_id: 'owner-primary',
      mailbox_address: 'owner@example.com',
      sender_email: 'prospect@example.com',
      sender_name: 'Prospect',
      sender_domain: 'example.com',
      subject: 'Interested in your services',
      normalized_subject: 'interested in your services',
      status: 'pending_review',
      reason: 'unknown_sender',
      metadata: {},
      created_at: '2026-03-15T12:00:00.000Z',
      updated_at: '2026-03-15T12:00:00.000Z',
    },
  ];

  const threadRows = [
    {
      id: 'thread-001',
      mailbox_id: 'owner-primary',
      mailbox_address: 'owner@example.com',
      subject: 'Interested in your services',
      normalized_subject: 'interested in your services',
      participants: [],
      status: 'open',
      first_message_at: '2026-03-15T12:00:00.000Z',
      last_message_at: '2026-03-15T12:00:00.000Z',
      metadata: {
        event_log: [{ type: 'delivery_reconciled' }],
      },
      created_at: '2026-03-15T12:00:00.000Z',
      updated_at: '2026-03-15T12:00:00.000Z',
    },
  ];

  const messageRows = [
    {
      id: 'message-001',
      thread_id: 'thread-001',
      internet_message_id: '<queue@example.com>',
      direction: 'inbound',
      subject: 'Interested in your services',
      sender_email: 'prospect@example.com',
      sender_name: 'Prospect',
      recipients: [],
      cc: [],
      bcc: [],
      received_at: '2026-03-15T12:00:00.000Z',
      text_body: 'I would love to learn more about your services.',
      html_body: '<p>I would love to learn more about your services.</p>',
      activity_id: null,
      metadata: {
        attachments: [{ filename: 'intro.pdf' }],
        delivery: { state: 'delivered' },
      },
      created_at: '2026-03-15T12:00:00.000Z',
      updated_at: '2026-03-15T12:00:00.000Z',
    },
  ];

  return {
    from(table) {
      const state = { filters: [], range: null };
      return {
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
          const rows = table === 'communications_lead_capture_queue' ? queueRows : [];
          const sliced = state.range ? rows.slice(start, end + 1) : rows;
          return Promise.resolve({ data: sliced, error: null, count: rows.length });
        },
        maybeSingle() {
          if (table === 'communications_lead_capture_queue') {
            const idFilter = state.filters.find((filter) => filter.field === 'id');
            return Promise.resolve({
              data: queueRows.find((row) => row.id === idFilter?.value) || null,
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve, reject) {
          try {
            if (table === 'communications_threads') {
              return Promise.resolve(resolve({ data: threadRows, error: null }));
            }
            if (table === 'communications_messages') {
              return Promise.resolve(resolve({ data: messageRows, error: null }));
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

test('listLeadCaptureQueue hydrates thread and message context', async () => {
  const result = await listLeadCaptureQueue(
    {
      tenantId: 'tenant-1',
      status: 'pending_review',
      limit: 25,
      offset: 0,
    },
    { supabase: createLeadCaptureQueueSupabaseStub() },
  );

  assert.equal(result.total, 1);
  assert.equal(result.queue_items.length, 1);
  assert.equal(result.queue_items[0].thread.id, 'thread-001');
  assert.equal(result.queue_items[0].message.id, 'message-001');
  assert.equal(result.queue_items[0].message.attachments[0].filename, 'intro.pdf');
  assert.equal(
    result.queue_items[0].message.text_body,
    'I would love to learn more about your services.',
  );
  assert.equal(
    result.queue_items[0].message.html_body,
    '<p>I would love to learn more about your services.</p>',
  );
});

test('getLeadCaptureQueueItem returns a hydrated queue item', async () => {
  const result = await getLeadCaptureQueueItem(
    {
      tenantId: 'tenant-1',
      queueItemId: 'queue-001',
    },
    { supabase: createLeadCaptureQueueSupabaseStub() },
  );

  assert.equal(result.id, 'queue-001');
  assert.equal(result.thread.subject, 'Interested in your services');
  assert.equal(result.message.state.delivery.state, 'delivered');
});
