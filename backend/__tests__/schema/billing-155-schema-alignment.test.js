/**
 * Billing Schema Alignment Test (Migration 155)
 *
 * Verifies migration 155_billing_stripe_price_ids.sql has been applied
 * to the target Supabase environment. Runs against SUPABASE_URL --
 * typically dev first, then prod after promotion.
 *
 * Skips silently when Supabase creds are unavailable (local unit runs).
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initSupabaseForTests, hasSupabaseCredentials } from '../setup.js';
import { getSupabaseClient } from '../../lib/supabase-db.js';

const SHOULD_RUN = hasSupabaseCredentials();

const NEW_COLUMNS = [
  'provider_product_id',
  'provider_price_id_base',
  'provider_price_id_seat',
  'included_seats',
  'seat_unit_amount_cents',
  'trial_days',
];

const EXPECTED_PLAN_CODES = [
  'starter_monthly',
  'growth_monthly',
  'pro_monthly',
  'enterprise_monthly',
];

const EXPECTED_PRICES = {
  starter_monthly: { amount_cents: 19900, included_seats: 3, seat_cents: 4900 },
  growth_monthly: { amount_cents: 29700, included_seats: 5, seat_cents: 4900 },
  pro_monthly: { amount_cents: 49700, included_seats: 10, seat_cents: 4900 },
  enterprise_monthly: { amount_cents: 99700, included_seats: 25, seat_cents: 4900 },
};

describe(
  'Migration 155: Billing Plans Stripe Price IDs -- Schema Alignment',
  { skip: !SHOULD_RUN },
  () => {
    let supabase;

    before(async () => {
      await initSupabaseForTests();
      supabase = getSupabaseClient();
    });

    test('all 6 new columns on billing_plans are selectable', async () => {
      const columns = NEW_COLUMNS.join(', ');
      const { error } = await supabase
        .from('billing_plans')
        .select(`id, code, ${columns}`)
        .limit(1);

      assert.equal(
        error,
        null,
        `Expected columns ${NEW_COLUMNS.join(',')} on billing_plans -- got: ${error?.message}`,
      );
    });

    test('all 4 expected plan codes are seeded', async () => {
      const { data, error } = await supabase
        .from('billing_plans')
        .select('code')
        .in('code', EXPECTED_PLAN_CODES);

      assert.equal(error, null, `billing_plans query failed: ${error?.message}`);
      assert.equal(
        data.length,
        EXPECTED_PLAN_CODES.length,
        `All 4 plans must be seeded (found ${data.length}): ${data.map((r) => r.code).join(',')}`,
      );
    });

    test('prices and included_seats match the 2026 tier structure', async () => {
      const { data, error } = await supabase
        .from('billing_plans')
        .select('code, amount_cents, included_seats, seat_unit_amount_cents, trial_days')
        .in('code', EXPECTED_PLAN_CODES);

      assert.equal(error, null);
      for (const row of data) {
        const expected = EXPECTED_PRICES[row.code];
        assert.equal(row.amount_cents, expected.amount_cents, `${row.code} amount_cents`);
        assert.equal(row.included_seats, expected.included_seats, `${row.code} included_seats`);
        assert.equal(
          row.seat_unit_amount_cents,
          expected.seat_cents,
          `${row.code} seat_unit_amount_cents`,
        );
        assert.equal(row.trial_days, 14, `${row.code} trial_days must be 14`);
      }
    });
  },
);

describe('Migration 155 + 155a: CHECK constraints and behavior', { skip: !SHOULD_RUN }, () => {
  let supabase;

  before(async () => {
    await initSupabaseForTests();
    supabase = getSupabaseClient();
  });

  test('all 4 seeded plans have non-null Stripe IDs', async () => {
    const { data, error } = await supabase
      .from('billing_plans')
      .select('code, provider_product_id, provider_price_id_base, provider_price_id_seat')
      .in('code', EXPECTED_PLAN_CODES);

    assert.equal(error, null, `billing_plans query failed: ${error?.message}`);
    for (const row of data) {
      assert.ok(
        row.provider_product_id?.startsWith('prod_'),
        `${row.code}: provider_product_id should start with prod_`,
      );
      assert.ok(
        row.provider_price_id_base?.startsWith('price_'),
        `${row.code}: provider_price_id_base should start with price_`,
      );
      assert.ok(
        row.provider_price_id_seat?.startsWith('price_'),
        `${row.code}: provider_price_id_seat should start with price_`,
      );
    }
  });

  // Helper: snapshot a plan's provider_* columns so tests can restore
  // state regardless of whether the CHECK rejected their attempted update.
  async function snapshotPlan(code) {
    const { data, error } = await supabase
      .from('billing_plans')
      .select('id, provider_product_id, provider_price_id_base, provider_price_id_seat')
      .eq('code', code)
      .single();
    assert.equal(error, null, `snapshotPlan(${code}) failed: ${error?.message}`);
    assert.ok(data, `snapshotPlan(${code}) returned no row`);
    return data;
  }

  async function restorePlan(snapshot) {
    const { error } = await supabase
      .from('billing_plans')
      .update({
        provider_product_id: snapshot.provider_product_id,
        provider_price_id_base: snapshot.provider_price_id_base,
        provider_price_id_seat: snapshot.provider_price_id_seat,
      })
      .eq('id', snapshot.id);
    assert.equal(error, null, `restorePlan failed: ${error?.message}`);
  }

  test('155a: base-only plan IS allowed (seat NULL with base set)', async () => {
    const snap = await snapshotPlan('starter_monthly');

    // Base set, seat NULL -- fixed-seat plan configuration. Must be accepted.
    const { error } = await supabase
      .from('billing_plans')
      .update({ provider_price_id_seat: null })
      .eq('id', snap.id);

    try {
      assert.equal(error, null, `CHECK must allow base-only (seat NULL): got ${error?.message}`);
    } finally {
      await restorePlan(snap);
    }
  });

  test('155a: seat-only plan is REJECTED (seat set, base NULL)', async () => {
    const snap = await snapshotPlan('starter_monthly');

    const { error } = await supabase
      .from('billing_plans')
      .update({ provider_price_id_base: null })
      .eq('id', snap.id);

    try {
      assert.notEqual(error, null, 'CHECK must reject seat-only (base NULL, seat set)');
    } finally {
      await restorePlan(snap);
    }
  });

  test('155a: any price set without a product is REJECTED', async () => {
    const snap = await snapshotPlan('starter_monthly');

    const { error } = await supabase
      .from('billing_plans')
      .update({ provider_product_id: null })
      .eq('id', snap.id);

    try {
      assert.notEqual(error, null, 'CHECK must reject price set without provider_product_id');
    } finally {
      await restorePlan(snap);
    }
  });

  test('155a: base == seat is REJECTED', async () => {
    const snap = await snapshotPlan('starter_monthly');

    const { error } = await supabase
      .from('billing_plans')
      .update({ provider_price_id_seat: snap.provider_price_id_base })
      .eq('id', snap.id);

    try {
      assert.notEqual(
        error,
        null,
        'CHECK must reject provider_price_id_base == provider_price_id_seat',
      );
    } finally {
      await restorePlan(snap);
    }
  });
});
