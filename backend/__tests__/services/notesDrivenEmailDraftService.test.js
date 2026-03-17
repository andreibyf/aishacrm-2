import test from 'node:test';
import assert from 'node:assert/strict';

import { generateNotesDrivenEmailDraft } from '../../services/notesDrivenEmailDraftService.js';

function createSupabaseStub({
  relatedEntities = {},
  notesByIds = null,
  notesByEntity = [],
  links = [],
  messages = [],
} = {}) {
  const calls = {
    executeSendEmailAction: [],
    notifications: [],
    noteQueries: [],
  };

  // Note table needs to handle two query patterns:
  // 1. .in('id', noteIds)  — specific notes by ID
  // 2. .eq('related_type', ...).eq('related_id', ...) — recent notes for entity
  function createNoteChain(resolvedData) {
    let useInFilter = false;
    return {
      select() { return this; },
      eq() { return this; },
      in() { useInFilter = true; return this; },
      order() { return this; },
      limit() {
        return Promise.resolve({ data: resolvedData, error: null });
      },
      then(resolve) {
        // For .in() queries (no order/limit chain)
        return Promise.resolve({ data: resolvedData, error: null }).then(resolve);
      },
    };
  }

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

  // Track whether note query uses .in() to decide which dataset to return
  let noteInFilterUsed = false;

  return {
    calls,
    from(table) {
      if (table === 'note') {
        let inCalled = false;
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          in() {
            inCalled = true;
            calls.noteQueries.push('in');
            // .in() is the terminal — return a thenable with notesByIds
            const result = { data: notesByIds !== null ? notesByIds : notesByEntity, error: null };
            return {
              then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
            };
          },
          order() { return chain; },
          limit() {
            const resolved = notesByEntity;
            return Promise.resolve({ data: resolved, error: null });
          },
        };
        return chain;
      }
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
      suggestion_id: 'suggestion-notes-001',
      activity_id: 'gen-activity-001',
      tokens: 45,
    };
  };
}

const LEAD = {
  id: 'lead-001',
  first_name: 'Alice',
  last_name: 'Smith',
  company: 'Acme Corp',
  email: 'alice@acme.com',
};

const NOTES = [
  { id: 'note-1', title: 'Discovery Call', content: 'Discussed pricing tiers and timeline.', created_at: '2026-01-20T10:00:00Z' },
  { id: 'note-2', title: 'Follow Up', content: 'Needs proposal by Friday.', created_at: '2026-01-21T10:00:00Z' },
];

test('generateNotesDrivenEmailDraft creates email from specific notes', async () => {
  const supabase = createSupabaseStub({
    notesByIds: NOTES,
    relatedEntities: { leads: LEAD },
  });

  const result = await generateNotesDrivenEmailDraft(
    {
      tenantId: 'tenant-001',
      noteIds: ['note-1', 'note-2'],
      entityType: 'lead',
      entityId: 'lead-001',
      prompt: 'Draft a follow-up email.',
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
  assert.equal(payload.to, 'alice@acme.com');
  assert.equal(payload.source, 'notes_ai_email');
  assert.equal(payload.require_approval, true);

  // Prompt includes notes context
  assert.ok(payload.body_prompt.includes('Draft a follow-up email'));
  assert.ok(payload.body_prompt.includes('Discovery Call'));
  assert.ok(payload.body_prompt.includes('pricing tiers'));

  // Activity metadata
  assert.deepEqual(payload.activity_metadata.notes_ai_email.note_ids, ['note-1', 'note-2']);

  // Response
  assert.equal(result.recipient_email, 'alice@acme.com');
  assert.ok(result.response.includes('2 note(s)'));
  assert.equal(result.notes_used.length, 2);
  assert.equal(result.generation_result.status, 'pending_approval');

  // Notification
  assert.equal(supabase.calls.notifications.length, 1);
});

test('generateNotesDrivenEmailDraft falls back to recent entity notes when no IDs given', async () => {
  const supabase = createSupabaseStub({
    notesByEntity: NOTES,
    relatedEntities: { leads: LEAD },
  });

  const result = await generateNotesDrivenEmailDraft(
    {
      tenantId: 'tenant-001',
      entityType: 'lead',
      entityId: 'lead-001',
      user: { id: 'user-1', email: 'owner@example.com', first_name: 'Andrei' },
    },
    {
      supabase,
      executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
    },
  );

  assert.equal(result.notes_used.length, 2);
  assert.equal(result.recipient_email, 'alice@acme.com');
});

test('generateNotesDrivenEmailDraft uses single note title as default subject', async () => {
  const supabase = createSupabaseStub({
    notesByIds: [NOTES[0]],
    relatedEntities: { leads: LEAD },
  });

  const result = await generateNotesDrivenEmailDraft(
    {
      tenantId: 'tenant-001',
      noteIds: ['note-1'],
      entityType: 'lead',
      entityId: 'lead-001',
      user: { id: 'user-1', email: 'owner@example.com' },
    },
    {
      supabase,
      executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
    },
  );

  assert.equal(result.subject, 'Discovery Call');
});

test('generateNotesDrivenEmailDraft rejects when specified notes not found', async () => {
  const supabase = createSupabaseStub({
    notesByIds: [],
    relatedEntities: { leads: LEAD },
  });

  await assert.rejects(
    () =>
      generateNotesDrivenEmailDraft(
        {
          tenantId: 'tenant-001',
          noteIds: ['nonexistent'],
          entityType: 'lead',
          entityId: 'lead-001',
          user: { id: 'user-1', email: 'owner@example.com' },
        },
        {
          supabase,
          executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
        },
      ),
    (err) => {
      assert.equal(err.code, 'notes_email_notes_not_found');
      assert.equal(err.statusCode, 404);
      return true;
    },
  );
});

test('generateNotesDrivenEmailDraft rejects when entity has no notes', async () => {
  const supabase = createSupabaseStub({
    notesByEntity: [],
    relatedEntities: { leads: LEAD },
  });

  await assert.rejects(
    () =>
      generateNotesDrivenEmailDraft(
        {
          tenantId: 'tenant-001',
          entityType: 'lead',
          entityId: 'lead-001',
          user: { id: 'user-1', email: 'owner@example.com' },
        },
        {
          supabase,
          executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
        },
      ),
    (err) => {
      assert.equal(err.code, 'notes_email_no_notes');
      assert.equal(err.statusCode, 404);
      return true;
    },
  );
});

test('generateNotesDrivenEmailDraft rejects invalid entity type', async () => {
  const supabase = createSupabaseStub({
    notesByEntity: NOTES,
    relatedEntities: {},
  });

  await assert.rejects(
    () =>
      generateNotesDrivenEmailDraft(
        {
          tenantId: 'tenant-001',
          entityType: 'invalid_type',
          entityId: 'some-id',
          user: { id: 'user-1', email: 'owner@example.com' },
        },
        {
          supabase,
          executeSendEmailAction: createExecuteSendEmailAction(supabase.calls),
        },
      ),
    (err) => {
      assert.equal(err.code, 'notes_email_invalid_context');
      return true;
    },
  );
});
