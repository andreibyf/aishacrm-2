import test from 'node:test';
import assert from 'node:assert/strict';
import {
  replayCommunicationsThread,
  processSchedulingReplyEvent,
  setCommunicationsEventDependenciesForTests,
} from '../../services/communicationsEventService.js';

function createSupabaseStub({ activity = null }) {
  const updates = {
    activity: null,
    thread: null,
    message: null,
  };

  const activitiesTable = {
    select() {
      return this;
    },
    eq(field, value) {
      this.filters = this.filters || {};
      this.filters[field] = value;
      return this;
    },
    async maybeSingle() {
      return { data: activity, error: null };
    },
    update(payload) {
      updates.activity = payload;
      return this;
    },
    async single() {
      return {
        data: {
          id: activity?.id || 'activity-meeting-001',
          tenant_id: 'tenant-1',
          type: 'meeting',
          status: 'scheduled',
          metadata: updates.activity?.metadata || activity?.metadata || {},
        },
        error: null,
      };
    },
  };

  const threadTable = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return {
        data: {
          id: 'thread-001',
          metadata: {},
        },
        error: null,
      };
    },
    update(payload) {
      updates.thread = payload;
      return this;
    },
    async single() {
      return {
        data: {
          id: 'thread-001',
          metadata: updates.thread?.metadata || {},
        },
        error: null,
      };
    },
  };

  const messageTable = {
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
      return this;
    },
    async maybeSingle() {
      return {
        data: {
          id: 'message-001',
          thread_id: 'thread-001',
          metadata: {},
        },
        error: null,
      };
    },
    async then(resolve) {
      return resolve({
        data: [{ id: 'message-001' }],
        error: null,
      });
    },
    update(payload) {
      updates.message = payload;
      return this;
    },
    async single() {
      return {
        data: {
          id: 'message-001',
          thread_id: 'thread-001',
          metadata: updates.message?.metadata || {},
        },
        error: null,
      };
    },
  };

  return {
    updates,
    client: {
      from(table) {
        if (table === 'activities') return activitiesTable;
        if (table === 'communications_threads') return threadTable;
        if (table === 'communications_messages') return messageTable;
        throw new Error(`Unexpected table ${table}`);
      },
    },
  };
}

test('processSchedulingReplyEvent updates the linked meeting activity metadata', async () => {
  const supabase = createSupabaseStub({
    activity: {
      id: 'activity-meeting-001',
      tenant_id: 'tenant-1',
      type: 'meeting',
      status: 'scheduled',
      metadata: {
        meeting: {
          invite_id: 'invite-001',
          replies: [],
        },
        communications: {
          thread_id: 'thread-001',
        },
      },
    },
  });

  setCommunicationsEventDependenciesForTests({
    getSupabaseClient: () => supabase.client,
  });

  const result = await processSchedulingReplyEvent({
    tenant_id: 'tenant-1',
    payload: {
      thread_id: 'thread-001',
      invite_id: 'invite-001',
      attendee_email: 'prospect@example.com',
      reply_state_hint: 'accepted',
      reply_message: 'See you then',
    },
  });

  assert.equal(result.result.processing_status, 'meeting_reply_processed');
  assert.equal(result.result.activity_id, 'activity-meeting-001');
  assert.equal(supabase.updates.activity.metadata.meeting.reply_state, 'accepted');
  assert.equal(
    supabase.updates.activity.metadata.meeting.replies[0].attendee_email,
    'prospect@example.com',
  );
  assert.equal(supabase.updates.thread.metadata.meeting.activity_id, 'activity-meeting-001');
  assert.equal(supabase.updates.message.metadata.meeting.activity_id, 'activity-meeting-001');
  assert.equal(supabase.updates.thread.metadata.event_log[0].type, 'meeting_reply_processed');
  assert.equal(supabase.updates.message.metadata.event_log[0].reply_state, 'accepted');

  setCommunicationsEventDependenciesForTests(null);
});

test('processSchedulingReplyEvent routes unresolved replies to review state', async () => {
  const supabase = createSupabaseStub({ activity: null });

  setCommunicationsEventDependenciesForTests({
    getSupabaseClient: () => supabase.client,
  });

  const result = await processSchedulingReplyEvent({
    tenant_id: 'tenant-1',
    payload: {
      thread_id: 'thread-001',
      invite_id: 'invite-missing',
      attendee_email: 'prospect@example.com',
      reply_state_hint: 'declined',
    },
  });

  assert.equal(result.result.processing_status, 'meeting_reply_review_required');
  assert.equal(result.result.activity_id, null);
  assert.equal(supabase.updates.thread.metadata.meeting.review_required, true);
  assert.equal(supabase.updates.message.metadata.meeting.review_required, true);
  assert.equal(supabase.updates.thread.metadata.event_log[0].review_required, true);

  setCommunicationsEventDependenciesForTests(null);
});

test('replayCommunicationsThread appends a replay event to thread metadata', async () => {
  const supabase = createSupabaseStub({ activity: null });

  setCommunicationsEventDependenciesForTests({
    getSupabaseClient: () => supabase.client,
  });

  const result = await replayCommunicationsThread({
    tenant_id: 'tenant-1',
    source_service: 'communications-ui',
    payload: {
      thread_id: 'thread-001',
      replay_job_id: 'replay-001',
      replay_reason: 'operator_requested',
      original_event_type: 'communications.inbound.received',
    },
    user: {
      email: 'owner@example.com',
    },
  });

  assert.equal(result.result.processing_status, 'replay_requested');
  assert.equal(supabase.updates.thread.metadata.replay.replay_job_id, 'replay-001');
  assert.equal(supabase.updates.thread.metadata.event_log[0].type, 'thread_replay_requested');
  assert.equal(supabase.updates.thread.metadata.event_log[0].actor, 'owner@example.com');

  setCommunicationsEventDependenciesForTests(null);
});
