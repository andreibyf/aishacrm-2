import test from 'node:test';
import assert from 'node:assert/strict';

import { generateTemplateDrivenEmailDraft } from '../../services/templateEmailDraftService.js';

function createSupabaseStub({
  template = null,
  relatedEntities = {},
  notes = [],
  links = [],
  messages = [],
} = {}) {
  const calls = {
    executeSendEmailAction: [],
    notifications: [],
    tableQueries: [],
    rpcCalls: [],
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

  const emailTemplateTable = {
    select() { return this; },
    or() { return this; },
    eq() { return this; },
    async maybeSingle() {
      return { data: template, error: null };
    },
  };

  return {
    calls,
    from(table) {
      if (table === 'email_template') return emailTemplateTable;
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
    rpc(name, params) {
      calls.rpcCalls.push({ name, params });
      return Promise.resolve({ data: null, error: null });
    },
  };
}

function createExecuteSendEmailAction(calls) {
  return async (_supabase, _tenantId, _entityType, _entityId, emailPayload, _genMeta) => {
    calls.executeSendEmailAction.push(emailPayload);
    return {
      status: emailPayload.require_approval ? 'pending_approval' : 'completed',
      suggestion_id: 'suggestion-001',
      activity_id: 'activity-001',
      tokens: 42,
    };
  };
}

const TEMPLATE = {
  id: 'tpl-001',
  tenant_id: null,
  name: 'Professional Follow-Up',
  description: 'A follow-up email after a meeting',
  category: 'follow_up',
  subject_template: 'Following up on our conversation, {{first_name}}',
  body_prompt:
    'Write a professional follow-up email to {{first_name}} at {{company}}. Topic: {{meeting_topic}}. Tone: warm but professional.',
  entity_types: ['lead', 'contact'],
  variables: [
    { name: 'meeting_topic', type: 'text', description: 'Meeting topic', required: false, default: 'our recent discussion' },
  ],
  is_system: true,
  is_active: true,
  usage_count: 5,
};

const ENTITY = {
  id: 'lead-001',
  first_name: 'Alice',
  last_name: 'Smith',
  company: 'Acme Corp',
  email: 'alice@acme.com',
};

test('generates email draft from template with variable substitution', async () => {
  const supabase = createSupabaseStub({
    template: TEMPLATE,
    relatedEntities: { leads: ENTITY },
    notes: [{ id: 'n1', title: 'Call notes', content: 'Discussed pricing tiers.' }],
  });

  const result = await generateTemplateDrivenEmailDraft(
    {
      tenantId: 'tenant-001',
      templateId: 'tpl-001',
      entityType: 'lead',
      entityId: 'lead-001',
      variables: { meeting_topic: 'pricing discussion' },
      requireApproval: true,
      user: { id: 'user-001', first_name: 'Bob', last_name: 'Jones', email: 'bob@example.com' },
    },
    {
      supabase,
      executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
    },
  );

  assert.equal(result.recipient_email, 'alice@acme.com');
  assert.equal(result.subject, 'Following up on our conversation, Alice');
  assert.equal(result.template.id, 'tpl-001');
  assert.equal(result.template.name, 'Professional Follow-Up');
  assert.ok(result.response.includes('Professional Follow-Up'));
  assert.ok(result.response.includes('alice@acme.com'));
  assert.equal(result.generation_result.status, 'pending_approval');

  // Verify CARE was called with substituted prompt
  const emailPayload = supabase.calls.executeSendEmailAction[0];
  assert.ok(emailPayload.body_prompt.includes('Alice'));
  assert.ok(emailPayload.body_prompt.includes('Acme Corp'));
  assert.ok(emailPayload.body_prompt.includes('pricing discussion'));
  assert.equal(emailPayload.source, 'template_ai_email');
  assert.equal(emailPayload.activity_metadata.template_ai_email.template_id, 'tpl-001');
});

test('uses variable defaults when user does not provide a value', async () => {
  const supabase = createSupabaseStub({
    template: TEMPLATE,
    relatedEntities: { leads: ENTITY },
  });

  const result = await generateTemplateDrivenEmailDraft(
    {
      tenantId: 'tenant-001',
      templateId: 'tpl-001',
      entityType: 'lead',
      entityId: 'lead-001',
      variables: {}, // No user variables — should use default
      user: { id: 'user-001', first_name: 'Bob', last_name: 'Jones', email: 'bob@example.com' },
    },
    {
      supabase,
      executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
    },
  );

  const emailPayload = supabase.calls.executeSendEmailAction[0];
  // Default: "our recent discussion"
  assert.ok(emailPayload.body_prompt.includes('our recent discussion'));
});

test('rejects entity type not supported by template', async () => {
  const supabase = createSupabaseStub({
    template: TEMPLATE, // Only supports lead, contact
    relatedEntities: { accounts: { id: 'acc-001', name: 'Test Corp', email: 'test@corp.com' } },
  });

  await assert.rejects(
    () =>
      generateTemplateDrivenEmailDraft(
        {
          tenantId: 'tenant-001',
          templateId: 'tpl-001',
          entityType: 'account',
          entityId: 'acc-001',
          user: { id: 'user-001', email: 'bob@example.com' },
        },
        {
          supabase,
          executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
        },
      ),
    (err) => {
      assert.equal(err.code, 'template_entity_type_mismatch');
      return true;
    },
  );
});

test('rejects when template not found', async () => {
  const supabase = createSupabaseStub({ template: null });

  await assert.rejects(
    () =>
      generateTemplateDrivenEmailDraft(
        {
          tenantId: 'tenant-001',
          templateId: 'nonexistent',
          entityType: 'lead',
          entityId: 'lead-001',
          user: { id: 'user-001', email: 'bob@example.com' },
        },
        {
          supabase,
          executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
        },
      ),
    (err) => {
      assert.equal(err.code, 'template_not_found');
      return true;
    },
  );
});

test('rejects missing required variables', async () => {
  const templateWithRequired = {
    ...TEMPLATE,
    variables: [
      { name: 'deal_size', type: 'text', description: 'Deal size', required: true },
    ],
  };

  const supabase = createSupabaseStub({
    template: templateWithRequired,
    relatedEntities: { leads: ENTITY },
  });

  await assert.rejects(
    () =>
      generateTemplateDrivenEmailDraft(
        {
          tenantId: 'tenant-001',
          templateId: 'tpl-001',
          entityType: 'lead',
          entityId: 'lead-001',
          variables: {}, // Missing required 'deal_size'
          user: { id: 'user-001', email: 'bob@example.com' },
        },
        {
          supabase,
          executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
        },
      ),
    (err) => {
      assert.equal(err.code, 'template_variable_validation_failed');
      assert.ok(err.message.includes('deal_size'));
      return true;
    },
  );
});

test('includes additional prompt when provided', async () => {
  const supabase = createSupabaseStub({
    template: TEMPLATE,
    relatedEntities: { leads: ENTITY },
  });

  await generateTemplateDrivenEmailDraft(
    {
      tenantId: 'tenant-001',
      templateId: 'tpl-001',
      entityType: 'lead',
      entityId: 'lead-001',
      variables: {},
      additionalPrompt: 'Mention the holiday discount',
      user: { id: 'user-001', first_name: 'Bob', last_name: 'Jones', email: 'bob@example.com' },
    },
    {
      supabase,
      executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
    },
  );

  const emailPayload = supabase.calls.executeSendEmailAction[0];
  assert.ok(emailPayload.body_prompt.includes('Mention the holiday discount'));
});

test('auto-resolves CRM entity fields as variables (first_name, company, sender_name)', async () => {
  const supabase = createSupabaseStub({
    template: {
      ...TEMPLATE,
      entity_types: null, // Allow all
    },
    relatedEntities: { leads: ENTITY },
  });

  const result = await generateTemplateDrivenEmailDraft(
    {
      tenantId: 'tenant-001',
      templateId: 'tpl-001',
      entityType: 'lead',
      entityId: 'lead-001',
      variables: {},
      user: { id: 'user-001', first_name: 'Bob', last_name: 'Jones', email: 'bob@example.com' },
    },
    {
      supabase,
      executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
    },
  );

  // Subject uses auto-resolved {{first_name}} from CRM entity
  assert.equal(result.subject, 'Following up on our conversation, Alice');
  // Body prompt uses auto-resolved {{company}}
  const bodyPrompt = supabase.calls.executeSendEmailAction[0].body_prompt;
  assert.ok(bodyPrompt.includes('Acme Corp'));
});
