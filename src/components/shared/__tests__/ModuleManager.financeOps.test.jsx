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
import { defaultModules, moduleKeyOf, computeMissingModules } from '../ModuleManager';
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

/**
 * Codex P1: the auto-create-on-load path used `existingNames.includes(canonical)`
 * to detect missing modules, which treated `financeOps` as missing for any
 * tenant currently enrolled via the legacy `enterpriseFinance` alias. Inserting
 * a disabled canonical row then clobbered the alias-enabled access via
 * canonical-wins (financeModuleGate.js, permissions.js). The alias-aware
 * `computeMissingModules` helper is what closes that hole.
 */
describe('computeMissingModules — alias-aware (Codex P1)', () => {
  it('treats the canonical key as already-configured when only its alias is present', () => {
    const missing = computeMissingModules({
      modules: defaultModules,
      existingNames: ['enterpriseFinance'],
      moduleAliases: MODULE_ALIASES,
    });
    expect(missing.some((m) => moduleKeyOf(m) === 'financeOps')).toBe(false);
  });

  it('marks financeOps missing when neither the canonical row nor any alias exists', () => {
    const missing = computeMissingModules({
      modules: defaultModules,
      existingNames: [],
      moduleAliases: MODULE_ALIASES,
    });
    expect(missing.some((m) => moduleKeyOf(m) === 'financeOps')).toBe(true);
  });

  it('does not treat the canonical key as missing when it already exists', () => {
    const missing = computeMissingModules({
      modules: defaultModules,
      existingNames: ['financeOps'],
      moduleAliases: MODULE_ALIASES,
    });
    expect(missing.some((m) => moduleKeyOf(m) === 'financeOps')).toBe(false);
  });

  it('still marks non-aliased modules missing when absent (alias logic is scoped)', () => {
    const missing = computeMissingModules({
      modules: defaultModules,
      existingNames: ['enterpriseFinance'],
      moduleAliases: MODULE_ALIASES,
    });
    // Dashboard has no alias; it should still appear in the missing set.
    expect(missing.some((m) => m.id === 'dashboard')).toBe(true);
  });
});
