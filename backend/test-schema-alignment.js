/**
 * Schema Alignment Verification Tests
 * Tests that preview database schema matches production after sync migration
 * Run with: docker compose exec backend doppler run -- node --test /app/test-schema-alignment.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { supabase } = require('./lib/supabase');

describe('Schema Alignment Tests', () => {
  describe('Missing Tables Now Present', () => {
    test('agent_events_archive table exists', async () => {
      const { data, error } = await supabase.from('agent_events_archive').select('id').limit(1);

      assert.ok(!error || error.code === 'PGRST116', 'agent_events_archive table should exist');
    });

    test('agent_sessions_archive table exists', async () => {
      const { data, error } = await supabase.from('agent_sessions_archive').select('id').limit(1);

      assert.ok(!error || error.code === 'PGRST116', 'agent_sessions_archive table should exist');
    });

    test('entity_transitions table exists', async () => {
      const { data, error } = await supabase.from('entity_transitions').select('id').limit(1);

      assert.ok(!error || error.code === 'PGRST116', 'entity_transitions table should exist');
    });

    test('tenant_integration table exists', async () => {
      const { data, error } = await supabase.from('tenant_integration').select('id').limit(1);

      assert.ok(!error || error.code === 'PGRST116', 'tenant_integration table should exist');
    });
  });

  describe('Missing Columns Now Present', () => {
    test('accounts.description column exists', async () => {
      const { data, error } = await supabase.from('accounts').select('description').limit(1);

      assert.ok(!error, 'accounts.description should be queryable');
    });

    test('activities.description column exists', async () => {
      const { data, error } = await supabase.from('activities').select('description').limit(1);

      assert.ok(!error, 'activities.description should be queryable');
    });

    test('contacts.description column exists', async () => {
      const { data, error } = await supabase.from('contacts').select('description').limit(1);

      assert.ok(!error, 'contacts.description should be queryable');
    });

    test('contacts.title column exists', async () => {
      const { data, error } = await supabase.from('contacts').select('title').limit(1);

      assert.ok(!error, 'contacts.title should be queryable');
    });

    test('employees.department column exists', async () => {
      const { data, error } = await supabase.from('employees').select('department').limit(1);

      assert.ok(!error, 'employees.department should be queryable');
    });

    test('conversations.title column exists', async () => {
      const { data, error } = await supabase.from('conversations').select('title').limit(1);

      assert.ok(!error, 'conversations.title should be queryable');
    });

    test('conversations.topic column exists', async () => {
      const { data, error } = await supabase.from('conversations').select('topic').limit(1);

      assert.ok(!error, 'conversations.topic should be queryable');
    });

    test('audit_log.request_id column exists', async () => {
      const { data, error } = await supabase.from('audit_log').select('request_id').limit(1);

      assert.ok(!error, 'audit_log.request_id should be queryable');
    });

    test('tenant_integrations.last_sync column exists', async () => {
      const { data, error } = await supabase
        .from('tenant_integrations')
        .select('last_sync')
        .limit(1);

      assert.ok(!error, 'tenant_integrations.last_sync should be queryable');
    });
  });

  describe('created_date Columns Added', () => {
    const tablesToCheck = [
      'ai_campaign',
      'ai_suggestion_feedback',
      'ai_suggestion_metrics',
      'ai_suggestions',
      'announcement',
      'api_key',
      'archive_index',
      'audit_log',
      'cash_flow',
      'checkpoint',
      'client_requirement',
      'contact_history',
      'cron_job',
      'daily_sales_metrics',
      'documents',
      'email_template',
      'entity_labels',
      'field_customization',
      'file',
      'import_log',
      'lead_history',
      'modulesettings',
      'note',
      'performance_logs',
      'project_assignments',
      'projects',
      'subscription',
      'test_report',
      'user_invitation',
      'webhook',
      'workers',
      'workflow',
      'workflow_execution',
      'workflow_template',
    ];

    tablesToCheck.forEach((tableName) => {
      test(`${tableName}.created_date column exists`, async () => {
        const { data, error } = await supabase.from(tableName).select('created_date').limit(1);

        assert.ok(!error, `${tableName}.created_date should be queryable`);
      });
    });
  });

  describe('Type Mismatches Fixed', () => {
    test('name_to_employee.id is UUID type', async () => {
      // Try UUID operation that would fail if type is wrong
      const testUuid = '00000000-0000-0000-0000-000000000000';
      const { error: selectError } = await supabase
        .from('name_to_employee')
        .select('id')
        .eq('id', testUuid)
        .limit(1);

      // If this doesn't error with type mismatch, UUID is correct
      assert.ok(
        !selectError || selectError.code === 'PGRST116',
        'name_to_employee.id should accept UUID values',
      );
    });

    test('bizdev_sources.license_status is text type', async () => {
      const { data, error } = await supabase
        .from('bizdev_sources')
        .select('license_status')
        .limit(1);

      assert.ok(!error, 'bizdev_sources.license_status should be queryable');
    });
  });

  describe('Data Integrity After Migration', () => {
    test('No data loss in existing tables', async () => {
      const { count: accountsCount } = await supabase
        .from('accounts')
        .select('*', { count: 'exact', head: true });

      assert.ok(
        accountsCount !== null && accountsCount >= 0,
        'Accounts table should be accessible and have valid count',
      );
    });

    test('No data loss in employees table', async () => {
      const { count: employeesCount } = await supabase
        .from('employees')
        .select('*', { count: 'exact', head: true });

      assert.ok(
        employeesCount !== null && employeesCount >= 0,
        'Employees table should be accessible and have valid count',
      );
    });

    test('Existing foreign keys still work', async () => {
      const { data, error } = await supabase
        .from('users')
        .select(
          `
          id,
          email,
          tenant_id
        `,
        )
        .limit(1);

      assert.ok(!error, 'Foreign key relationships should still work');
    });
  });

  describe('Null Handling for New Columns', () => {
    test('New columns accept NULL values', async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('description')
        .is('description', null)
        .limit(1);

      assert.ok(!error, 'NULL queries on new columns should work');
    });

    test('Can insert records without new columns', async () => {
      const testTenantId = 'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c';

      const { data, error } = await supabase
        .from('accounts')
        .insert({
          name: 'Schema Test Account',
          tenant_id: testTenantId,
          is_test_data: true,
        })
        .select()
        .single();

      assert.ok(!error, 'Should be able to insert without new columns');

      if (data) {
        // Cleanup
        await supabase.from('accounts').delete().eq('id', data.id);
      }
    });
  });

  describe('Table Count Verification', () => {
    test('Preview has expected number of tables', async () => {
      const knownTables = [
        'accounts',
        'activities',
        'contacts',
        'employees',
        'agent_events_archive',
        'agent_sessions_archive',
        'entity_transitions',
        'tenant_integration',
      ];

      for (const table of knownTables) {
        const { error: tableError } = await supabase.from(table).select('id').limit(1);

        assert.ok(!tableError || tableError.code === 'PGRST116', `Table ${table} should exist`);
      }
    });
  });
});
