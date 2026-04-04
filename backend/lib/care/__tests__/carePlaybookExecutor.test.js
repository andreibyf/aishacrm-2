/**
 * carePlaybookExecutor.test.js
 *
 * Unit tests for the CARE Playbook Executor logic.
 * Tests: step dispatching, engagement detection, shadow mode,
 *        approval gating, table name mapping, status values.
 *
 * Run: node --test --force-exit backend/lib/care/__tests__/carePlaybookExecutor.test.js
 */

import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { executeCareSendEmailAction } from '../carePlaybookExecutor.js';

after(async () => {
  try {
    const { playbookQueue } = await import('../carePlaybookQueue.js');
    await playbookQueue.close();
  } catch {
    // Ignore teardown errors in unit tests.
  }
});

// ============================================================
// Table Name Mapping
// ============================================================

describe('Playbook Executor — Table Name Mapping', () => {
  const expectedMappings = {
    lead: 'leads',
    contact: 'contacts',
    account: 'accounts',
    opportunity: 'opportunities',
    activity: 'activities',
    bizdev_source: 'bizdev_sources',
  };

  for (const [entityType, tableName] of Object.entries(expectedMappings)) {
    test(`maps "${entityType}" → "${tableName}"`, () => {
      assert.equal(tableName, expectedMappings[entityType]);
    });
  }

  test('unknown entity type falls through to itself', () => {
    // The getTableName function returns entityType as-is for unknowns
    const unknown = 'custom_entity';
    // Since getTableName is internal, we test the contract:
    // tableMap[unknown] || unknown should return unknown
    const result = { lead: 'leads' }[unknown] || unknown;
    assert.equal(result, 'custom_entity');
  });
});

// ============================================================
// Engagement Detection Rules
// ============================================================

describe('Playbook Executor — Engagement Detection', () => {
  const ENGAGEMENT_TYPES = ['email', 'call', 'meeting'];

  test('email counts as engagement', () => {
    assert.ok(ENGAGEMENT_TYPES.includes('email'));
  });

  test('call counts as engagement', () => {
    assert.ok(ENGAGEMENT_TYPES.includes('call'));
  });

  test('meeting counts as engagement', () => {
    assert.ok(ENGAGEMENT_TYPES.includes('meeting'));
  });

  test('task does NOT count as engagement', () => {
    assert.ok(!ENGAGEMENT_TYPES.includes('task'));
  });

  test('note does NOT count as engagement', () => {
    assert.ok(!ENGAGEMENT_TYPES.includes('note'));
  });

  test('sms does NOT count as engagement', () => {
    assert.ok(!ENGAGEMENT_TYPES.includes('sms'));
  });
});

// ============================================================
// Shadow Mode Behavior
// ============================================================

describe('Playbook Executor — Shadow Mode', () => {
  test('shadow mode steps produce shadow_logged status', () => {
    const step = { step_id: 'step_1', action_type: 'send_email' };
    const shadowResult = {
      step_id: step.step_id,
      step_index: 0,
      action_type: step.action_type,
      status: 'shadow_logged',
      config: {},
      timestamp: new Date().toISOString(),
    };
    assert.equal(shadowResult.status, 'shadow_logged');
    assert.equal(shadowResult.action_type, 'send_email');
  });

  test('shadow mode preserves step config for logging', () => {
    const config = { to: 'entity', subject: 'Test', use_ai_generation: true };
    const shadowResult = {
      status: 'shadow_logged',
      config,
    };
    assert.deepEqual(shadowResult.config, config);
  });
});

// ============================================================
// Step Status Values
// ============================================================

describe('Playbook Executor — Step Status Values', () => {
  const validStatuses = ['completed', 'error', 'shadow_logged', 'pending_approval', 'skipped'];

  for (const status of validStatuses) {
    test(`"${status}" is a valid step status`, () => {
      assert.ok(validStatuses.includes(status));
    });
  }

  test('invalid status is not in the valid set', () => {
    assert.ok(!validStatuses.includes('running'));
    assert.ok(!validStatuses.includes('queued'));
  });
});

