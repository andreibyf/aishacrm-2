/**
 * Tenant default module seeding — financeOps parity (UI-1D access enablement).
 *
 * New tenants are seeded with a modulesettings row per default module
 * (backend/routes/tenants.js initializeModuleSettingsForTenant). Finance Ops
 * was missing entirely, so new tenants never got a financeOps row and the
 * Finance v2 module gate (backend/lib/finance/financeModuleGate.js) always
 * denied them with "not enrolled".
 *
 * These tests lock in that:
 *   - financeOps IS seeded for new tenants, using the exact canonical key
 *     (so the gate's lookup matches end-to-end), and
 *   - it is seeded DISABLED by default — the per-tenant gate stays meaningful
 *     for controlled rollout; an admin/superadmin enables it explicitly via
 *     Module Settings. The other defaults stay enabled as before.
 *
 * The seeding row builder is a pure function so this asserts the real shape
 * with no Supabase round-trip.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MODULES,
  DEFAULT_DISABLED_MODULES,
  buildDefaultModuleRows,
} from '../../routes/tenants.js';
import { FINANCE_MODULE_KEYS } from '../../lib/finance/financeModuleGate.js';

describe('tenant default module seeding — financeOps parity', () => {
  test('financeOps is a default-disabled module, using the canonical gate key', () => {
    assert.ok(
      DEFAULT_DISABLED_MODULES.includes(FINANCE_MODULE_KEYS.CANONICAL),
      'financeOps must be in DEFAULT_DISABLED_MODULES',
    );
  });

  test('financeOps is NOT in the enabled-by-default DEFAULT_MODULES list', () => {
    assert.ok(!DEFAULT_MODULES.includes(FINANCE_MODULE_KEYS.CANONICAL));
    assert.ok(!DEFAULT_MODULES.includes(FINANCE_MODULE_KEYS.ALIAS));
  });

  test('seeds a financeOps row with is_enabled=false for a new tenant', () => {
    const rows = buildDefaultModuleRows('tenant-uuid-1');
    const finance = rows.find((r) => r.module_name === FINANCE_MODULE_KEYS.CANONICAL);
    assert.ok(finance, 'a financeOps row must be seeded for the tenant');
    assert.equal(finance.is_enabled, false);
    assert.equal(finance.tenant_id, 'tenant-uuid-1');
  });

  test('all non-finance default modules remain enabled', () => {
    const rows = buildDefaultModuleRows('t1');
    for (const r of rows) {
      if (r.module_name === FINANCE_MODULE_KEYS.CANONICAL) continue;
      assert.equal(r.is_enabled, true, `${r.module_name} should seed enabled`);
    }
  });

  test('every seeded row has the canonical shape', () => {
    const rows = buildDefaultModuleRows('t1');
    assert.ok(rows.length >= DEFAULT_MODULES.length + 1);
    for (const r of rows) {
      assert.equal(r.tenant_id, 't1');
      assert.equal(typeof r.module_name, 'string');
      assert.deepEqual(r.settings, {});
      assert.equal(typeof r.is_enabled, 'boolean');
    }
  });

  test('does not seed the same module_name twice', () => {
    const rows = buildDefaultModuleRows('t1');
    const names = rows.map((r) => r.module_name);
    assert.equal(names.length, new Set(names).size, 'duplicate module_name in seed rows');
  });
});
