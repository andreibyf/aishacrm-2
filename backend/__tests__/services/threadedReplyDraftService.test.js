import test from 'node:test';
import assert from 'node:assert/strict';

import { generateThreadedReplyDraft } from '../../services/threadedReplyDraftService.js';

function createSupabaseStub({ relatedEntities = {}, notes = [] } = {}) {
  const calls = {
    executeSendEmailAction: [],
    notifications: [],
    tableQueries: [],
  };

  const notesTable = {
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
      return Promise.resolve({ data: notes, error: null });
    },
  };

  const notificationsTable = {
    insert(payload) {
      calls.notifications.push(payload);
      return this;
    },
    select() {
      return this;
    },
    async single() {
      return {
        data: { id: `notification-${calls.notifications.length}` },
        error: null,
      };
    },
  };

  return {
    calls,
    from(table) {
      if (table === 'note') return notesTable;
      if (table === 'notifications') return notificationsTable;
      if (['leads', 'contacts', 'accounts', 'opportunities', 'bizdev_sources'].includes(table)) {
        return {
          select(columns) {
            calls.tableQueries.push({ table, action: 'select', columns });
            return this;
          },
          eq(field, value) {
            calls.tableQueries.push({ table, action: 'eq', field, value });
            return this;
          },
          async maybeSingle() {
            return {
              data: relatedEntities[table] || null,
              error: null,
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

test('generateThreadedReplyDraft uses canonical thread history and preserves reply metadata', async () => {
  const supabase = createSupabaseStub({
    relatedEntities: {
      leads: {
        id: 'lead-001',
        first_name: 'Prospect',
        last_name: 'Person',
        company: 'Example Co',
        email: 'prospect@example.com',
      },
    },
    notes: [{ id: 'note-1', title: 'Pricing', content: 'Prospect asked about implementation.' }],
  });

  const result = await generateThreadedReplyDraft(
    {
      tenantId: 'tenant-1',
      threadId: 'thread-001',
      prompt: 'Reply with pricing and suggest next steps.',
      user: { id: 'user-1', email: 'owner@example.com' },
    },
    {
      supabase,
      getThreadMessages: async () => ({
        thread: {
          id: 'thread-001',
          mailbox_id: 'owner-primary',
          mailbox_address: 'owner@example.com',
          subject: 'Pricing follow-up',
          status: 'open',
          participants: [
            { email: 'owner@example.com', role: 'mailbox' },
            { email: 'prospect@example.com', role: 'sender' },
          ],
          linked_entities: [{ entity_type: 'lead', entity_id: 'lead-001' }],
        },
        messages: [
          {
            id: 'message-001',
            internet_message_id: '<message-001@example.com>',
            direction: 'inbound',
            subject: 'Pricing follow-up',
            sender_email: 'prospect@example.com',
            received_at: '2026-03-16T10:00:00.000Z',
            text_body: 'Can you send pricing and timeline details?',
          },
          {
            id: 'message-002',
            internet_message_id: '<message-002@example.com>',
            direction: 'outbound',
            subject: 'Re: Pricing follow-up',
            sender_email: 'owner@example.com',
            received_at: '2026-03-16T11:00:00.000Z',
            text_body: 'Sharing a quick overview now.',
          },
          {
            id: 'message-003',
            internet_message_id: '<message-003@example.com>',
            direction: 'inbound',
            subject: 'Re: Pricing follow-up',
            sender_email: 'prospect@example.com',
            received_at: '2026-03-16T12:00:00.000Z',
            text_body: 'Thanks, could you also include onboarding?',
          },
        ],
      }),
      executeSendEmailAction: async (...args) => {
        supabase.calls.executeSendEmailAction.push(args);
        return {
          status: 'pending_approval',
          suggestion_id: 'suggestion-thread-001',
        };
      },
    },
  );

  assert.equal(supabase.calls.executeSendEmailAction.length, 1);
  const config = supabase.calls.executeSendEmailAction[0][4];
  assert.equal(config.to, 'prospect@example.com');
  assert.equal(config.subject, 'Re: Pricing follow-up');
  assert.equal(config.source, 'threaded_ai_reply');
  assert.equal(config.require_approval, true);
  assert.equal(config.email.in_reply_to, '<message-003@example.com>');
  assert.deepEqual(config.email.references, [
    '<message-001@example.com>',
    '<message-002@example.com>',
    '<message-003@example.com>',
  ]);
  assert.equal(config.communications.thread_id, 'thread-001');
  assert.match(config.body_prompt, /Canonical thread history:/);
  assert.match(config.body_prompt, /Recent notes:/);
  assert.equal(result.generation_result.suggestion_id, 'suggestion-thread-001');
  assert.equal(supabase.calls.notifications.length, 1);
  assert.equal(supabase.calls.notifications[0].title, 'AI email draft ready for approval');
});

test('generateThreadedReplyDraft returns 404 when the thread does not exist', async () => {
  const supabase = createSupabaseStub();

  await assert.rejects(
    () =>
      generateThreadedReplyDraft(
        {
          tenantId: 'tenant-1',
          threadId: 'missing-thread',
          prompt: 'Reply politely.',
          user: { id: 'user-1', email: 'owner@example.com' },
        },
        {
          supabase,
          getThreadMessages: async () => null,
        },
      ),
    (error) => {
      assert.equal(error.code, 'threaded_ai_reply_thread_not_found');
      assert.equal(error.statusCode, 404);
      return true;
    },
  );
});