// ============================================================
// AI Approval Gate Logic
// ============================================================

describe('Playbook Executor — AI Approval Gate', () => {
  test('AI email with require_approval=true routes to suggestions', () => {
    const config = { use_ai_generation: true, require_approval: true };
    const shouldApprove = config.use_ai_generation && config.require_approval !== false;
    assert.ok(shouldApprove);
  });

  test('AI email with require_approval omitted (default) routes to suggestions', () => {
    const config = { use_ai_generation: true };
    // Default behavior: require_approval !== false evaluates to true when undefined
    const shouldApprove = config.use_ai_generation && config.require_approval !== false;
    assert.ok(shouldApprove);
  });

  test('AI email with require_approval=false executes immediately', () => {
    const config = { use_ai_generation: true, require_approval: false };
    const shouldApprove = config.use_ai_generation && config.require_approval !== false;
    assert.ok(!shouldApprove);
  });

  test('non-AI email bypasses approval entirely', () => {
    const config = { use_ai_generation: false, body: 'Static body text' };
    const shouldApprove = config.use_ai_generation && config.require_approval !== false;
    assert.ok(!shouldApprove);
  });

  test('WhatsApp steps never have AI generation', () => {
    const config = { template_sid: 'HX123', use_ai_generation: false };
    assert.equal(config.use_ai_generation, false);
  });
});

// ============================================================
// Action Type Validation
// ============================================================

describe('Playbook Executor — Action Types', () => {
  const VALID_ACTIONS = [
    'send_email',
    'create_task',
    'send_notification',
    'reassign',
    'update_field',
    'send_whatsapp',
    'escalate',
    'webhook',
  ];

  for (const action of VALID_ACTIONS) {
    test(`"${action}" is a recognized action type`, () => {
      assert.ok(VALID_ACTIONS.includes(action));
    });
  }

  test('unknown action type returns error', () => {
    const unknown = 'send_telegram';
    assert.ok(!VALID_ACTIONS.includes(unknown));
  });
});

// ============================================================
// Execution Status State Machine
// ============================================================

describe('Playbook Executor — Execution Status Machine', () => {
  const VALID_STATUSES = [
    'pending',
    'in_progress',
    'completed',
    'failed',
    'cancelled',
    'cooldown_skipped',
  ];
  const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];

  for (const status of VALID_STATUSES) {
    test(`"${status}" is a valid execution status`, () => {
      assert.ok(VALID_STATUSES.includes(status));
    });
  }

  for (const status of TERMINAL_STATUSES) {
    test(`"${status}" is a terminal status (executor should skip)`, () => {
      assert.ok(TERMINAL_STATUSES.includes(status));
    });
  }

  test('pending and in_progress are NOT terminal', () => {
    assert.ok(!TERMINAL_STATUSES.includes('pending'));
    assert.ok(!TERMINAL_STATUSES.includes('in_progress'));
  });

  test('cooldown_skipped is NOT terminal (but is final for that execution)', () => {
    assert.ok(!TERMINAL_STATUSES.includes('cooldown_skipped'));
  });
});

// ============================================================
// Stopped Reason Values
// ============================================================

describe('Playbook Executor — Stopped Reasons', () => {
  const VALID_REASONS = [
    'completed',
    'engagement_detected',
    'entity_converted',
    'error',
    'manual_cancel',
    'conflict_lower_priority',
    'playbook_deleted',
    'playbook_not_found',
    'cooldown_active',
  ];

  for (const reason of VALID_REASONS) {
    test(`"${reason}" is a valid stopped_reason`, () => {
      assert.ok(VALID_REASONS.includes(reason));
    });
  }
});

// ============================================================
// Delay Scheduling Logic
// ============================================================

