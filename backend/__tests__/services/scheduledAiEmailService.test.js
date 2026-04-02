import test from 'node:test';
import assert from 'node:assert/strict';

import { generateScheduledAiEmailDraft } from '../../services/scheduledAiEmailService.js';

function createSupabaseStub({
  activityOverrides = {},
  relatedEntities = {},
  notes = [],
  links = [],
  messages = [],
} = {}) {
  const calls = {
    executeSendEmailAction: [],
    updatedActivity: null,
    tableQueries: [],
    notifications: [],
  };

  const activityRecord = {
    id: 'activity-001',
    tenant_id: 'tenant-1',
    type: 'scheduled_ai_email',
    subject: 'Follow up from intro call',
    related_to: 'lead',
    related_id: 'lead-001',
    related_email: 'prospect@example.com',
    metadata: {},
    ai_email_config: {
      subject_template: 'Follow up from intro call',
      body_prompt: 'Draft a concise follow-up email.',
      require_approval: true,
    },
    ...activityOverrides,
  };

  const updatedActivity = {
    ...activityRecord,
    metadata: {},
  };

  const activitiesTable = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    update(payload) {
      calls.updatedActivity = payload;
      return this;
    },
    async maybeSingle() {
      return {
        data: activityRecord,
        error: null,
      };
    },
    async single() {
      return {
        data: {
          ...updatedActivity,
          metadata: calls.updatedActivity.metadata,
        },
        error: null,
      };
    },
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
      if (table === 'activities') return activitiesTable;
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

test('generateScheduledAiEmailDraft routes scheduled activities into CARE approval flow', async () => {
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
    notes: [
      {
        id: 'note-001',
        title: 'Discovery',
        content: 'Prospect asked for pricing and implementation timing.',
      },
    ],
    links: [
      {
        thread_id: 'thread-001',
        message_id: 'message-001',
      },
    ],
    messages: [
      {
        id: 'message-001',
        thread_id: 'thread-001',
        direction: 'inbound',
        subject: 'Intro call',
        sender_email: 'prospect@example.com',
        text_body: 'Please send the implementation details.',
      },
    ],
  });

  const result = await generateScheduledAiEmailDraft(
    {
      tenantId: 'tenant-1',
      activityId: 'activity-001',
      user: { id: 'user-1', email: 'owner@example.com' },
    },
    {
      supabase,
      executeSendEmailAction: async (...args) => {
        supabase.calls.executeSendEmailAction.push(args);
        return {
          status: 'pending_approval',
          suggestion_id: 'suggestion-001',
          tokens: 42,
        };
      },
    },
  );

  assert.equal(supabase.calls.executeSendEmailAction.length, 1);
  const config = supabase.calls.executeSendEmailAction[0][4];
  assert.equal(config.to, 'prospect@example.com');
  assert.equal(config.source, 'scheduled_ai_email');
  assert.equal(config.require_approval, true);
  assert.match(config.body_prompt, /Recent notes:/);
  assert.match(config.body_prompt, /Recent email context:/);
  assert.equal(result.generation_result.status, 'pending_approval');
  assert.equal(result.activity.metadata.ai_email_generation.suggestion_id, 'suggestion-001');
  assert.equal(supabase.calls.notifications.length, 1);
  assert.equal(supabase.calls.notifications[0].user_email, 'owner@example.com');
  assert.equal(supabase.calls.notifications[0].title, 'AI email draft ready for approval');
  assert.equal(supabase.calls.notifications[0].metadata.suggestion_id, 'suggestion-001');
});

test('generateScheduledAiEmailDraft supports immediate queued email generation when approval is disabled', async () => {
  const supabase = createSupabaseStub({
    activityOverrides: {
      ai_email_config: {
        subject_template: 'Next steps',
        body_prompt: 'Write a short next-steps email.',
        require_approval: false,
      },
    },
  });

  const result = await generateScheduledAiEmailDraft(
    {
      tenantId: 'tenant-1',
      activityId: 'activity-001',
      user: { id: 'user-1', email: 'owner@example.com' },
    },
    {
      supabase,
      executeSendEmailAction: async (...args) => {
        supabase.calls.executeSendEmailAction.push(args);
        return {
          status: 'completed',
          activity_id: 'email-activity-001',
          tokens: 18,
        };
      },
    },
  );

  const config = supabase.calls.executeSendEmailAction[0][4];
  assert.equal(config.require_approval, false);
  assert.equal(result.generation_result.activity_id, 'email-activity-001');
  assert.equal(
    result.activity.metadata.ai_email_generation.generated_activity_id,
    'email-activity-001',
  );
  assert.equal(supabase.calls.notifications.length, 1);
  assert.equal(supabase.calls.notifications[0].title, 'AI email draft generated');
  assert.equal(
    supabase.calls.notifications[0].metadata.generated_activity_id,
    'email-activity-001',
  );
});

test('generateScheduledAiEmailDraft scopes related entity lookups by tenant', async () => {
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
  });

  await generateScheduledAiEmailDraft(
    {
      tenantId: 'tenant-1',
      activityId: 'activity-001',
      user: { id: 'user-1', email: 'owner@example.com' },
    },
    {
      supabase,
      executeSendEmailAction: async () => ({
        status: 'pending_approval',
        suggestion_id: 'suggestion-tenant',
      }),
    },
  );

  assert.deepEqual(
    supabase.calls.tableQueries.filter((entry) => entry.table === 'leads' && entry.action === 'eq'),
    [
      { table: 'leads', action: 'eq', field: 'tenant_id', value: 'tenant-1' },
      { table: 'leads', action: 'eq', field: 'id', value: 'lead-001' },
    ],
  );
});

test('generateScheduledAiEmailDraft resolves opportunity recipients from linked contact records', async () => {
  const supabase = createSupabaseStub({
    activityOverrides: {
      related_to: 'opportunity',
      related_id: 'opp-001',
      related_email: null,
    },
    relatedEntities: {
      opportunities: {
        id: 'opp-001',
        name: 'Big Deal',
        contact_id: 'contact-001',
        lead_id: null,
      },
      contacts: {
        id: 'contact-001',
        email: 'buyer@example.com',
      },
    },
  });

  const result = await generateScheduledAiEmailDraft(
    {
      tenantId: 'tenant-1',
      activityId: 'activity-001',
      user: { id: 'user-1', email: 'owner@example.com' },
    },
    {
      supabase,
      executeSendEmailAction: async (...args) => {
        supabase.calls.executeSendEmailAction.push(args);
        return {
          status: 'pending_approval',
          suggestion_id: 'suggestion-opportunity',
        };
      },
    },
  );

  const selects = supabase.calls.tableQueries.filter(
    (entry) => entry.table === 'opportunities' && entry.action === 'select',
  );
  assert.deepEqual(selects, [
    {
      table: 'opportunities',
      action: 'select',
      columns: 'id, name, contact_id, lead_id, assigned_to, assigned_to_name, assigned_to_team',
    },
  ]);
  assert.equal(supabase.calls.executeSendEmailAction[0][4].to, 'buyer@example.com');
  assert.equal(result.activity.metadata.ai_email_generation.recipient_email, 'buyer@example.com');
});
