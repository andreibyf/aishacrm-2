/**
 * Field Customization Schema Alignment Test (Migration 106)
 *
 * Verifies 106_field_customization.sql has been applied correctly.
 * Runs against SUPABASE_URL — typically dev first, then prod after promotion.
 *
 * Skips silently when Supabase creds are unavailable (local unit runs).
 *
 * Test strategy: behavioral assertions via service_role client. RLS policy
 * presence is not exercised here (service_role bypasses RLS); verify that
 * structurally via `supabase/mcp` or pg_policies lookup instead.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initSupabaseForTests, hasSupabaseCredentials } from '../setup.js';
import { getSupabaseClient } from '../../lib/supabase-db.js';

const SHOULD_RUN = hasSupabaseCredentials();

// Unique prefix so concurrent runs and stale test data don't collide.
const TEST_PREFIX = `custom_test_mig106_${Date.now()}_`;

describe('Migration 106: field_customization — schema alignment', { skip: !SHOULD_RUN }, () => {
  let supabase;
  let tenantId;

  before(async () => {
    await initSupabaseForTests();
    supabase = getSupabaseClient();

    // Any real tenant works as the FK anchor for insertion tests.
    const { data, error } = await supabase.from('tenant').select('id').limit(1).single();
    assert.equal(error, null, `could not fetch a tenant for test: ${error?.message}`);
    tenantId = data.id;
  });

  after(async () => {
    // Clean up any rows this test file created.
    if (supabase && tenantId) {
      await supabase
        .from('field_customization')
        .delete()
        .eq('tenant_id', tenantId)
        .like('field_name', `${TEST_PREFIX}%`);
    }
  });

  test('table is selectable with all expected columns', async () => {
    const { error } = await supabase
      .from('field_customization')
      .select(
        'id, tenant_id, entity_type, field_name, label, is_visible, is_required, options, metadata, created_at, updated_at',
      )
      .limit(1);
    assert.equal(error, null, `expected all columns selectable: ${error?.message}`);
  });

  test('legacy created_date column does not exist', async () => {
    const { error } = await supabase.from('field_customization').select('created_date').limit(1);
    assert.notEqual(error, null, 'created_date should have been dropped by migration 106');
  });

  test('CHECK accepts all 5 supported entity_type values', async () => {
    const entityTypes = ['Opportunity', 'Activity', 'Contact', 'Lead', 'Account'];
    for (const entity_type of entityTypes) {
      const field_name = `${TEST_PREFIX}accept_${entity_type.toLowerCase()}`;
      const { error } = await supabase.from('field_customization').insert({
        tenant_id: tenantId,
        entity_type,
        field_name,
        label: `Test ${entity_type}`,
        metadata: { field_type: 'text', is_custom: true },
      });
      assert.equal(error, null, `${entity_type} should be accepted: ${error?.message}`);
    }
  });

  test('CHECK rejects unsupported entity_type values', async () => {
    const { error } = await supabase.from('field_customization').insert({
      tenant_id: tenantId,
      entity_type: 'Project', // not in allowed list
      field_name: `${TEST_PREFIX}reject_project`,
      label: 'Should fail',
    });
    assert.notEqual(error, null, 'entity_type "Project" must be rejected by CHECK');
    assert.match(
      error.message,
      /check/i,
      `expected CHECK constraint violation, got: ${error.message}`,
    );
  });

  test('UNIQUE(tenant_id, entity_type, field_name) prevents duplicates', async () => {
    const field_name = `${TEST_PREFIX}dup_test`;
    const row = {
      tenant_id: tenantId,
      entity_type: 'Opportunity',
      field_name,
      label: 'Dup Test',
    };

    const { error: firstError } = await supabase.from('field_customization').insert(row);
    assert.equal(firstError, null, `first insert should succeed: ${firstError?.message}`);

    const { error: secondError } = await supabase.from('field_customization').insert(row);
    assert.notEqual(
      secondError,
      null,
      'duplicate (tenant, entity_type, field_name) must be rejected',
    );
    assert.equal(
      secondError.code,
      '23505',
      `expected unique violation 23505, got code ${secondError.code}: ${secondError.message}`,
    );
  });

  test('tenant_id NOT NULL is enforced', async () => {
    const { error } = await supabase.from('field_customization').insert({
      tenant_id: null,
      entity_type: 'Opportunity',
      field_name: `${TEST_PREFIX}null_tenant`,
      label: 'Null tenant',
    });
    assert.notEqual(error, null, 'null tenant_id must be rejected');
    assert.match(error.message, /null/i, `expected NOT NULL violation: ${error.message}`);
  });

  test('label NOT NULL is enforced', async () => {
    const { error } = await supabase.from('field_customization').insert({
      tenant_id: tenantId,
      entity_type: 'Opportunity',
      field_name: `${TEST_PREFIX}null_label`,
      label: null,
    });
    assert.notEqual(error, null, 'null label must be rejected');
    assert.match(error.message, /null/i, `expected NOT NULL violation: ${error.message}`);
  });

  test('updated_at trigger fires on UPDATE', async () => {
    const field_name = `${TEST_PREFIX}trigger_test`;
    const { data: created, error: insertError } = await supabase
      .from('field_customization')
      .insert({
        tenant_id: tenantId,
        entity_type: 'Opportunity',
        field_name,
        label: 'Trigger Test',
      })
      .select('id, updated_at')
      .single();
    assert.equal(insertError, null, `insert failed: ${insertError?.message}`);

    // Wait 10ms so the new updated_at is observably later.
    await new Promise((r) => setTimeout(r, 10));

    const { data: updated, error: updateError } = await supabase
      .from('field_customization')
      .update({ label: 'Trigger Test Updated' })
      .eq('id', created.id)
      .select('updated_at')
      .single();
    assert.equal(updateError, null, `update failed: ${updateError?.message}`);

    assert.ok(
      new Date(updated.updated_at) > new Date(created.updated_at),
      `updated_at should advance on UPDATE: before=${created.updated_at} after=${updated.updated_at}`,
    );
  });

  test('metadata default applies when column omitted', async () => {
    const field_name = `${TEST_PREFIX}metadata_default`;
    const { data, error } = await supabase
      .from('field_customization')
      .insert({
        tenant_id: tenantId,
        entity_type: 'Opportunity',
        field_name,
        label: 'Metadata Default',
      })
      .select('metadata')
      .single();
    assert.equal(error, null, `insert failed: ${error?.message}`);
    assert.deepEqual(
      data.metadata,
      { is_custom: true },
      `metadata default must be {"is_custom": true}, got ${JSON.stringify(data.metadata)}`,
    );
  });
});