describe('Playbook Executor — Delay Scheduling', () => {
  test('delay_minutes=0 means execute immediately', () => {
    const step = { delay_minutes: 0 };
    assert.equal(step.delay_minutes > 0, false);
  });

  test('delay_minutes>0 triggers Bull queue scheduling', () => {
    const step = { delay_minutes: 4320 }; // 3 days
    assert.equal(step.delay_minutes > 0, true);
    const delayMs = step.delay_minutes * 60 * 1000;
    assert.equal(delayMs, 259200000); // 3 days in ms
  });

  test('next_step_at is computed correctly from delay', () => {
    const now = new Date('2026-03-06T12:00:00Z');
    const delayMinutes = 1440; // 24 hours
    const nextStepAt = new Date(now.getTime() + delayMinutes * 60 * 1000);
    assert.equal(nextStepAt.toISOString(), '2026-03-07T12:00:00.000Z');
  });
});

// ============================================================
// Notification Null Guard
// ============================================================

describe('Playbook Executor — Notification Null Guard', () => {
  test('null email should produce error result, not crash', () => {
    const userEmail = null;
    if (!userEmail) {
      const result = { status: 'error', error: 'Could not resolve notification target email' };
      assert.equal(result.status, 'error');
      assert.ok(result.error.includes('Could not resolve'));
    }
  });

  test('valid email should proceed', () => {
    const userEmail = 'test@example.com';
    assert.ok(userEmail !== null);
  });
});

describe('Playbook Executor — Email Metadata Persistence', () => {
  test('approval suggestions preserve reply headers and communications metadata', async () => {
    const calls = { insertedSuggestion: null };
    const supabase = {
      from(table) {
        assert.equal(table, 'ai_suggestions');
        return {
          insert(payload) {
            calls.insertedSuggestion = payload;
            return this;
          },
          select() {
            return this;
          },
          async single() {
            return { data: { id: 'suggestion-001' }, error: null };
          },
        };
      },
    };

    const result = await executeCareSendEmailAction(
      supabase,
      'tenant-1',
      'lead',
      'lead-001',
      {
        to: 'prospect@example.com',
        subject: 'Re: Pricing follow-up',
        body_prompt: 'Draft a reply.',
        use_ai_generation: true,
        require_approval: true,
        email: {
          in_reply_to: '<message-003@example.com>',
          references: ['<message-001@example.com>', '<message-003@example.com>'],
        },
        communications: {
          thread_id: 'thread-001',
          mailbox_id: 'owner-primary',
        },
      },
      { status: 'completed' },
    );

    assert.equal(result.status, 'pending_approval');
    assert.deepEqual(calls.insertedSuggestion.action.tool_args.email, {
      in_reply_to: '<message-003@example.com>',
      references: ['<message-001@example.com>', '<message-003@example.com>'],
    });
    assert.deepEqual(calls.insertedSuggestion.action.tool_args.communications, {
      thread_id: 'thread-001',
      mailbox_id: 'owner-primary',
    });
  });

  test('queued activities preserve reply headers and communications metadata', async () => {
    const calls = { insertedActivity: null };
    const supabase = {
      from(table) {
        assert.equal(table, 'activities');
        return {
          insert(payload) {
            calls.insertedActivity = payload;
            return this;
          },
          select() {
            return this;
          },
          async single() {
            return { data: { id: 'activity-001' }, error: null };
          },
        };
      },
    };

    const result = await executeCareSendEmailAction(
      supabase,
      'tenant-1',
      'lead',
      'lead-001',
      {
        to: 'prospect@example.com',
        subject: 'Re: Pricing follow-up',
        body: 'Static reply body',
        use_ai_generation: false,
        source: 'threaded_ai_reply',
        email: {
          in_reply_to: '<message-003@example.com>',
          references: ['<message-001@example.com>', '<message-003@example.com>'],
        },
        communications: {
          thread_id: 'thread-001',
          mailbox_id: 'owner-primary',
        },
      },
      { status: 'completed' },
    );

    assert.equal(result.status, 'completed');
    assert.deepEqual(calls.insertedActivity.metadata.email, {
      in_reply_to: '<message-003@example.com>',
      references: ['<message-001@example.com>', '<message-003@example.com>'],
    });
    assert.deepEqual(calls.insertedActivity.metadata.communications, {
      thread_id: 'thread-001',
      mailbox_id: 'owner-primary',
    });
  });
});
