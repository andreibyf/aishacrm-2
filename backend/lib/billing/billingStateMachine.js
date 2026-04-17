/**
 * Platform Billing -- State Machine
 *
 * Enforces valid transitions between tenant billing states and keeps
 * `tenant.billing_state` in sync with the authoritative source of truth
 * (billing_accounts.billing_exempt + tenant_subscriptions.status).
 *
 * States (cf. migration 154):
 *   active         -- paying normally
 *   past_due       -- invoice unpaid past due date, pre-grace
 *   grace_period   -- in dunning window before suspension
 *   suspended      -- 30+ days overdue, non-billing access blocked
 *   billing_exempt -- indefinite exemption; bypasses all lifecycle rules
 *   canceled       -- subscription terminated
 *
 * Rule: billing_exempt is a TERMINAL hold -- it can only be entered by an
 * admin toggling billing_accounts.billing_exempt=true, and can only be
 * exited by the same admin toggling it back to false. Automated dunning
 * never transitions TO or FROM billing_exempt.
 */

export const BILLING_STATES = Object.freeze({
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  GRACE_PERIOD: 'grace_period',
  SUSPENDED: 'suspended',
  BILLING_EXEMPT: 'billing_exempt',
  CANCELED: 'canceled',
});

export const VALID_STATES = new Set(Object.values(BILLING_STATES));

/**
 * Allowed automated transitions (does not include admin overrides).
 * Admin actions can force any transition except entering/leaving exempt,
 * which is handled solely by billingAccountService.setExemption().
 */
const AUTO_TRANSITIONS = Object.freeze({
  active: ['past_due', 'canceled'],
  past_due: ['active', 'grace_period', 'canceled'],
  grace_period: ['active', 'suspended', 'canceled'],
  suspended: ['active', 'canceled'],
  billing_exempt: [],
  canceled: [],
});

/**
 * Check whether an automated transition is allowed.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function canAutoTransition(from, to) {
  if (!VALID_STATES.has(from) || !VALID_STATES.has(to)) return false;
  if (from === to) return true;
  return (AUTO_TRANSITIONS[from] || []).includes(to);
}

/**
 * Compute authoritative billing_state from source-of-truth inputs.
 * Priority (highest wins):
 *   1. billing_accounts.billing_exempt=true -> billing_exempt
 *   2. no subscription OR subscription.status='canceled' -> canceled
 *   3. subscription.status maps 1:1 to billing_state
 *
 * @param {object} params
 * @param {object|null} params.billingAccount  - row from billing_accounts (may be null)
 * @param {object|null} params.subscription    - row from tenant_subscriptions (may be null)
 * @returns {string} one of BILLING_STATES values
 */
export function computeBillingState({ billingAccount, subscription }) {
  if (billingAccount?.billing_exempt === true) {
    return BILLING_STATES.BILLING_EXEMPT;
  }
  if (!subscription || subscription.status === 'canceled') {
    // No subscription yet = default active (tenant is on a free/implicit tier).
    // Once a plan is assigned, the subscription row drives state.
    // Canceled subscription = canceled.
    return subscription ? BILLING_STATES.CANCELED : BILLING_STATES.ACTIVE;
  }
  if (subscription.status === 'draft') return BILLING_STATES.ACTIVE;
  if (VALID_STATES.has(subscription.status)) return subscription.status;
  return BILLING_STATES.ACTIVE;
}

/**
 * Sync `tenant.billing_state` column with computed state.
 * Idempotent -- returns {changed: bool, from, to}.
 *
 * @param {object} supabase - service-role client
 * @param {string} tenantId
 * @returns {Promise<{changed: boolean, from: string|null, to: string}>}
 */
export async function syncTenantBillingState(supabase, tenantId) {
  if (!tenantId) throw new Error('syncTenantBillingState: tenantId required');

  const [
    { data: tenantRow, error: tErr },
    { data: account, error: acctErr },
    { data: subs, error: subsErr },
  ] = await Promise.all([
    supabase.from('tenant').select('billing_state').eq('id', tenantId).single(),
    supabase
      .from('billing_accounts')
      .select('billing_exempt')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    supabase
      .from('tenant_subscriptions')
      .select('status')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  if (tErr) throw new Error(`syncTenantBillingState: tenant lookup failed: ${tErr.message}`);
  if (acctErr)
    throw new Error(`syncTenantBillingState: billing_accounts lookup failed: ${acctErr.message}`);
  if (subsErr)
    throw new Error(`syncTenantBillingState: subscription lookup failed: ${subsErr.message}`);

  const subscription = subs && subs.length > 0 ? subs[0] : null;
  const computed = computeBillingState({ billingAccount: account, subscription });

  const current = tenantRow?.billing_state || null;
  if (current === computed) {
    return { changed: false, from: current, to: computed };
  }

  const { error: updErr } = await supabase
    .from('tenant')
    .update({ billing_state: computed })
    .eq('id', tenantId);

  if (updErr) {
    throw new Error(`syncTenantBillingState: update failed: ${updErr.message}`);
  }

  return { changed: true, from: current, to: computed };
}

export default {
  BILLING_STATES,
  VALID_STATES,
  canAutoTransition,
  computeBillingState,
  syncTenantBillingState,
};
