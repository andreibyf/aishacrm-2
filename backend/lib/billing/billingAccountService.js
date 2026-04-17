/**
 * Platform Billing -- Billing Account Service
 *
 * CRUD operations on billing_accounts plus exemption management.
 *
 * Exemption policy (locked in PR decision):
 *   - billing_exempt is a BOOLEAN FLAG with mandatory audit fields
 *     (reason + actor + timestamp), enforced by CHECK constraint.
 *   - Setting/removing exemption writes a billing_event.
 *   - Toggling exemption triggers syncTenantBillingState().
 */

import logger from '../logger.js';
import { logBillingEvent, BILLING_EVENTS } from './billingEventLogger.js';
import { syncTenantBillingState } from './billingStateMachine.js';

/**
 * Get the billing_account row for a tenant (creates it empty on first access).
 * @returns {Promise<object>} billing_accounts row
 */
export async function getOrCreateBillingAccount(supabase, tenantId) {
  if (!tenantId) throw new Error('getOrCreateBillingAccount: tenantId required');

  const { data: existing, error: selErr } = await supabase
    .from('billing_accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (selErr) throw new Error(`billing_accounts select: ${selErr.message}`);
  if (existing) return existing;

  const { data: created, error: insErr } = await supabase
    .from('billing_accounts')
    .insert({ tenant_id: tenantId })
    .select('*')
    .single();

  if (insErr) {
    // Handle race: another request may have just inserted
    if (insErr.code === '23505') {
      const { data: raced } = await supabase
        .from('billing_accounts')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();
      return raced;
    }
    throw new Error(`billing_accounts insert: ${insErr.message}`);
  }

  return created;
}

/**
 * Update billing profile fields (contact info, address, tax id, etc).
 * Does NOT touch billing_exempt -- use setExemption() for that.
 */
export async function updateBillingProfile(supabase, tenantId, updates) {
  if (!tenantId) throw new Error('updateBillingProfile: tenantId required');

  const allowed = [
    'billing_contact_name',
    'billing_email',
    'company_name',
    'billing_address',
    'tax_id',
    'currency',
    'provider_customer_id',
    'notes',
  ];
  const clean = {};
  for (const k of allowed) {
    if (updates[k] !== undefined) clean[k] = updates[k];
  }

  // Reject any attempt to touch exemption via this path
  const forbidden = ['billing_exempt', 'exempt_reason', 'exempt_set_by', 'exempt_set_at'];
  for (const k of forbidden) {
    if (updates[k] !== undefined) {
      throw new Error(`updateBillingProfile: use setExemption() to modify ${k}`);
    }
  }

  if (Object.keys(clean).length === 0) {
    throw new Error('updateBillingProfile: no updatable fields provided');
  }

  // Ensure account exists
  await getOrCreateBillingAccount(supabase, tenantId);

  const { data, error } = await supabase
    .from('billing_accounts')
    .update(clean)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();

  if (error) throw new Error(`updateBillingProfile: ${error.message}`);
  return data;
}

/**
 * Mark a tenant as billing-exempt. Requires reason + actor.
 * Writes billing_event and syncs tenant.billing_state.
 *
 * @param {object} supabase - service-role client
 * @param {object} params
 * @param {string} params.tenant_id
 * @param {string} params.reason       - human-readable justification (required)
 * @param {string} params.actor_id     - users.id of admin performing action (required)
 * @param {string} [params.request_id]
 * @returns {Promise<{account: object, stateChange: object}>}
 */
export async function setExemption(supabase, { tenant_id, reason, actor_id, request_id }) {
  if (!tenant_id) throw new Error('setExemption: tenant_id required');
  if (!reason || !reason.trim()) throw new Error('setExemption: reason required');
  if (!actor_id) throw new Error('setExemption: actor_id required');

  await getOrCreateBillingAccount(supabase, tenant_id);

  const { data: account, error } = await supabase
    .from('billing_accounts')
    .update({
      billing_exempt: true,
      exempt_reason: reason.trim(),
      exempt_set_by: actor_id,
      exempt_set_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenant_id)
    .select('*')
    .single();

  if (error) throw new Error(`setExemption: ${error.message}`);

  await logBillingEvent(supabase, {
    tenant_id,
    event_type: BILLING_EVENTS.TENANT_BILLING_EXEMPT_SET,
    source: 'admin',
    actor_id,
    payload: { reason: reason.trim() },
    request_id,
  });

  const stateChange = await syncTenantBillingState(supabase, tenant_id);
  logger.info({ tenant_id, actor_id, stateChange }, '[BillingAccounts] Exemption set');

  return { account, stateChange };
}

/**
 * Remove billing exemption from a tenant. Requires actor.
 * Clears audit fields and re-runs state sync so tenant returns to
 * whatever state its subscription dictates.
 *
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.tenant_id
 * @param {string} params.actor_id
 * @param {string} [params.request_id]
 * @returns {Promise<{account: object, stateChange: object}>}
 */
export async function removeExemption(supabase, { tenant_id, actor_id, request_id }) {
  if (!tenant_id) throw new Error('removeExemption: tenant_id required');
  if (!actor_id) throw new Error('removeExemption: actor_id required');

  const { data: current } = await supabase
    .from('billing_accounts')
    .select('*')
    .eq('tenant_id', tenant_id)
    .maybeSingle();

  if (!current || !current.billing_exempt) {
    throw new Error('removeExemption: tenant is not currently exempt');
  }

  const { data: account, error } = await supabase
    .from('billing_accounts')
    .update({
      billing_exempt: false,
      exempt_reason: null,
      exempt_set_by: null,
      exempt_set_at: null,
    })
    .eq('tenant_id', tenant_id)
    .select('*')
    .single();

  if (error) throw new Error(`removeExemption: ${error.message}`);

  await logBillingEvent(supabase, {
    tenant_id,
    event_type: BILLING_EVENTS.TENANT_BILLING_EXEMPT_REMOVED,
    source: 'admin',
    actor_id,
    payload: {
      previous_reason: current.exempt_reason,
      previous_set_at: current.exempt_set_at,
    },
    request_id,
  });

  const stateChange = await syncTenantBillingState(supabase, tenant_id);
  logger.info({ tenant_id, actor_id, stateChange }, '[BillingAccounts] Exemption removed');

  return { account, stateChange };
}

export default {
  getOrCreateBillingAccount,
  updateBillingProfile,
  setExemption,
  removeExemption,
};
