/**
 * Billing Schema Alignment Test (Phase 1 / Migration 154)
 *
 * Verifies migration 154_platform_billing_foundation.sql has been applied
 * to the target Supabase environment. Runs against SUPABASE_URL --
 * typically dev first, then prod after promotion.
 *
 * Skips silently when Supabase creds are unavailable (local unit runs).
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initSupabaseForTests, hasSupabaseCredentials } from '../setup.js';
import { getSupabaseClient } from '../../lib/supabase-db.js';
import { TENANT_ID } from '../testConstants.js';

const SHOULD_RUN = hasSupabaseCredentials();

const PLATFORM_BILLING_TABLES = [
  'billing_plans',
  'billing_accounts',
  'tenant_subscriptions',
  'invoices',
  'invoice_line_items',
  'payments',
  'billing_events',
];

const CALCOM_TABLES = ['session_packages', 'session_credits', 'booking_sessions'];

describe(
  'Migration 154: Platform Billing Foundation -- Schema Alignment',
  { skip: !SHOULD_RUN },
  () => {
    let supabase;

    before(async () => {
      await initSupabaseForTests();
      supabase = getSupabaseClient();
    });

    test('all 7 platform billing tables exist', async () => {
      for (const tbl of PLATFORM_BILLING_TABLES) {
        const { error } = await supabase.from(tbl).select('*').limit(1);
        assert.equal(
          error,
          null,
          `Table public.${tbl} must exist and be queryable -- got: ${error?.message}`,
        );
      }
    });

    test('tenant.billing_state column exists', async () => {
      const { data, error } = await supabase.from('tenant').select('id, billing_state').limit(1);

      assert.equal(
        error,
        null,
        `tenant.billing_state must be selectable -- got: ${error?.message}`,
      );
      if (data && data.length > 0) {
        assert.ok(data[0].billing_state !== undefined, 'billing_state column must exist on tenant');
      }
    });

    test('billing_state CHECK constraint rejects invalid values', async () => {
      const { data: tenants } = await supabase.from('tenant').select('id').limit(1);
      if (!tenants || tenants.length === 0) return;
      const tenantId = tenants[0].id;

      const { data: beforeRow } = await supabase
        .from('tenant')
        .select('billing_state')
        .eq('id', tenantId)
        .single();

      const { error } = await supabase
        .from('tenant')
        .update({ billing_state: 'not_a_real_state' })
        .eq('id', tenantId);

      assert.notEqual(error, null, 'CHECK must reject invalid billing_state');

      if (!error && beforeRow) {
        await supabase
          .from('tenant')
          .update({ billing_state: beforeRow.billing_state })
          .eq('id', tenantId);
      }
    });

    test('default plans are seeded', async () => {
      const { data, error } = await supabase
        .from('billing_plans')
        .select('code')
        .in('code', ['starter_monthly', 'growth_monthly', 'pro_monthly']);

      assert.equal(error, null, `billing_plans query failed: ${error?.message}`);
      assert.equal(data.length, 3, 'All 3 default plans must be seeded');
    });

    test('billing_accounts enforces exemption audit trail', async () => {
      const { error } = await supabase.from('billing_accounts').insert({
        tenant_id: TENANT_ID,
        billing_exempt: true,
        // missing exempt_reason, exempt_set_by, exempt_set_at
      });

      assert.notEqual(error, null, 'CHECK must reject billing_exempt=true without audit fields');
    });

    test('billing_events is append-only (UPDATE blocked)', async () => {
      const { data: inserted, error: insErr } = await supabase
        .from('billing_events')
        .insert({
          tenant_id: TENANT_ID,
          event_type: 'test.immutability_probe',
          source: 'system',
          payload_json: { probe: true },
        })
        .select('id')
        .single();

      assert.equal(insErr, null, `insert should succeed: ${insErr?.message}`);

      const { error: updErr } = await supabase
        .from('billing_events')
        .update({ event_type: 'test.mutated' })
        .eq('id', inserted.id);

      assert.notEqual(updErr, null, 'UPDATE on billing_events must be rejected');
      assert.match(
        updErr.message || '',
        /append-only|not permitted/i,
        'error must come from immutability trigger',
      );
    });

    test('billing_events is append-only (DELETE blocked)', async () => {
      const { data: inserted, error: insErr } = await supabase
        .from('billing_events')
        .insert({
          tenant_id: TENANT_ID,
          event_type: 'test.delete_probe',
          source: 'system',
        })
        .select('id')
        .single();

      assert.equal(insErr, null);

      const { error: delErr } = await supabase
        .from('billing_events')
        .delete()
        .eq('id', inserted.id);

      assert.notEqual(delErr, null, 'DELETE on billing_events must be rejected');
    });

    test('only one non-canceled subscription per tenant', async () => {
      const { data: plans } = await supabase
        .from('billing_plans')
        .select('id')
        .eq('code', 'starter_monthly')
        .single();
      assert.ok(plans?.id);

      await supabase
        .from('tenant_subscriptions')
        .update({ status: 'canceled', canceled_at: new Date().toISOString() })
        .eq('tenant_id', TENANT_ID)
        .neq('status', 'canceled');

      const { data: first, error: firstErr } = await supabase
        .from('tenant_subscriptions')
        .insert({
          tenant_id: TENANT_ID,
          billing_plan_id: plans.id,
          status: 'active',
        })
        .select('id')
        .single();
      assert.equal(firstErr, null, `first sub insert: ${firstErr?.message}`);

      const { error: secondErr } = await supabase.from('tenant_subscriptions').insert({
        tenant_id: TENANT_ID,
        billing_plan_id: plans.id,
        status: 'active',
      });

      assert.notEqual(secondErr, null, 'second active sub must be rejected');

      await supabase.from('tenant_subscriptions').delete().eq('id', first.id);
    });

    test('payments.provider_payment_intent_id is unique (idempotency)', async () => {
      const pi = `pi_test_${Date.now()}`;

      const { data: first, error: firstErr } = await supabase
        .from('payments')
        .insert({
          tenant_id: TENANT_ID,
          amount_cents: 100,
          status: 'succeeded',
          provider_payment_intent_id: pi,
        })
        .select('id')
        .single();

      assert.equal(firstErr, null, `first payment insert: ${firstErr?.message}`);

      const { error: dupErr } = await supabase.from('payments').insert({
        tenant_id: TENANT_ID,
        amount_cents: 100,
        status: 'succeeded',
        provider_payment_intent_id: pi,
      });

      assert.notEqual(dupErr, null, 'duplicate payment_intent must be rejected');

      await supabase.from('payments').delete().eq('id', first.id);
    });

    test('domain separation: Cal.com tables untouched', async () => {
      for (const tbl of CALCOM_TABLES) {
        const { error } = await supabase.from(tbl).select('*').limit(1);
        assert.equal(
          error,
          null,
          `Cal.com table ${tbl} must still be queryable -- got: ${error?.message}`,
        );
      }

      const overlap = PLATFORM_BILLING_TABLES.filter((t) => CALCOM_TABLES.includes(t));
      assert.equal(overlap.length, 0, `domain table name overlap: ${overlap.join(',')}`);
    });

    test('billing_accounts is one-per-tenant', async () => {
      await supabase.from('billing_accounts').delete().eq('tenant_id', TENANT_ID);

      const { data: first, error: firstErr } = await supabase
        .from('billing_accounts')
        .insert({ tenant_id: TENANT_ID, billing_email: 'test@example.com' })
        .select('id')
        .single();
      assert.equal(firstErr, null, `first insert: ${firstErr?.message}`);

      const { error: dupErr } = await supabase
        .from('billing_accounts')
        .insert({ tenant_id: TENANT_ID, billing_email: 'dup@example.com' });

      assert.notEqual(dupErr, null, 'second billing_account for same tenant must be rejected');

      await supabase.from('billing_accounts').delete().eq('id', first.id);
    });
  },
);
