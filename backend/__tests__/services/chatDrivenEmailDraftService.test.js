import test from 'node:test';
import assert from 'node:assert/strict';

import { generateChatDrivenEmailDraft } from '../../services/chatDrivenEmailDraftService.js';

function createSupabaseStub({ relatedEntities = {}, notes = [], links = [], messages = [] } = {}) {
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

  const linksTable = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    limit() {
      return Promise.resolve({ data: links, error: null });
    },
  };

  const messagesTable = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    in() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return Promise.resolve({ data: messages, error: null });
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
      if (table === 'communications_entity_links') return linksTable;
      if (table === 'communications_messages') return messagesTable;
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

test('generateChatDrivenEmailDraft routes chat prompts into CARE approval flow', async () => {
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
    notes: [{ id: 'note-1', title: 'Discovery', content: 'Asked for pricing.' }],
    links: [{ thread_id: 'thread-1', message_id: 'msg-1' }],
    messages: [
      {
        id: 'msg-1',
        thread_id: 'thread-1',
        direction: 'inbound',
        subject: 'Pricing details',
        sender_email: 'prospect@example.com',
        text_body: 'Can you send pricing?',
      },
    ],
  });

  const result = await generateChatDrivenEmailDraft(
    {
      tenantId: 'tenant-1',
      entityType: 'lead',
      entityId: 'lead-001',
      prompt: 'Draft a short pricing follow-up.',
      conversationId: 'conv-1',
      user: { id: 'user-1', email: 'owner@example.com', first_name: 'Andrei' },
    },
    {
      supabase,
      executeSendEmailAction: async (...args) => {
        supabase.calls.executeSendEmailAction.push(args);
        return {
          status: 'pending_approval',
          suggestion_id: 'suggestion-chat-001',
        };
      },
    },
  );

  assert.equal(supabase.calls.executeSendEmailAction.length, 1);
  const config = supabase.calls.executeSendEmailAction[0][4];
  assert.equal(config.to, 'prospect@example.com');
  assert.equal(config.source, 'chat_ai_email');
  assert.equal(config.require_approval, true);
  assert.match(config.body_prompt, /Recent notes:/);
  assert.equal(result.generation_result.suggestion_id, 'suggestion-chat-001');
  assert.equal(supabase.calls.notifications.length, 1);
  assert.equal(supabase.calls.notifications[0].title, 'AI email draft ready for approval');
});

test('generateChatDrivenEmailDraft supports immediate queued generation', async () => {
  const supabase = createSupabaseStub({
    relatedEntities: {
      contacts: {
        id: 'contact-001',
        first_name: 'Buyer',
        last_name: 'Person',
        company: 'Example Co',
        email: 'buyer@example.com',
      },
    },
  });

  const result = await generateChatDrivenEmailDraft(
    {
      tenantId: 'tenant-1',
      entityType: 'contact',
      entityId: 'contact-001',
      prompt: 'Draft a quick next-steps note.',
      requireApproval: false,
      user: { id: 'user-1', email: 'owner@example.com', first_name: 'Andrei' },
    },
    {
      supabase,
      executeSendEmailAction: async (...args) => {
        supabase.calls.executeSendEmailAction.push(args);
        return {
          status: 'completed',
          activity_id: 'email-activity-001',
        };
      },
    },
  );

  assert.equal(supabase.calls.executeSendEmailAction[0][4].require_approval, false);
  assert.equal(result.generation_result.activity_id, 'email-activity-001');
  assert.equal(supabase.calls.notifications.length, 1);
  assert.equal(supabase.calls.notifications[0].title, 'AI email draft generated');
});
