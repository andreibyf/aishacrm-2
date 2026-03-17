import test from 'node:test';
import assert from 'node:assert/strict';

import { generateTaskEmailDraft } from '../../services/taskEmailDraftService.js';

function createSupabaseStub({
  activity = null,
  relatedEntities = {},
  notes = [],
  links = [],
  messages = [],
} = {}) {
  const calls = {
    executeSendEmailAction: [],
    notifications: [],
  };

  const activitiesTable = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() {
      return { data: activity, error: null };
    },
  };

  const notesTable = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    limit() { return Promise.resolve({ data: notes, error: null }); },
  };

  const linksTable = {
    select() { return this; },
    eq() { return this; },
    limit() { return Promise.resolve({ data: links, error: null }); },
  };

  const messagesTable = {
    select() { return this; },
    eq() { return this; },
    in() { return this; },
    order() { return this; },
    limit() { return Promise.resolve({ data: messages, error: null }); },
  };

  const notificationsTable = {
    insert(payload) { calls.notifications.push(payload); return this; },
    select() { return this; },
    async single() {
      return { data: { id: `notification-${calls.notifications.length}` }, error: null };
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
          select() { return this; },
          eq() { return this; },
          async maybeSingle() {
            return { data: relatedEntities[table] || null, error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function createExecuteSendEmailAction(calls) {
  return async (_supabase, _tenantId, _entityType, _entityId, emailPayload, _genMeta) => {
    calls.executeSendEmailAction.push(emailPayload);
    return {
      status: emailPayload.require_approval ? 'pending_approval' : 'completed',
      suggestion_id: 'suggestion-task-001',
      activity_id: 'gen-activity-001',
      tokens: 50,
    };
  };
}

const ACTIVITY = {
  id: 'activity-001',
  tenant_id: 'tenant-001',
  type: 'todo',
  subject: 'Send pricing proposal',
  body: null,
  description: 'Prepare and send the updated pricing proposal for Q1.',
  status: 'pending',
  priority: 'high',
  due_date: '2026-02-15',
  related_to: 'lead',
  related_id: 'lead-001',
  related_email: null,
  related_name: 'Prospect Person',
  contact_id: null,
  lead_id: 'lead-001',
  account_id: null,
  opportunity_id: null,
  activity_metadata: {},
};

const LEAD = {
  id: 'lead-001',
  first_name: 'Prospect',
  last_name: 'Person',
  company: 'Example Co',
  email: 'prospect@example.com',
};

test('generateTaskEmailDraft creates email from task context and routes through CARE', async () => {
  const supabase = createSupabaseStub({
    activity: ACTIVITY,
    relatedEntities: { leads: LEAD },
    notes: [{ id: 'note-1', title: 'Pricing', content: 'Standard tier $500/mo.' }],
  });

  const result = await generateTaskEmailDraft(
    {
      tenantId: 'tenant-001',
      activityId: 'activity-001',
      prompt: 'Draft a pricing proposal email.',
      conversationId: 'conv-1',
      user: { id: 'user-1', email: 'owner@example.com', first_name: 'Andrei' },
    },
    {
      supabase,
      executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
    },
  );

  // CARE was called
  assert.equal(supabase.calls.executeSendEmailAction.length, 1);
  const payload = supabase.calls.executeSendEmailAction[0];
  assert.equal(payload.to, 'prospect@example.com');
  assert.equal(payload.source, 'task_ai_email');
  assert.equal(payload.require_approval, true);

  // Prompt includes task context
  assert.ok(payload.body_prompt.includes('Draft a pricing proposal email'));
  assert.ok(payload.body_prompt.includes('Send pricing proposal'));
  assert.ok(payload.body_prompt.includes('high'));
  assert.ok(payload.body_prompt.includes('2026-02-15'));

  // Activity metadata
  assert.equal(payload.activity_metadata.task_ai_email.activity_id, 'activity-001');
  assert.equal(payload.activity_metadata.task_ai_email.activity_type, 'todo');

  // Response
  assert.equal(result.recipient_email, 'prospect@example.com');
  assert.ok(result.response.includes('Send pricing proposal'));
  assert.equal(result.activity.id, 'activity-001');
  assert.equal(result.generation_result.status, 'pending_approval');
  assert.ok(result.context_summary.has_task_context);

  // Notification
  assert.equal(supabase.calls.notifications.length, 1);
});

test('generateTaskEmailDraft uses activity subject as default email subject', async () => {
  const supabase = createSupabaseStub({
    activity: ACTIVITY,
    relatedEntities: { leads: LEAD },
  });

  const result = await generateTaskEmailDraft(
    {
      tenantId: 'tenant-001',
      activityId: 'activity-001',
      user: { id: 'user-1', email: 'owner@example.com' },
    },
    {
      supabase,
      executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
    },
  );

  assert.equal(result.subject, 'Send pricing proposal');
});

test('generateTaskEmailDraft rejects when activity not found', async () => {
  const supabase = createSupabaseStub({ activity: null });

  await assert.rejects(
    () =>
      generateTaskEmailDraft(
        {
          tenantId: 'tenant-001',
          activityId: 'nonexistent',
          user: { id: 'user-1', email: 'owner@example.com' },
        },
        {
          supabase,
          executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
        },
      ),
    (err) => {
      assert.equal(err.code, 'task_email_activity_not_found');
      assert.equal(err.statusCode, 404);
      return true;
    },
  );
});

test('generateTaskEmailDraft rejects when no recipient email', async () => {
  const activityNoEmail = {
    ...ACTIVITY,
    related_to: 'lead',
    related_id: 'lead-no-email',
  };

  const supabase = createSupabaseStub({
    activity: activityNoEmail,
    relatedEntities: {
      leads: { id: 'lead-no-email', first_name: 'No', last_name: 'Email', email: null },
    },
  });

  await assert.rejects(
    () =>
      generateTaskEmailDraft(
        {
          tenantId: 'tenant-001',
          activityId: 'activity-001',
          user: { id: 'user-1', email: 'owner@example.com' },
        },
        {
          supabase,
          executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
        },
      ),
    (err) => {
      assert.equal(err.code, 'task_email_missing_recipient');
      return true;
    },
  );
});

test('generateTaskEmailDraft resolves entity from FK fields when related_to is missing', async () => {
  const activityWithFk = {
    ...ACTIVITY,
    related_to: null,
    related_id: null,
    contact_id: 'contact-001',
    lead_id: null,
  };

  const supabase = createSupabaseStub({
    activity: activityWithFk,
    relatedEntities: {
      contacts: { id: 'contact-001', first_name: 'Jane', last_name: 'Doe', email: 'jane@corp.com' },
    },
  });

  const result = await generateTaskEmailDraft(
    {
      tenantId: 'tenant-001',
      activityId: 'activity-001',
      user: { id: 'user-1', email: 'owner@example.com', first_name: 'Andrei' },
    },
    {
      supabase,
      executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
    },
  );

  assert.equal(result.recipient_email, 'jane@corp.com');
});
