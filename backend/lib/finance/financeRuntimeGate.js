/**
 * financeRuntimeGate.js
 *
 * Controls whether the Finance Ops route surface is mounted at all.
 * This is a process-level env gate — it gates the HTTP surface itself,
 * independently of the per-tenant modulesettings gate (financeModuleGate.js).
 *
 * Gate hierarchy:
 *   1. ENABLE_FINANCE_OPS env flag  → this file (is the surface mounted?)
 *   2. modulesettings.financeOps    → financeModuleGate.js (is tenant enrolled?)
 *   3. financeGovernanceDecision.js → per-actor command authorization
 *
 * ENABLE_FINANCE_OPS=true   → routes mounted
 * ENABLE_FINANCE_OPS=false  → routes absent (404 from Express, no leakage)
 * (unset)                   → routes absent (safe default)
 *
 * Local dev: set ENABLE_FINANCE_OPS=true in backend/.env only.
 * Never set this in Coolify, staging, or production env without an explicit
 * release decision.
 */

export function isFinanceRuntimeEnabled() {
  return process.env.ENABLE_FINANCE_OPS === 'true';
}
