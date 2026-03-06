/**
 * carePlaybooks.routes.test.js
 *
 * Integration tests for /api/care-playbooks CRUD routes.
 * Tests: create, read, update, toggle, delete, validation, execution history.
 *
 * Run: node --test --force-exit backend/lib/care/__tests__/carePlaybooks.routes.test.js
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getSupabaseClient } from '../../../lib/supabase-db.js';

// Use a known test tenant — adjust to match your test data
const TEST_TENANT_ID = process.env.TEST_TENANT_ID || 'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';

// We'll test via Supabase directly since API routes need auth cookies.
// This validates the data layer that the routes operate on.
let supabase;
let createdPlaybookId = null;

describe('CARE Playbook Data Layer (route-equivalent tests)', () => {
  before(() => {
    supabase = getSupabaseClient();
  });

  after(async () => {
    // Cleanup: remove any test playbooks
    if (createdPlaybookId) {
      await supabase.from('care_playbook').delete().eq('id', createdPlaybookId);
    }
    // Also clean up by trigger_type in case ID wasn't captured
    await supabase
      .from('care_playbook')
      .delete()
      .eq('tenant_id', TEST_TENANT_ID)
      .eq('name', '__test_playbook__');

    // Close Bull queue Redis connection so Node can exit cleanly
    try {
      const { playbookQueue } = await import('../../../services/carePlaybookQueue.js');
      await playbookQueue.close();
    } catch (_) {
      /* queue may not be initialized */
    }
  });

  test('CREATE: insert a playbook with valid data', async () => {
    const { data, error } = await supabase
      .from('care_playbook')
      .insert({
        tenant_id: TEST_TENANT_ID,
        trigger_type: 'followup_needed',
        name: '__test_playbook__',
        description: 'Test playbook for automated testing',
        is_enabled: true,
        shadow_mode: true,
        priority: 50,
        execution_mode: 'native',
        steps: [
          {
            step_id: 'step_1',
            action_type: 'send_notification',
            delay_minutes: 0,
            config: { message: 'Test notification', target: 'owner', priority: 'normal' },
            stop_on_engagement: true,
          },
        ],
        cooldown_minutes: 60,
        max_executions_per_day: 10,
      })
      .select()
      .single();

    assert.equal(error, null, `Insert should succeed: ${error?.message}`);
    assert.ok(data.id, 'Should return UUID');
    assert.equal(data.trigger_type, 'followup_needed');
    assert.equal(data.name, '__test_playbook__');
    assert.equal(data.shadow_mode, true);
    assert.equal(data.priority, 50);
    assert.equal(data.steps.length, 1);
    assert.equal(data.steps[0].action_type, 'send_notification');

    createdPlaybookId = data.id;
  });

  test('READ: fetch playbook by ID', async () => {
    assert.ok(createdPlaybookId, 'Requires CREATE test to pass first');

    const { data, error } = await supabase
      .from('care_playbook')
      .select('*')
      .eq('id', createdPlaybookId)
      .eq('tenant_id', TEST_TENANT_ID)
      .single();

    assert.equal(error, null);
    assert.equal(data.name, '__test_playbook__');
  });

  test('READ: list playbooks for tenant', async () => {
    const { data, error } = await supabase
      .from('care_playbook')
      .select('*')
      .eq('tenant_id', TEST_TENANT_ID);

    assert.equal(error, null);
    assert.ok(Array.isArray(data));
    assert.ok(
      data.some((p) => p.id === createdPlaybookId),
      'Test playbook should be in list',
    );
  });

  test('UPDATE: modify playbook name and shadow_mode', async () => {
    assert.ok(createdPlaybookId, 'Requires CREATE test to pass first');

    const { data, error } = await supabase
      .from('care_playbook')
      .update({
        name: '__test_playbook_updated__',
        shadow_mode: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', createdPlaybookId)
      .eq('tenant_id', TEST_TENANT_ID)
      .select()
      .single();

    assert.equal(error, null);
    assert.equal(data.name, '__test_playbook_updated__');
    assert.equal(data.shadow_mode, false);
  });

  test('TOGGLE: flip is_enabled', async () => {
    assert.ok(createdPlaybookId, 'Requires CREATE test to pass first');

    // Read current
    const { data: before } = await supabase
      .from('care_playbook')
      .select('is_enabled')
      .eq('id', createdPlaybookId)
      .single();

    const newState = !before.is_enabled;

    const { data, error } = await supabase
      .from('care_playbook')
      .update({ is_enabled: newState, updated_at: new Date().toISOString() })
      .eq('id', createdPlaybookId)
      .select('is_enabled')
      .single();

    assert.equal(error, null);
    assert.equal(data.is_enabled, newState);
  });

  test('UNIQUE CONSTRAINT: cannot create duplicate trigger_type per tenant', async () => {
    assert.ok(createdPlaybookId, 'Requires CREATE test to pass first');

    const { error } = await supabase.from('care_playbook').insert({
      tenant_id: TEST_TENANT_ID,
      trigger_type: 'followup_needed', // same as existing
      name: '__test_duplicate__',
      execution_mode: 'native',
      steps: [],
    });

    assert.ok(error, 'Should fail with unique constraint');
    assert.equal(error.code, '23505', 'Should be unique violation');
  });

  test('EXECUTION: insert execution record', async () => {
    assert.ok(createdPlaybookId, 'Requires CREATE test to pass first');

    const { data, error } = await supabase
      .from('care_playbook_execution')
      .insert({
        tenant_id: TEST_TENANT_ID,
        playbook_id: createdPlaybookId,
        trigger_type: 'followup_needed',
        entity_type: 'lead',
        entity_id: '00000000-0000-0000-0000-000000000099',
        status: 'completed',
        total_steps: 1,
        step_results: [
          {
            step_id: 'step_1',
            status: 'shadow_logged',
            action_type: 'send_notification',
            timestamp: new Date().toISOString(),
          },
        ],
        stopped_reason: 'completed',
        shadow_mode: true,
        tokens_used: 0,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    assert.equal(error, null, `Execution insert should succeed: ${error?.message}`);
    assert.equal(data.status, 'completed');
    assert.equal(data.total_steps, 1);
    assert.equal(data.step_results.length, 1);

    // Cleanup
    await supabase.from('care_playbook_execution').delete().eq('id', data.id);
  });

  test('EXECUTION: status check constraint', async () => {
    const { error } = await supabase.from('care_playbook_execution').insert({
      tenant_id: TEST_TENANT_ID,
      playbook_id: createdPlaybookId,
      trigger_type: 'followup_needed',
      entity_type: 'lead',
      entity_id: '00000000-0000-0000-0000-000000000099',
      status: 'invalid_status', // should fail check constraint
      total_steps: 1,
    });

    assert.ok(error, 'Should fail with check constraint violation');
  });

  test('EXECUTION MODE: check constraint on care_playbook', async () => {
    const { error } = await supabase.from('care_playbook').insert({
      tenant_id: TEST_TENANT_ID,
      trigger_type: 'account_risk',
      name: '__test_bad_mode__',
      execution_mode: 'invalid_mode',
      steps: [],
    });

    assert.ok(error, 'Should fail with check constraint on execution_mode');

    // Cleanup just in case
    await supabase
      .from('care_playbook')
      .delete()
      .eq('tenant_id', TEST_TENANT_ID)
      .eq('name', '__test_bad_mode__');
  });

  test('PRIORITY: check constraint rejects negative values', async () => {
    const { error } = await supabase.from('care_playbook').insert({
      tenant_id: TEST_TENANT_ID,
      trigger_type: 'deal_regression',
      name: '__test_negative_priority__',
      execution_mode: 'native',
      priority: -1,
      steps: [],
    });

    assert.ok(error, 'Should fail with check constraint on priority');

    // Cleanup just in case
    await supabase
      .from('care_playbook')
      .delete()
      .eq('tenant_id', TEST_TENANT_ID)
      .eq('name', '__test_negative_priority__');
  });

  test('CASCADE DELETE: deleting playbook cascades to executions', async () => {
    // Create a throwaway playbook
    const { data: pb } = await supabase
      .from('care_playbook')
      .insert({
        tenant_id: TEST_TENANT_ID,
        trigger_type: 'deal_decay',
        name: '__test_cascade__',
        execution_mode: 'native',
        steps: [],
      })
      .select()
      .single();

    // Create an execution for it
    const { data: exec } = await supabase
      .from('care_playbook_execution')
      .insert({
        tenant_id: TEST_TENANT_ID,
        playbook_id: pb.id,
        trigger_type: 'deal_decay',
        entity_type: 'opportunity',
        entity_id: '00000000-0000-0000-0000-000000000099',
        status: 'completed',
        total_steps: 0,
      })
      .select()
      .single();

    // Delete the playbook
    await supabase.from('care_playbook').delete().eq('id', pb.id);

    // Execution should be gone (FK CASCADE)
    const { data: orphan } = await supabase
      .from('care_playbook_execution')
      .select('id')
      .eq('id', exec.id);

    assert.equal(orphan?.length || 0, 0, 'Execution should be cascade deleted');
  });

  test('DELETE: remove test playbook', async () => {
    assert.ok(createdPlaybookId, 'Requires CREATE test to pass first');

    const { error } = await supabase
      .from('care_playbook')
      .delete()
      .eq('id', createdPlaybookId)
      .eq('tenant_id', TEST_TENANT_ID);

    assert.equal(error, null);
    createdPlaybookId = null; // prevent after() double-delete
  });
});
