/**
 * ModuleManager — Finance Ops module entry parity (UI-1D access enablement).
 *
 * Finance Ops was absent from Module Settings, so admins had no UI control to
 * enable the per-tenant `financeOps` module gate (the row the backend reads).
 * These tests lock in:
 *  - a Finance Ops entry exists in the module list;
 *  - it writes the EXACT canonical key `financeOps` that the backend gate,
 *    navigationConfig, and permissions use — via an explicit `moduleKey`, NOT
 *    the human display name — so frontend/backend cannot drift;
 *  - it defaults DISABLED (controlled per-tenant rollout); and
 *  - the `moduleKey` helper falls back to `name` for every other module so the
 *    existing display-name keying is preserved.
 */

import { describe, it, expect } from 'vitest';
import { defaultModules, moduleKeyOf } from '../ModuleManager';
import { moduleMapping, MODULE_ALIASES } from '@/utils/navigationConfig';

const finance = () => defaultModules.find((m) => m.id === 'financeOps');

describe('ModuleManager — Finance Ops module entry parity', () => {
  it('includes a Finance Ops entry with a human-readable display name', () => {
    const f = finance();
    expect(f).toBeDefined();
    expect(typeof f.name).toBe('string');
    expect(f.name.length).toBeGreaterThan(0);
  });

  it('keys the module by the canonical financeOps string, not the display name', () => {
    const f = finance();
    expect(moduleKeyOf(f)).toBe('financeOps');
    expect(f.name).not.toBe('financeOps');
  });

  it('defaults disabled so the per-tenant gate stays meaningful', () => {
    expect(finance().defaultEnabled).toBe(false);
  });

  it('moduleKeyOf falls back to name for modules without an explicit moduleKey', () => {
    const dashboard = defaultModules.find((m) => m.id === 'dashboard');
    expect(dashboard.moduleKey).toBeUndefined();
    expect(moduleKeyOf(dashboard)).toBe(dashboard.name);
  });

  it('matches navigationConfig.moduleMapping.FinanceOps (no frontend drift)', () => {
    expect(moduleKeyOf(finance())).toBe(moduleMapping.FinanceOps);
    expect(moduleMapping.FinanceOps).toBe('financeOps');
  });

  it('uses the canonical key, never the legacy enterpriseFinance alias', () => {
    expect(MODULE_ALIASES.financeOps).toContain('enterpriseFinance');
    expect(moduleKeyOf(finance())).not.toBe('enterpriseFinance');
  });
});
