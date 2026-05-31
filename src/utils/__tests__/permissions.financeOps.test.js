/**
 * Permissions — hasPageAccess for FinanceOps with backend alias parity.
 *
 * Codex review of UI-1A/UI-1B/UI-1C (Slack TS 1779825355.550989) flagged
 * P2 frontend/backend access drift: backend financeModuleGate.js accepts
 * 'financeOps' (canonical) AND 'enterpriseFinance' (legacy alias), but
 * the frontend originally only recognised the canonical key. A tenant
 * enrolled via the alias would clear the backend gate but be hidden in
 * the frontend nav.
 *
 * These tests lock in the alias-aware lookup so the drift doesn't return.
 */

import { describe, it, expect } from 'vitest';
import { hasPageAccess } from '../permissions';

const TENANT = 'tenant-uuid-1';
// Admin role so we bypass the role-based default permissions fallback at
// the bottom of hasPageAccess — the tests below are specifically locking
// in the alias-aware module-gate behavior, not the role default table.
// The whole point of the P2 fix is that no admin/superadmin frontend gate
// is enforced for FinanceOps, so any authenticated enrolled-tenant user
// gets access; tests use admin only to keep the role-default fallback out
// of the picture.
const ADMIN_USER = {
  id: 'u1',
  email: 'admin@example.com',
  role: 'admin',
  tenant_id: TENANT,
  crm_access: true,
  navigation_permissions: { FinanceOps: true, CashFlow: true },
};

