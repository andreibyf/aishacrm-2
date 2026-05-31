/**
 * Finance Ops parity for the navigation-permission editors (UI-1D access enablement).
 *
 * Andrei's dev-container test: the tenant Module Settings toggle for Finance now
 * exists, but there was no per-user permission toggle to turn Finance Operations
 * on/off for a user. The per-user editor (NavigationPermissions) builds its list
 * from `User.schema().navigation_permissions` and falls back to a hardcoded
 * `ORDER` array (User.schema() is currently undefined, so the fallback is what
 * actually renders); the tenant-defaults editor (TenantNavigationDefaults) uses
 * its own `NAV_ITEMS` catalog. Both omitted FinanceOps.
 *
 * These tests lock FinanceOps into both editor catalogs, using the exact page
 * key the nav/permissions layer expects, so they can't drift back out.
 */

import { describe, it, expect } from 'vitest';
import { ORDER as USER_NAV_ORDER } from '../NavigationPermissions';
import { NAV_ITEMS as TENANT_NAV_ITEMS } from '../TenantNavigationDefaults';
import { NAV_MODULES, DEFAULT_NAV_PERMISSIONS } from '../UserFormWizard';
import { moduleMapping } from '@/utils/navigationConfig';

describe('navigation-permission editors — Finance Ops parity', () => {
  it('per-user editor (NavigationPermissions.ORDER) includes the FinanceOps page key', () => {
    expect(USER_NAV_ORDER).toContain('FinanceOps');
    // Same page key the nav + permissions layer maps to the financeOps module.
    expect(moduleMapping.FinanceOps).toBe('financeOps');
  });

  it('tenant-defaults editor (TenantNavigationDefaults.NAV_ITEMS) includes a FinanceOps item keyed to the financeOps module', () => {
    const item = TENANT_NAV_ITEMS.find((i) => i.key === 'FinanceOps');
    expect(item).toBeDefined();
    expect(item.label).toBeTruthy();
    // moduleName cross-references modulesettings.module_name — must be canonical.
    expect(item.moduleName).toBe('financeOps');
  });

  it('active create/edit user form (UserFormWizard.NAV_MODULES) renders a FinanceOps toggle', () => {
    // NAV_MODULES is the list mapped into the wizard "Navigation" step — the
    // surface that actually drives the per-user toggle a user/superadmin sees.
    const mod = NAV_MODULES.find((m) => m.key === 'FinanceOps');
    expect(mod).toBeDefined();
    expect(mod.label).toBeTruthy();
  });

  it('UserFormWizard.DEFAULT_NAV_PERMISSIONS defines FinanceOps so it is not silently dropped on save', () => {
    // Every NAV_MODULES key must have a DEFAULT_NAV_PERMISSIONS entry: the saved
    // nav_permissions object is built from DEFAULT_NAV_PERMISSIONS keys, so an
    // unlisted key would render a toggle that never persists. Default true keeps
    // Finance reachable once the tenant module is enabled (the real gate).
    expect(Object.prototype.hasOwnProperty.call(DEFAULT_NAV_PERMISSIONS, 'FinanceOps')).toBe(true);
    expect(DEFAULT_NAV_PERMISSIONS.FinanceOps).toBe(true);
  });
});
