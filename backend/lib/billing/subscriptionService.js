/**
 * Platform Billing -- Subscription Service
 *
 * Assigns plans to tenants, changes plans, and cancels subscriptions.
 * Enforces the "only one non-canceled subscription per tenant" rule
 * (also enforced at DB level via partial unique index).
 */

import logger from '../logger.js';
import { logBillingEvent, BILLING_EVENTS } from './billingEventLogger.js';
import { syncTenantBillingState } from './billingStateMachine.js';

function computeRenewalDate(interval, from = new Date()) {
  const d = new Date(from);
  if (interval === 'month') {
    d.setUTCMonth(d.getUTCMonth() + 1);
  } else if (interval === 'year') {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  } else {
    return null; // one_time has no renewal
  }
  return d.toISOString();
}

/**
 * Get the tenant's active (non-canceled) subscription, if any.
 */
export async function getActiveSubscription(supabase, tenantId) {
  if (!tenantId) throw new Error('getActiveSubscription: tenantId required');
  const { data, error } = await supabase
    .from('tenant_subscriptions')
    .select('*, billing_plans(*)')
    .eq('tenant_id', tenantId)
    .neq('status', 'canceled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveSubscription: ${error.message}`);
  return data;
}

/**
 * Assign a billing plan to a tenant. Fails if tenant already has an
 * active subscription -- use changePlan() for that.
 *
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.tenant_id
 * @param {string} params.plan_code             - e.g. 'starter_monthly'
 * @param {string|null} [params.actor_id]
 * @param {string} [params.provider_subscription_id]
 * @param {string} [params.request_id]
 */
export async function assignPlan(supabase, params) {
  const {
    tenant_id,
    plan_code,
    actor_id = null,
    provider_subscription_id = null,
    request_id,
  } = params;

  if (!tenant_id) throw new Error('assignPlan: tenant_id required');
  if (!plan_code) throw new Error('assignPlan: plan_code required');

  const { data: plan, error: planErr } = await supabase
    .from('billing_plans')
    .select('*')
    .eq('code', plan_code)
    .eq('is_active', true)
    .maybeSingle();
  if (planErr) throw new Error(`assignPlan: ${planErr.message}`);
  if (!plan) throw new Error(`assignPlan: plan "${plan_code}" not found or inactive`);

  const existing = await getActiveSubscription(supabase, tenant_id);
  if (existing) {
    throw new Error('assignPlan: tenant already has an active subscription -- use changePlan()');
  }

  const start_date = new Date().toISOString();
  const renewal_date = computeRenewalDate(plan.billing_interval);

  const { data: sub, error: subErr } = await supabase
    .from('tenant_subscriptions')
    .insert({
      tenant_id,
      billing_plan_id: plan.id,
      status: 'active',
      start_date,
      renewal_date,
      provider_subscription_id,
    })
    .select('*')
    .single();
  if (subErr) throw new Error(`assignPlan: ${subErr.message}`);

  await logBillingEvent(supabase, {
    tenant_id,
    event_type: BILLING_EVENTS.PLAN_ASSIGNED,
    source: actor_id ? 'admin' : 'system',
    actor_id,
    payload: {
      subscription_id: sub.id,
      plan_code,
      plan_id: plan.id,
      amount_cents: plan.amount_cents,
    },
    request_id,
  });

  await logBillingEvent(supabase, {
    tenant_id,
    event_type: BILLING_EVENTS.SUBSCRIPTION_CREATED,
    source: actor_id ? 'admin' : 'system',
    actor_id,
    payload: { subscription_id: sub.id, plan_code },
    request_id,
  });

  await syncTenantBillingState(supabase, tenant_id);
  logger.info({ tenant_id, plan_code, subscription_id: sub.id }, '[Subscriptions] Plan assigned');

  return sub;
}

/**
 * Change a tenant's plan. Cancels existing active sub and creates a new one.
 * Emits plan.changed.
 */
export async function changePlan(supabase, params) {
  const { tenant_id, plan_code, actor_id = null, request_id } = params;

  if (!tenant_id) throw new Error('changePlan: tenant_id required');
  if (!plan_code) throw new Error('changePlan: plan_code required');

  const existing = await getActiveSubscription(supabase, tenant_id);
  if (!existing) {
    throw new Error('changePlan: no active subscription -- use assignPlan()');
  }

  // Validate new plan exists before canceling old one
  const { data: newPlan } = await supabase
    .from('billing_plans')
    .select('id, code, billing_interval, amount_cents, is_active')
    .eq('code', plan_code)
    .maybeSingle();
  if (!newPlan || !newPlan.is_active) {
    throw new Error(`changePlan: plan "${plan_code}" not found or inactive`);
  }
  if (newPlan.id === existing.billing_plan_id) {
    throw new Error(`changePlan: tenant is already on "${plan_code}"`);
  }

  // Cancel existing
  await supabase
    .from('tenant_subscriptions')
    .update({ status: 'canceled', canceled_at: new Date().toISOString() })
    .eq('id', existing.id);

  // Create new
  const newSub = await assignPlan(supabase, { tenant_id, plan_code, actor_id, request_id });

  await logBillingEvent(supabase, {
    tenant_id,
    event_type: BILLING_EVENTS.PLAN_CHANGED,
    source: actor_id ? 'admin' : 'system',
    actor_id,
    payload: {
      from_subscription_id: existing.id,
      to_subscription_id: newSub.id,
      from_plan_id: existing.billing_plan_id,
      to_plan_id: newPlan.id,
      to_plan_code: plan_code,
    },
    request_id,
  });

  return newSub;
}

/**
 * Cancel a tenant's active subscription.
 */
export async function cancelSubscription(supabase, { tenant_id, actor_id, request_id, reason }) {
  if (!tenant_id) throw new Error('cancelSubscription: tenant_id required');
  if (!actor_id) throw new Error('cancelSubscription: actor_id required');

  const existing = await getActiveSubscription(supabase, tenant_id);
  if (!existing) throw new Error('cancelSubscription: no active subscription');

  const { data: canceled, error } = await supabase
    .from('tenant_subscriptions')
    .update({ status: 'canceled', canceled_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select('*')
    .single();
  if (error) throw new Error(`cancelSubscription: ${error.message}`);

  await logBillingEvent(supabase, {
    tenant_id,
    event_type: BILLING_EVENTS.SUBSCRIPTION_CANCELED,
    source: 'admin',
    actor_id,
    payload: {
      subscription_id: existing.id,
      plan_id: existing.billing_plan_id,
      reason: reason || null,
    },
    request_id,
  });

  await syncTenantBillingState(supabase, tenant_id);
  return canceled;
}

export default {
  getActiveSubscription,
  assignPlan,
  changePlan,
  cancelSubscription,
};