describe('hasPageAccess(FinanceOps) — backend alias parity', () => {
  it('grants access when an enabled financeOps row exists (canonical key)', () => {
    expect(
      hasPageAccess(ADMIN_USER, 'FinanceOps', TENANT, [
        { module_name: 'financeOps', is_enabled: true },
      ]),
    ).toBe(true);
  });

  it('grants access when an enabled enterpriseFinance row exists (legacy alias)', () => {
    // Without alias-aware lookup, this would return true ONLY because
    // hasPageAccess defaults to "allow if no row matches the canonical
    // key" — which is the wrong reason. The real protection is that any
    // explicit disabled state is detected through either key (see next test).
    expect(
      hasPageAccess(ADMIN_USER, 'FinanceOps', TENANT, [
        { module_name: 'enterpriseFinance', is_enabled: true },
      ]),
    ).toBe(true);
  });

  it('denies access when an explicit disabled enterpriseFinance alias row exists', () => {
    // This is the regression the alias-aware lookup actually catches. Prior
    // to the fix, a disabled `enterpriseFinance` row would NOT cause the
    // frontend to hide the page (backend would deny via the canonical-wins
    // gate but the frontend would still show the nav entry).
    expect(
      hasPageAccess(ADMIN_USER, 'FinanceOps', TENANT, [
        { module_name: 'enterpriseFinance', is_enabled: false },
      ]),
    ).toBe(false);
  });

  it('denies access when an explicit disabled financeOps canonical row exists', () => {
    expect(
      hasPageAccess(ADMIN_USER, 'FinanceOps', TENANT, [
        { module_name: 'financeOps', is_enabled: false },
      ]),
    ).toBe(false);
  });

  // Codex re-review of a6996c69 (Slack TS 1779826966.071559) flagged a
  // remaining P2: the earlier flat `find(acceptableNames)` was order-dependent
  // and could pick an alias row over a canonical row when both existed with
  // conflicting `is_enabled` values. Backend isFinanceOpsEnabled() resolves
  // canonical-wins (financeModuleGate.js:40-48). These two cases lock the
  // resolution order regardless of how Supabase returns the rows.
  describe('canonical-wins resolution when both rows exist with conflicts', () => {
    it('alias first, canonical second: canonical=true wins, access granted', () => {
      expect(
        hasPageAccess(ADMIN_USER, 'FinanceOps', TENANT, [
          { module_name: 'enterpriseFinance', is_enabled: false },
          { module_name: 'financeOps', is_enabled: true },
        ]),
      ).toBe(true);
    });

    it('canonical first, alias second: canonical=true wins, access granted', () => {
      expect(
        hasPageAccess(ADMIN_USER, 'FinanceOps', TENANT, [
          { module_name: 'financeOps', is_enabled: true },
          { module_name: 'enterpriseFinance', is_enabled: false },
        ]),
      ).toBe(true);
    });

    it('alias first, canonical second: canonical=false wins, access denied', () => {
      expect(
        hasPageAccess(ADMIN_USER, 'FinanceOps', TENANT, [
          { module_name: 'enterpriseFinance', is_enabled: true },
          { module_name: 'financeOps', is_enabled: false },
        ]),
      ).toBe(false);
    });

    it('canonical first, alias second: canonical=false wins, access denied', () => {
      expect(
        hasPageAccess(ADMIN_USER, 'FinanceOps', TENANT, [
          { module_name: 'financeOps', is_enabled: false },
          { module_name: 'enterpriseFinance', is_enabled: true },
        ]),
      ).toBe(false);
    });
  });

  // Codex P1 (PR #624): in an admin/superadmin session Layout loads EVERY
  // tenant's module rows (ModuleSettings.list()). The default-disabled
  // `financeOps` seed for unrelated tenants must not shadow the selected
  // tenant's setting — resolution must be scoped to selectedTenantId.
  describe('tenant-scoped resolution (multi-tenant admin session)', () => {
    const OTHER = 'tenant-uuid-2';

    it('grants access for the selected tenant despite another tenant having a disabled row', () => {
      expect(
        hasPageAccess(ADMIN_USER, 'FinanceOps', TENANT, [
          { module_name: 'financeOps', is_enabled: false, tenant_id: OTHER },
          { module_name: 'financeOps', is_enabled: true, tenant_id: TENANT },
        ]),
      ).toBe(true);
    });

    it("denies access when the selected tenant's row is disabled, ignoring another tenant's enabled row", () => {
      expect(
        hasPageAccess(ADMIN_USER, 'FinanceOps', TENANT, [
          { module_name: 'financeOps', is_enabled: true, tenant_id: OTHER },
          { module_name: 'financeOps', is_enabled: false, tenant_id: TENANT },
        ]),
      ).toBe(false);
    });

    it('prefers the selected tenant row over a global default row (enabled tenant row wins)', () => {
      expect(
        hasPageAccess(ADMIN_USER, 'FinanceOps', TENANT, [
          { module_name: 'financeOps', is_enabled: false }, // global default, no tenant_id
          { module_name: 'financeOps', is_enabled: true, tenant_id: TENANT },
        ]),
      ).toBe(true);
    });

    it('an unrelated tenant disabled row alone does not shadow access for the selected tenant', () => {
      // Selected tenant has no row at all; only another tenant's disabled row
      // exists. It must be ignored (no false shadow); access falls through to
      // the role/nav default (granted here).
      expect(
        hasPageAccess(ADMIN_USER, 'FinanceOps', TENANT, [
          { module_name: 'financeOps', is_enabled: false, tenant_id: OTHER },
        ]),
      ).toBe(true);
    });
  });

  it('does NOT extend the alias to unrelated modules', () => {
    // Confirm the alias resolution is scoped to financeOps only. A disabled
    // 'enterpriseFinance' row should NOT incidentally disable an unrelated
    // page whose moduleMapping value happens to be a different key.
    expect(
      hasPageAccess(ADMIN_USER, 'CashFlow', TENANT, [
        { module_name: 'enterpriseFinance', is_enabled: false },
        { module_name: 'Cash Flow Management', is_enabled: true },
      ]),
    ).toBe(true);
  });
});

