/**
 * Platform Billing -- Barrel Export
 *
 * Single import surface for the platform billing service module.
 *
 *   import billing from '../lib/billing/index.js';
 *   await billing.subscription.assignPlan(supabase, {...});
 *
 * Or named:
 *
 *   import { subscriptionService, BILLING_EVENTS } from '../lib/billing/index.js';
 */

export * as account from './billingAccountService.js';
export * as subscription from './subscriptionService.js';
export * as invoice from './invoiceService.js';
export * as stateMachine from './billingStateMachine.js';
export * as eventLogger from './billingEventLogger.js';
export * as stripe from './stripePlatformAdapter.js';
export * as providerInterface from './paymentProvider.js';
export * as config from './config.js';

export { BILLING_EVENTS } from './billingEventLogger.js';
export {
  BILLING_STATES,
  computeBillingState,
  syncTenantBillingState,
  canAutoTransition,
} from './billingStateMachine.js';
