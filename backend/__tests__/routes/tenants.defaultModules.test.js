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
  selectMissingDefaultRows,
  MODULESETTINGS_ALIASES,
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

describe('selectMissingDefaultRows — alias-aware filter (Codex P1)', () => {
  // Backfill / auto-seed regression: a legacy tenant enrolled via the
  // enterpriseFinance alias must NOT have a disabled financeOps row inserted
  // by the auto-seed path, because canonical-wins (financeModuleGate.js:40-48)
  // would then override the alias-enabled access and silently lock the tenant
  // out of Finance Ops.

  test('exposes financeOps -> [enterpriseFinance] alias mapping', () => {
    assert.deepEqual(MODULESETTINGS_ALIASES[FINANCE_MODULE_KEYS.CANONICAL], [
      FINANCE_MODULE_KEYS.ALIAS,
    ]);
  });

  test('treats a row as already-configured if its canonical key is present', () => {
    const rows = buildDefaultModuleRows('t1');
    const missing = selectMissingDefaultRows(rows, [FINANCE_MODULE_KEYS.CANONICAL]);
    assert.ok(
      !missing.some((r) => r.module_name === FINANCE_MODULE_KEYS.CANONICAL),
      'financeOps must not be missing when the canonical row already exists',
    );
  });

  test('treats a row as already-configured if ONLY a legacy alias row exists (no clobber)', () => {
    const rows = buildDefaultModuleRows('t1');
    const missing = selectMissingDefaultRows(rows, [FINANCE_MODULE_KEYS.ALIAS]);
    // The P1 bug: backfill saw financeOps as missing here and would insert
    // is_enabled=false, clobbering the alias-enabled tenant via canonical-wins.
    assert.ok(
      !missing.some((r) => r.module_name === FINANCE_MODULE_KEYS.CANONICAL),
      'financeOps must NOT be inserted when only enterpriseFinance alias exists',
    );
  });

  test('still returns the canonical row when neither key nor any alias is present', () => {
    const rows = buildDefaultModuleRows('t1');
    const missing = selectMissingDefaultRows(rows, ['SomeOtherModule']);
    assert.ok(
      missing.some(
        (r) => r.module_name === FINANCE_MODULE_KEYS.CANONICAL && r.is_enabled === false,
      ),
      'financeOps row should be missing (and seeded disabled) when no canonical or alias exists',
    );
  });

  test('non-aliased default modules are unaffected by the alias logic', () => {
    const rows = buildDefaultModuleRows('t1');
    const missing = selectMissingDefaultRows(rows, ['Dashboard']);
    assert.ok(!missing.some((r) => r.module_name === 'Dashboard'));
    // Other defaults are still missing — alias logic shouldn't swallow them.
    assert.ok(missing.some((r) => r.module_name === 'Contact Management'));
  });
});