/**
 * UI-1D access-enablement: superadmin + crm_access semantics for FinanceOps.
 *
 * Andrei's dev-container finding asked for an explicit, tested access path for
 * the user and superadmin to reach Finance Operations WITHOUT bypassing the
 * backend per-tenant module gate. These lock in:
 *   - superadmin sees the page in global view (no tenant), but
 *   - superadmin still respects a disabled per-tenant financeOps row when a
 *     tenant is selected (the Module Settings toggle does NOT become a bypass);
 *   - crm_access is required; and
 *   - enabling the financeOps row is what grants access (the real path).
 */
const SUPERADMIN_USER = {
  id: 'sa1',
  email: 'sa@example.com',
  role: 'superadmin',
  is_superadmin: true,
  crm_access: true,
  navigation_permissions: { FinanceOps: true },
};

const NO_CRM_USER = {
  id: 'u2',
  email: 'nocrm@example.com',
  role: 'admin',
  tenant_id: TENANT,
  crm_access: false,
  navigation_permissions: { FinanceOps: true },
};

describe('hasPageAccess(FinanceOps) — superadmin + crm_access access path', () => {
  it('superadmin sees FinanceOps in global view (no tenant selected), regardless of rows', () => {
    expect(hasPageAccess(SUPERADMIN_USER, 'FinanceOps', null, [])).toBe(true);
  });

  it('superadmin still respects a disabled financeOps row when a tenant is selected (no bypass)', () => {
    expect(
      hasPageAccess(SUPERADMIN_USER, 'FinanceOps', TENANT, [
        { module_name: 'financeOps', is_enabled: false },
      ]),
    ).toBe(false);
  });

  it('superadmin reaches FinanceOps for a tenant once the financeOps row is enabled', () => {
    expect(
      hasPageAccess(SUPERADMIN_USER, 'FinanceOps', TENANT, [
        { module_name: 'financeOps', is_enabled: true },
      ]),
    ).toBe(true);
  });

  it('a user without crm_access cannot reach FinanceOps even if the module is enabled', () => {
    expect(
      hasPageAccess(NO_CRM_USER, 'FinanceOps', TENANT, [
        { module_name: 'financeOps', is_enabled: true },
      ]),
    ).toBe(false);
  });

  it('an enrolled user with crm_access reaches FinanceOps once financeOps is enabled', () => {
    expect(
      hasPageAccess(ADMIN_USER, 'FinanceOps', TENANT, [
        { module_name: 'financeOps', is_enabled: true },
      ]),
    ).toBe(true);
  });
});

/**
 * Codex P1 (UI-1D access enablement): enabling the financeOps module row must
 * actually surface FinanceOps in the nav for users who rely on ROLE DEFAULTS
 * (no explicit navigation_permissions.FinanceOps). Previously hasPageAccess
 * fell through to getDefaultNavigationPermissions(), which omitted FinanceOps,
 * so a tenant-selected admin/superadmin still had the page hidden even after
 * toggling the module on. The backend gate has no role check (design §11.3 —
 * surfaced to any user of an enrolled tenant), so all roles default to visible,
 * gated solely by the per-tenant module row.
 */
const roleDefaultUser = (role) => ({
  id: `def-${role}`,
  email: `${role}@example.com`,
  role,
  is_superadmin: role === 'superadmin',
  tenant_id: TENANT,
  crm_access: true,
  // No navigation_permissions → exercises the role-default fallback path.
});

describe('hasPageAccess(FinanceOps) — users relying on role defaults (tenant selected)', () => {
  const enabled = [{ module_name: 'financeOps', is_enabled: true }];
  const disabled = [{ module_name: 'financeOps', is_enabled: false }];

  for (const role of ['superadmin', 'admin', 'manager', 'employee']) {
    it(`${role} with no explicit FinanceOps permission sees it once the module is enabled`, () => {
      expect(hasPageAccess(roleDefaultUser(role), 'FinanceOps', TENANT, enabled)).toBe(true);
    });

    it(`${role} relying on defaults is still hidden FinanceOps when the module is disabled`, () => {
      expect(hasPageAccess(roleDefaultUser(role), 'FinanceOps', TENANT, disabled)).toBe(false);
    });
  }
});
