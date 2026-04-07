/**
 * AI Triggers Worker - Phase 3 Autonomous Operations
 *
 * Architecture:
 * - Polls for trigger conditions on a configurable interval
 * - Detects: lead stagnation, deal decay, account risks, behavioral metrics
 * - Generates suggestions via AI Brain (propose_actions mode)
 * - Stores suggestions in ai_suggestions table for human review
 * - Runs only when AI_TRIGGERS_WORKER_ENABLED=true
 *
 * SUPABASE QUERY POLICY:
 * - Use Supabase JS client with simple .from().select().eq().lt() chains
 * - Do NOT use complex raw SQL (subqueries, EXTRACT, COALESCE, NOT EXISTS)
 * - For candidate+exclusion queries: two simple queries + JS filtering
 *
 * Following the same pattern as campaignWorker.js
 */

import { emitTenantWebhooks } from './webhookEmitter.js';
import { runTask as runAiBrainTask } from './aiBrain.js';
import { getSupabaseClient } from './supabase-db.js';
import { sanitizeUuidInput } from './uuidValidator.js';
import logger from './logger.js';

// PR6: C.A.R.E. shadow wiring (read-only analysis, no behavior change)
import { detectEscalation } from './care/careEscalationDetector.js';
import { proposeTransition } from './care/careStateEngine.js';
import { emitCareAudit } from './care/careAuditEmitter.js';
import { signalsFromTrigger, buildTriggerEscalationText } from './care/careTriggerSignalAdapter.js';
import { CareAuditEventType, CarePolicyGateResult } from './care/careAuditTypes.js';
import { OUTCOME_TYPES } from './care/careTypes.js';
// PR7: State persistence and policy gate
import { getCareState, upsertCareState, appendCareHistory } from './care/careStateStore.js';
import { isCareAutonomyEnabled } from './care/isCareAutonomyEnabled.js';
// PR8: Workflow webhook trigger integration
import { triggerCareWorkflow } from './care/careWorkflowTriggerClient.js';
// Per-tenant CARE config (Phase 3: replaces hardcoded env vars)
import { getCareConfigForTenant } from './care/careTenantConfig.js';
// PR-Playbook: Playbook router for autonomous action sequences
import { routeTriggerToPlaybook } from './care/carePlaybookRouter.js';

let workerInterval = null;
let supabase = null;

// Trigger configuration defaults
const DEFAULT_INTERVAL_MS = 60000; // 1 minute
const LEAD_STAGNANT_DAYS = parseInt(process.env.CARE_LEAD_STAGNANT_DAYS) || 7;
const DEAL_DECAY_DAYS = parseInt(process.env.CARE_DEAL_DECAY_DAYS) || 14;
const SUGGESTION_EXPIRY_DAYS = 7;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

function safeSystemUserId() {
  const sanitized = sanitizeUuidInput(process.env.SYSTEM_USER_ID, {
    systemAliases: ['system', 'unknown', 'anonymous'],
  });
  if (!sanitized || sanitized === NIL_UUID) return null;
  return sanitized;
}

/**
 * Trigger type definitions
 */
export const TRIGGER_TYPES = {
  LEAD_STAGNANT: 'lead_stagnant',
  DEAL_DECAY: 'deal_decay',
  DEAL_REGRESSION: 'deal_regression',
  ACCOUNT_RISK: 'account_risk',
  ACTIVITY_OVERDUE: 'activity_overdue',
  CONTACT_INACTIVE: 'contact_inactive',
  OPPORTUNITY_HOT: 'opportunity_hot',
  FOLLOWUP_NEEDED: 'followup_needed',

  // Florida Real Estate Transaction Lifecycle Triggers
  // Phase 1 — Insurance Intelligence
  BUYER_LEAD_CREATED: 'buyer_lead_created', // new lead with lead_type = 'buyer'
  LISTING_LEAD_CREATED: 'listing_lead_created', // new lead with lead_type = 'seller'
  INSPECTION_PERIOD_OPEN: 'inspection_period_open', // opp stage = proposal/negotiation
  CLOSING_THIRTY_DAYS: 'closing_thirty_days', // close_date 25–35 days out
  // Phase 2 — Transaction Compliance
  SHOWING_SCHEDULED: 'showing_scheduled', // first meeting activity on a lead
  EFFECTIVE_DATE_SET: 'effective_date_set', // opp metadata.effective_date populated
  ESCROW_DAY3: 'escrow_day3', // 3 days after effective_date
  HOA_DOCS_RECEIVED: 'hoa_docs_received', // opp metadata.hoa_docs_received_date set
  LOAN_COMMITMENT_DAY30: 'loan_commitment_day30', // 28 days after effective_date
  CLOSING_THREE_DAYS: 'closing_three_days', // close_date 2–4 days out
};

/**
 * Initialize and start the AI triggers worker
 */
export function startAiTriggersWorker(_pool, intervalMs = DEFAULT_INTERVAL_MS) {
  const enabled = process.env.AI_TRIGGERS_WORKER_ENABLED === 'true';

  if (!enabled) {
    logger.info('[AiTriggersWorker] Disabled (AI_TRIGGERS_WORKER_ENABLED not true)');
    return;
  }

  try {
    supabase = getSupabaseClient();
  } catch (err) {
    logger.warn({ err }, '[AiTriggersWorker] Supabase client not initialized - worker disabled');
    return;
  }

  console.info('[AiTriggersWorker] Starting');
  logger.info({ intervalMs }, '[AiTriggersWorker] Starting');

  // Run immediately on start
  processAllTriggers().catch((err) =>
    logger.error({ err }, '[AiTriggersWorker] Initial run error'),
  );

  // Then run on interval
  workerInterval = setInterval(() => {
    processAllTriggers().catch((err) => logger.error({ err }, '[AiTriggersWorker] Error'));
  }, intervalMs);

  logger.info('[AiTriggersWorker] Started');
}

/**
 * Stop the AI triggers worker
 */
export function stopAiTriggersWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info('[AiTriggersWorker] Stopped');
  }
}

/**
 * Main processing loop - runs all trigger detectors
 */
async function processAllTriggers() {
  if (!supabase) return;

  try {
    logger.debug('[AiTriggersWorker] Processing triggers...');
    const startTime = Date.now();

    // Get all active tenants using Supabase JS client
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenant')
      .select('id, tenant_id, name')
      .eq('status', 'active');

    if (tenantsError) {
      logger.error({ err: tenantsError }, '[AiTriggersWorker] Error fetching tenants');
      return;
    }

    let totalTriggers = 0;

    for (const tenant of tenants || []) {
      try {
        const tenantTriggers = await processTriggersForTenant(tenant);
        totalTriggers += tenantTriggers;
      } catch (tenantErr) {
        logger.error(
          { err: tenantErr, tenantSlug: tenant.tenant_id },
          '[AiTriggersWorker] Error processing tenant',
        );
      }
    }

    // Expire old pending suggestions
    await expireOldSuggestions();

    const duration = Date.now() - startTime;
    logger.debug({ totalTriggers, durationMs: duration }, '[AiTriggersWorker] Processed triggers');
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] processAllTriggers error');
  }
}

/**
 * Trigger CARE workflow using per-tenant configuration
 * Falls back to environment variable config if no tenant-specific config exists
 *
 * @param {string} tenantId - Tenant UUID
 * @param {object} payload - Workflow trigger payload
 */
async function triggerCareWorkflowForTenant(tenantId, payload) {
  try {
    // Get tenant-specific config (with env fallback)
    const config = await getCareConfigForTenant(tenantId);

    // Check if CARE is enabled for this tenant
    if (!config?.is_enabled) {
      logger.debug({ tenant_id: tenantId }, '[AiTriggers] CARE not enabled for tenant');
      return;
    }

    // Check if webhook URL is configured
    if (!config?.webhook_url) {
      logger.debug(
        {
          tenant_id: tenantId,
          config_source: config?._source,
        },
        '[AiTriggers] No webhook URL configured for tenant',
      );
      return;
    }

    logger.info(
      {
        tenant_id: tenantId,
        webhook_url: config.webhook_url,
        config_source: config._source,
        shadow_mode: config.shadow_mode,
      },
      '[AiTriggers] Triggering CARE workflow for tenant',
    );

    await triggerCareWorkflow({
      url: config.webhook_url,
      secret: config.webhook_secret,
      payload,
      timeout_ms: config.webhook_timeout_ms,
      retries: config.webhook_max_retries,
    });
  } catch (err) {
    logger.warn({ err, tenant_id: tenantId }, '[AiTriggers] CARE workflow trigger failed');
  }
}

/**
 * Process all triggers for a specific tenant
 */
async function processTriggersForTenant(tenant) {
  const { id: tenantUuid, tenant_id: tenantSlug } = tenant;
  let triggerCount = 0;

  try {
    // 1. Detect stagnant leads (with error isolation)
    let stagnantLeads = [];
    try {
      stagnantLeads = await detectStagnantLeads(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectStagnantLeads failed, skipping',
      );
    }

    for (const lead of stagnantLeads) {
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.LEAD_STAGNANT,
        recordType: 'lead',
        recordId: lead.id,
        context: {
          lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
          days_stagnant: lead.days_stagnant,
          status: lead.status,
          last_activity: lead.last_activity_at,
        },
      });
      triggerCount++;

      // PR6+PR7: C.A.R.E. analysis with state persistence (when enabled)
      try {
        // PR7: Build entity context
        const ctx = {
          tenant_id: tenantUuid,
          entity_type: 'lead',
          entity_id: lead.id,
        };

        // PR7: Read current state from DB (fallback to 'unaware')
        let currentState = 'unaware';
        try {
          const stateRecord = await getCareState(ctx);
          if (stateRecord && stateRecord.care_state) {
            currentState = stateRecord.care_state;
          }
        } catch (stateReadError) {
          logger.warn({ err: stateReadError }, '[AiTriggers] C.A.R.E. state read error');
        }

        const signals = signalsFromTrigger({
          trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
          context: {
            lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
            days_stagnant: lead.days_stagnant,
            status: lead.status,
            last_activity: lead.last_activity_at,
          },
          record_type: 'lead',
          record_id: lead.id,
        });

        const escalationText = buildTriggerEscalationText({
          trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
          context: {
            lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
            days_stagnant: lead.days_stagnant,
          },
        });

        const escalation = detectEscalation({ text: escalationText });

        // Debug logging for escalation detection
        logger.info(
          {
            trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
            lead_id: lead.id,
            escalation_text: escalationText,
            is_escalation: escalation.is_escalation,
            escalation_reason: escalation.reason,
            escalation_severity: escalation.severity,
            tenant_id: tenantUuid,
          },
          '[AiTriggers] Escalation detection result',
        );

        if (escalation.is_escalation) {
          logger.info({ lead_id: lead.id }, '[AiTriggers] ESCALATION DETECTED');
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: 'lead',
            entity_id: lead.id,
            event_type: CareAuditEventType.ESCALATION_DETECTED,
            action_origin: 'care_autonomous',
            reason: escalation.reason,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: {
              severity: escalation.severity,
              trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
            },
          });
        }

        // PR7: Calculate proposal BEFORE triggering workflow
        const proposal = proposeTransition({
          current_state: currentState,
          signals,
          action_origin: 'care_autonomous',
        });

        // Determine effective state for workflow payload
        // If autonomy enabled and proposal exists, use proposed state (will be written to DB)
        // Otherwise use current state from DB
        let effectiveState = currentState;

        if (proposal && proposal.to_state) {
          // Always emit state_proposed
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: 'lead',
            entity_id: lead.id,
            event_type: CareAuditEventType.STATE_PROPOSED,
            action_origin: 'care_autonomous',
            reason: proposal.reason,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: {
              current_state: currentState,
              proposed_state: proposal.to_state,
              trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
            },
          });

          // PR7: Conditionally apply transition if autonomy is enabled (not shadow mode)
          if (isCareAutonomyEnabled()) {
            try {
              // Persist state to customer_care_state table BEFORE workflow trigger
              await upsertCareState(ctx, {
                care_state: proposal.to_state,
                last_signal_at: new Date().toISOString(),
                escalation_status: escalation.is_escalation ? escalation.severity : null,
              });

              // Append to history for audit trail
              await appendCareHistory(ctx, {
                from_state: currentState,
                to_state: proposal.to_state,
                event_type: 'state_transition',
                reason: proposal.reason,
                actor_type: 'system',
                meta: {
                  trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
                  signals,
                  action_origin: 'care_autonomous',
                },
              });

              // Update effective state to reflect the write
              effectiveState = proposal.to_state;

              emitCareAudit({
                tenant_id: tenantUuid,
                entity_type: 'lead',
                entity_id: lead.id,
                event_type: CareAuditEventType.STATE_APPLIED,
                action_origin: 'care_autonomous',
                reason: `State applied: ${currentState} → ${proposal.to_state}`,
                policy_gate_result: CarePolicyGateResult.ALLOWED,
                meta: {
                  from_state: currentState,
                  to_state: proposal.to_state,
                  trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
                },
              });
            } catch (applyError) {
              logger.warn({ err: applyError }, '[AiTriggers] C.A.R.E. state apply error');
              // On error, keep effectiveState as currentState
            }
          }
        }

        // PR8: Trigger workflow webhook for ALL stagnant leads (not just escalations)
        // Full payload structure - matches CARE_EVENT_CONTRACT.md
        await triggerCareWorkflowForTenant(tenantUuid, {
          event_id: `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: escalation.is_escalation ? 'care.escalation_detected' : 'care.trigger_detected',
          ts: new Date().toISOString(),
          tenant_id: tenantUuid,
          entity_id: lead.id,
          entity_type: 'lead',
          signal_entity_id: lead.id,
          signal_entity_type: 'lead',
          trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
          action_origin: 'care_autonomous',
          policy_gate_result: 'allowed',
          reason: `Lead is stagnant for ${lead.days_stagnant} days (status=${lead.status})`,
          care_state: effectiveState,
          previous_state: currentState !== effectiveState ? currentState : null,
          escalation_detected: escalation.is_escalation,
          escalation_status: escalation.is_escalation ? escalation.severity : null,
          deep_link: `/app/leads/${lead.id}`,
          intent: 'triage_trigger',
          meta: {
            lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
            first_name: lead.first_name,
            last_name: lead.last_name,
            email: lead.email || null,
            phone: lead.phone || null,
            status: lead.status,
            days_stagnant: lead.days_stagnant,
            severity: escalation.is_escalation ? escalation.severity : null,
            state_transition:
              currentState !== effectiveState ? `${currentState} → ${effectiveState}` : null,
          },
        });

        if (!proposal) {
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: 'lead',
            entity_id: lead.id,
            event_type: CareAuditEventType.ACTION_SKIPPED,
            action_origin: 'care_autonomous',
            reason: 'no_transition_proposed',
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: { trigger_type: TRIGGER_TYPES.LEAD_STAGNANT },
          });
        }

        // Emit action candidate for meaningful follow-ups (logs only)
        if (
          proposal &&
          proposal.to_state &&
          ['awareness', 'engagement'].includes(proposal.to_state)
        ) {
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: 'lead',
            entity_id: lead.id,
            event_type: CareAuditEventType.ACTION_CANDIDATE,
            action_origin: 'care_autonomous',
            reason: 'follow_up action candidate identified',
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: {
              action_type: 'follow_up',
              proposed_state: proposal.to_state,
              trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
              silence_days: signals.silence_days,
            },
          });
        }

        // PR7: Always emit action_skipped
        emitCareAudit({
          tenant_id: tenantUuid,
          entity_type: 'lead',
          entity_id: lead.id,
          event_type: CareAuditEventType.ACTION_SKIPPED,
          action_origin: 'care_autonomous',
          reason: 'Autonomous actions disabled (PR7: state persistence only)',
          policy_gate_result: CarePolicyGateResult.ALLOWED,
          meta: { trigger_type: TRIGGER_TYPES.LEAD_STAGNANT },
        });
      } catch (err) {
        console.warn('[C.A.R.E. PR7] Trigger analysis error (non-breaking):', err.message);
      }
    }

    // 2. Detect deal decay (opportunities with no activity) - with error isolation
    let decayingDeals = [];
    try {
      decayingDeals = await detectDealDecay(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectDealDecay failed, skipping',
      );
    }

    for (const deal of decayingDeals) {
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.DEAL_DECAY,
        recordType: 'opportunity',
        recordId: deal.id,
        context: {
          deal_name: deal.name,
          stage: deal.stage,
          amount: deal.amount,
          days_inactive: deal.days_inactive,
          close_date: deal.close_date,
        },
      });
      triggerCount++;

      // PR6+PR7: C.A.R.E. analysis with state persistence (when enabled)
      try {
        // PR7: Build entity context
        const ctx = {
          tenant_id: tenantUuid,
          entity_type: 'opportunity',
          entity_id: deal.id,
        };

        // PR7: Read current state from DB (fallback to 'unaware')
        let currentState = 'unaware';
        try {
          const stateRecord = await getCareState(ctx);
          if (stateRecord && stateRecord.care_state) {
            currentState = stateRecord.care_state;
          }
        } catch (stateReadError) {
          logger.warn({ err: stateReadError }, '[AiTriggers] C.A.R.E. state read error');
        }

        const signals = signalsFromTrigger({
          trigger_type: TRIGGER_TYPES.DEAL_DECAY,
          context: {
            deal_name: deal.name,
            stage: deal.stage,
            amount: deal.amount,
            days_inactive: deal.days_inactive,
            close_date: deal.close_date,
          },
          record_type: 'opportunity',
          record_id: deal.id,
        });

        const escalationText = buildTriggerEscalationText({
          trigger_type: TRIGGER_TYPES.DEAL_DECAY,
          context: {
            deal_name: deal.name,
            stage: deal.stage,
            amount: deal.amount,
            days_inactive: deal.days_inactive,
          },
        });

        const escalation = detectEscalation({ text: escalationText });

        // PR7: Calculate proposal BEFORE triggering workflow
        const proposal = proposeTransition({
          current_state: currentState,
          signals,
          action_origin: 'care_autonomous',
        });

        // Determine effective state for workflow payload
        let effectiveState = currentState;

        if (proposal && proposal.to_state) {
          // Always emit state_proposed
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: 'opportunity',
            entity_id: deal.id,
            event_type: CareAuditEventType.STATE_PROPOSED,
            action_origin: 'care_autonomous',
            reason: proposal.reason,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: {
              current_state: currentState,
              proposed_state: proposal.to_state,
              trigger_type: TRIGGER_TYPES.DEAL_DECAY,
            },
          });

          // PR7: Conditionally apply transition if autonomy is enabled (not shadow mode)
          if (isCareAutonomyEnabled()) {
            try {
              // Persist state to customer_care_state table BEFORE workflow trigger
              await upsertCareState(ctx, {
                care_state: proposal.to_state,
                last_signal_at: new Date().toISOString(),
                escalation_status: escalation.is_escalation ? escalation.severity : null,
              });

              // Append to history for audit trail
              await appendCareHistory(ctx, {
                from_state: currentState,
                to_state: proposal.to_state,
                event_type: 'state_transition',
                reason: proposal.reason,
                actor_type: 'system',
                meta: {
                  trigger_type: TRIGGER_TYPES.DEAL_DECAY,
                  amount: deal.amount,
                  signals,
                  action_origin: 'care_autonomous',
                },
              });

              // Update effective state to reflect the write
              effectiveState = proposal.to_state;

              emitCareAudit({
                tenant_id: tenantUuid,
                entity_type: 'opportunity',
                entity_id: deal.id,
                event_type: CareAuditEventType.STATE_APPLIED,
                action_origin: 'care_autonomous',
                reason: `State applied: ${currentState} → ${proposal.to_state}`,
                policy_gate_result: CarePolicyGateResult.ALLOWED,
                meta: {
                  from_state: currentState,
                  to_state: proposal.to_state,
                  trigger_type: TRIGGER_TYPES.DEAL_DECAY,
                },
              });
            } catch (applyError) {
              logger.warn({ err: applyError }, '[AiTriggers] C.A.R.E. state apply error');
            }
          }
        }

        if (escalation.is_escalation) {
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: 'opportunity',
            entity_id: deal.id,
            event_type: CareAuditEventType.ESCALATION_DETECTED,
            action_origin: 'care_autonomous',
            reason: escalation.reason,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: {
              severity: escalation.severity,
              amount: deal.amount,
              trigger_type: TRIGGER_TYPES.DEAL_DECAY,
            },
          });

          // PR8: Trigger workflow webhook with updated state
          // Full payload structure - matches CARE_EVENT_CONTRACT.md
          // Normalize opportunity (signal) to parent account or lead (entity)
          const entityId = deal.account_id || deal.lead_id;
          const entityType = deal.account_id ? 'account' : 'lead';

          await triggerCareWorkflowForTenant(tenantUuid, {
            event_id: `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: escalation.is_escalation ? 'care.escalation_detected' : 'care.trigger_detected',
            ts: new Date().toISOString(),
            tenant_id: tenantUuid,
            entity_id: entityId,
            entity_type: entityType,
            signal_entity_id: deal.id,
            signal_entity_type: 'opportunity',
            trigger_type: TRIGGER_TYPES.DEAL_DECAY,
            action_origin: 'care_autonomous',
            policy_gate_result: 'allowed',
            reason: escalation.reason || `Opportunity inactive for ${deal.days_inactive} days`,
            care_state: effectiveState,
            previous_state: currentState !== effectiveState ? currentState : null,
            escalation_detected: escalation.is_escalation,
            escalation_status: escalation.is_escalation ? escalation.severity : null,
            deep_link: `/app/opportunities/${deal.id}`,
            intent: 'triage_trigger',
            meta: {
              deal_name: deal.name,
              amount: deal.amount,
              stage: deal.stage,
              days_inactive: deal.days_inactive,
              close_date: deal.close_date || null,
              severity: escalation.severity,
              state_transition:
                currentState !== effectiveState ? `${currentState} → ${effectiveState}` : null,
            },
          });
        }

        if (!proposal) {
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: 'opportunity',
            entity_id: deal.id,
            event_type: CareAuditEventType.ACTION_SKIPPED,
            action_origin: 'care_autonomous',
            reason: 'no_transition_proposed',
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: { trigger_type: TRIGGER_TYPES.DEAL_DECAY },
          });
        }

        if (proposal && proposal.to_state && deal.amount > 10000) {
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: 'opportunity',
            entity_id: deal.id,
            event_type: CareAuditEventType.ACTION_CANDIDATE,
            action_origin: 'care_autonomous',
            reason: 'deal revival action candidate identified',
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: {
              action_type: 'deal_revival',
              proposed_state: proposal.to_state,
              trigger_type: TRIGGER_TYPES.DEAL_DECAY,
              amount: deal.amount,
              silence_days: signals.silence_days,
            },
          });
        }

        // PR7: Always emit action_skipped
        emitCareAudit({
          tenant_id: tenantUuid,
          entity_type: 'opportunity',
          entity_id: deal.id,
          event_type: CareAuditEventType.ACTION_SKIPPED,
          action_origin: 'care_autonomous',
          reason: 'Autonomous actions disabled (PR7: state persistence only)',
          policy_gate_result: CarePolicyGateResult.ALLOWED,
          meta: { trigger_type: TRIGGER_TYPES.DEAL_DECAY },
        });
      } catch (err) {
        console.warn('[C.A.R.E. PR7] Trigger analysis error (non-breaking):', err.message);
      }
    }

    // 3. Detect overdue activities - with error isolation
    let overdueActivities = [];
    try {
      overdueActivities = await detectOverdueActivities(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectOverdueActivities failed, skipping',
      );
    }

    for (const activity of overdueActivities) {
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.ACTIVITY_OVERDUE,
        recordType: 'activity',
        recordId: activity.id,
        context: {
          subject: activity.subject,
          type: activity.type,
          days_overdue: activity.days_overdue,
          related_to: activity.related_to,
          related_id: activity.related_id,
        },
      });
      triggerCount++;

      // PR6+PR7: C.A.R.E. analysis with state persistence (when enabled)
      try {
        // CRITICAL: Normalize to relationship entity for CARE state
        // Activities are signals, not relationship entities. CARE state should be
        // keyed on the related contact/account/lead, with activity as source metadata.
        const validRelationshipTypes = ['lead', 'contact', 'account'];
        const normalizedEntityType = validRelationshipTypes.includes(activity.related_to)
          ? activity.related_to
          : null;
        const normalizedEntityId = activity.related_id || null;

        // If we can't normalize to a relationship entity, log and skip CARE processing
        if (!normalizedEntityType || !normalizedEntityId) {
          logger.debug(
            {
              activity_id: activity.id,
              related_to: activity.related_to,
              related_id: activity.related_id,
            },
            '[AiTriggers] Cannot normalize activity to relationship entity - skipping CARE',
          );
          continue;
        }

        // PR7: Build entity context using NORMALIZED relationship entity
        const ctx = {
          tenant_id: tenantUuid,
          entity_type: normalizedEntityType,
          entity_id: normalizedEntityId,
        };

        // PR7: Read current state from DB (fallback to 'unaware')
        let currentState = 'unaware';
        try {
          const stateRecord = await getCareState(ctx);
          if (stateRecord && stateRecord.care_state) {
            currentState = stateRecord.care_state;
          }
        } catch (stateReadError) {
          logger.warn({ err: stateReadError }, '[AiTriggers] C.A.R.E. state read error');
        }

        const signals = signalsFromTrigger({
          trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
          context: {
            subject: activity.subject,
            type: activity.type,
            days_overdue: activity.days_overdue,
            related_to: activity.related_to,
          },
          record_type: normalizedEntityType,
          record_id: normalizedEntityId,
        });

        const escalationText = buildTriggerEscalationText({
          trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
          context: {
            subject: activity.subject,
            days_overdue: activity.days_overdue,
          },
        });

        const escalation = detectEscalation({ text: escalationText });

        // PR7: Calculate proposal BEFORE triggering workflow
        const proposal = proposeTransition({
          current_state: currentState,
          signals,
          action_origin: 'care_autonomous',
        });

        // Determine effective state for workflow payload
        let effectiveState = currentState;

        if (proposal && proposal.to_state) {
          // Always emit state_proposed - use normalized entity
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: normalizedEntityType,
            entity_id: normalizedEntityId,
            event_type: CareAuditEventType.STATE_PROPOSED,
            action_origin: 'care_autonomous',
            reason: proposal.reason,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: {
              current_state: currentState,
              proposed_state: proposal.to_state,
              trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
              signal_entity_type: 'activity',
              signal_entity_id: activity.id,
            },
          });

          // PR7: Conditionally apply transition if autonomy is enabled (not shadow mode)
          if (isCareAutonomyEnabled()) {
            try {
              // Persist state to customer_care_state table BEFORE workflow trigger
              await upsertCareState(ctx, {
                care_state: proposal.to_state,
                last_signal_at: new Date().toISOString(),
                escalation_status: escalation.is_escalation ? escalation.severity : null,
              });

              // Append to history for audit trail
              await appendCareHistory(ctx, {
                from_state: currentState,
                to_state: proposal.to_state,
                event_type: 'state_transition',
                reason: proposal.reason,
                actor_type: 'system',
                meta: {
                  trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
                  days_overdue: activity.days_overdue,
                  signals,
                  signal_entity_type: 'activity',
                  signal_entity_id: activity.id,
                  action_origin: 'care_autonomous',
                },
              });

              // Update effective state to reflect the write
              effectiveState = proposal.to_state;

              emitCareAudit({
                tenant_id: tenantUuid,
                entity_type: normalizedEntityType,
                entity_id: normalizedEntityId,
                event_type: CareAuditEventType.STATE_APPLIED,
                action_origin: 'care_autonomous',
                reason: `State applied: ${currentState} → ${proposal.to_state}`,
                policy_gate_result: CarePolicyGateResult.ALLOWED,
                meta: {
                  from_state: currentState,
                  to_state: proposal.to_state,
                  trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
                  signal_entity_type: 'activity',
                  signal_entity_id: activity.id,
                },
              });
            } catch (applyError) {
              logger.warn({ err: applyError }, '[AiTriggers] C.A.R.E. state apply error');
            }
          }
        }

        if (escalation.is_escalation) {
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: normalizedEntityType,
            entity_id: normalizedEntityId,
            event_type: CareAuditEventType.ESCALATION_DETECTED,
            action_origin: 'care_autonomous',
            reason: escalation.reason,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: {
              severity: escalation.severity,
              days_overdue: activity.days_overdue,
              trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
              signal_entity_type: 'activity',
              signal_entity_id: activity.id,
            },
          });
        }

        // PR8: Trigger workflow webhook for ALL activity_overdue (not just escalations)
        // Full payload structure - matches CARE_EVENT_CONTRACT.md
        await triggerCareWorkflowForTenant(tenantUuid, {
          event_id: `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: escalation.is_escalation ? 'care.escalation_detected' : 'care.trigger_detected',
          ts: new Date().toISOString(),
          tenant_id: tenantUuid,
          entity_id: normalizedEntityId,
          entity_type: normalizedEntityType,
          signal_entity_id: activity.id,
          signal_entity_type: 'activity',
          trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
          action_origin: 'care_autonomous',
          policy_gate_result: 'allowed',
          reason: escalation.is_escalation
            ? escalation.reason
            : `Activity is overdue by ${activity.days_overdue} days`,
          care_state: effectiveState,
          previous_state: currentState !== effectiveState ? currentState : null,
          escalation_detected: escalation.is_escalation,
          escalation_status: escalation.is_escalation ? escalation.severity : null,
          deep_link: `/app/activities/${activity.id}`,
          intent: 'triage_trigger',
          meta: {
            subject: activity.subject,
            activity_type: activity.type,
            due_date: activity.due_date,
            days_overdue: activity.days_overdue,
            assigned_to: activity.assigned_to || null,
            severity: escalation.is_escalation ? escalation.severity : null,
            state_transition:
              currentState !== effectiveState ? `${currentState} → ${effectiveState}` : null,
          },
        });

        if (!proposal) {
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: normalizedEntityType,
            entity_id: normalizedEntityId,
            event_type: CareAuditEventType.ACTION_SKIPPED,
            action_origin: 'care_autonomous',
            reason: 'no_transition_proposed',
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: {
              trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
              signal_entity_type: 'activity',
              signal_entity_id: activity.id,
            },
          });
        }

        if (proposal && proposal.to_state && activity.days_overdue > 2) {
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: normalizedEntityType,
            entity_id: normalizedEntityId,
            event_type: CareAuditEventType.ACTION_CANDIDATE,
            action_origin: 'care_autonomous',
            reason: 'activity reschedule action candidate identified',
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: {
              action_type: 'activity_reschedule',
              proposed_state: proposal.to_state,
              trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
              days_overdue: activity.days_overdue,
              signal_entity_type: 'activity',
              signal_entity_id: activity.id,
            },
          });
        }

        // PR7: Always emit action_skipped - use normalized entity
        emitCareAudit({
          tenant_id: tenantUuid,
          entity_type: normalizedEntityType,
          entity_id: normalizedEntityId,
          event_type: CareAuditEventType.ACTION_SKIPPED,
          action_origin: 'care_autonomous',
          reason: 'Autonomous actions disabled (PR7: state persistence only)',
          policy_gate_result: CarePolicyGateResult.ALLOWED,
          meta: {
            trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
            signal_entity_type: 'activity',
            signal_entity_id: activity.id,
          },
        });
      } catch (err) {
        console.warn('[C.A.R.E. PR7] Trigger analysis error (non-breaking):', err.message);
      }
    }

    // 4. Detect hot opportunities (high probability, close soon) - with error isolation
    let hotOpportunities = [];
    try {
      hotOpportunities = await detectHotOpportunities(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectHotOpportunities failed, skipping',
      );
    }

    for (const opp of hotOpportunities) {
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.OPPORTUNITY_HOT,
        recordType: 'opportunity',
        recordId: opp.id,
        context: {
          deal_name: opp.name,
          amount: opp.amount,
          probability: opp.probability,
          days_to_close: opp.days_to_close,
          stage: opp.stage,
        },
        priority: 'high',
      });
      triggerCount++;

      // PR6+PR7: C.A.R.E. analysis with state persistence (when enabled)
      try {
        // PR7: Build entity context
        const ctx = {
          tenant_id: tenantUuid,
          entity_type: 'opportunity',
          entity_id: opp.id,
        };

        // PR7: Read current state from DB (fallback to 'unaware')
        let currentState = 'unaware';
        try {
          const stateRecord = await getCareState(ctx);
          if (stateRecord && stateRecord.care_state) {
            currentState = stateRecord.care_state;
          }
        } catch (stateReadError) {
          logger.warn({ err: stateReadError }, '[AiTriggers] C.A.R.E. state read error');
        }

        const signals = signalsFromTrigger({
          trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
          context: {
            deal_name: opp.name,
            amount: opp.amount,
            probability: opp.probability,
            days_to_close: opp.days_to_close,
            stage: opp.stage,
          },
          record_type: 'opportunity',
          record_id: opp.id,
        });

        const escalationText = buildTriggerEscalationText({
          trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
          context: {
            deal_name: opp.name,
            probability: opp.probability,
            days_to_close: opp.days_to_close,
          },
        });

        const escalation = detectEscalation({ text: escalationText });

        // PR7: Calculate proposal BEFORE triggering workflow
        const proposal = proposeTransition({
          current_state: currentState,
          signals,
          action_origin: 'care_autonomous',
        });

        // Determine effective state for workflow payload
        let effectiveState = currentState;

        if (proposal && proposal.to_state) {
          // Always emit state_proposed
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: 'opportunity',
            entity_id: opp.id,
            event_type: CareAuditEventType.STATE_PROPOSED,
            action_origin: 'care_autonomous',
            reason: proposal.reason,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: {
              current_state: currentState,
              proposed_state: proposal.to_state,
              trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
            },
          });

          // PR7: Conditionally apply transition if autonomy is enabled (not shadow mode)
          if (isCareAutonomyEnabled()) {
            try {
              // Persist state to customer_care_state table BEFORE workflow trigger
              await upsertCareState(ctx, {
                care_state: proposal.to_state,
                last_signal_at: new Date().toISOString(),
                escalation_status: escalation.is_escalation ? escalation.severity : null,
              });

              // Append to history for audit trail
              await appendCareHistory(ctx, {
                from_state: currentState,
                to_state: proposal.to_state,
                event_type: 'state_transition',
                reason: proposal.reason,
                actor_type: 'system',
                meta: {
                  trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
                  amount: opp.amount,
                  signals,
                  action_origin: 'care_autonomous',
                },
              });

              // Update effective state to reflect the write
              effectiveState = proposal.to_state;

              emitCareAudit({
                tenant_id: tenantUuid,
                entity_type: 'opportunity',
                entity_id: opp.id,
                event_type: CareAuditEventType.STATE_APPLIED,
                action_origin: 'care_autonomous',
                reason: `State applied: ${currentState} → ${proposal.to_state}`,
                policy_gate_result: CarePolicyGateResult.ALLOWED,
                meta: {
                  from_state: currentState,
                  to_state: proposal.to_state,
                  trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
                },
              });
            } catch (applyError) {
              logger.warn({ err: applyError }, '[AiTriggers] C.A.R.E. state apply error');
            }
          }
        }

        if (escalation.is_escalation) {
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: 'opportunity',
            entity_id: opp.id,
            event_type: CareAuditEventType.ESCALATION_DETECTED,
            action_origin: 'care_autonomous',
            reason: escalation.reason,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: {
              severity: escalation.severity,
              probability: opp.probability,
              trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
            },
          });

          // PR8: Trigger workflow webhook with updated state
          // Full payload structure - matches CARE_EVENT_CONTRACT.md
          // Normalize opportunity (signal) to parent account or lead (entity)
          const entityId = opp.account_id || opp.lead_id;
          const entityType = opp.account_id ? 'account' : 'lead';

          await triggerCareWorkflowForTenant(tenantUuid, {
            event_id: `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'care.escalation_detected',
            ts: new Date().toISOString(),
            tenant_id: tenantUuid,
            entity_id: entityId,
            entity_type: entityType,
            signal_entity_id: opp.id,
            signal_entity_type: 'opportunity',
            trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
            action_origin: 'care_autonomous',
            policy_gate_result: 'allowed',
            reason:
              escalation.reason ||
              `High-value opportunity closing soon (${opp.days_to_close} days)`,
            care_state: effectiveState,
            previous_state: currentState !== effectiveState ? currentState : null,
            escalation_detected: true,
            escalation_status: escalation.severity,
            deep_link: `/app/opportunities/${opp.id}`,
            intent: 'triage_trigger',
            meta: {
              deal_name: opp.name,
              amount: opp.amount,
              probability: opp.probability,
              stage: opp.stage,
              days_to_close: opp.days_to_close,
              close_date: opp.close_date || null,
              severity: escalation.severity,
              state_transition:
                currentState !== effectiveState ? `${currentState} → ${effectiveState}` : null,
            },
          });
        }

        if (proposal && proposal.to_state && opp.amount > 50000) {
          emitCareAudit({
            tenant_id: tenantUuid,
            entity_type: 'opportunity',
            entity_id: opp.id,
            event_type: CareAuditEventType.ACTION_CANDIDATE,
            action_origin: 'care_autonomous',
            reason: 'deal closing action candidate identified',
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            meta: {
              action_type: 'deal_closing',
              proposed_state: proposal.to_state,
              trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
              amount: opp.amount,
              days_to_close: opp.days_to_close,
            },
          });
        }

        // PR7: Always emit action_skipped
        emitCareAudit({
          tenant_id: tenantUuid,
          entity_type: 'opportunity',
          entity_id: opp.id,
          event_type: CareAuditEventType.ACTION_SKIPPED,
          action_origin: 'care_autonomous',
          reason: 'Autonomous actions disabled (PR7: state persistence only)',
          policy_gate_result: CarePolicyGateResult.ALLOWED,
          meta: { trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT },
        });
      } catch (err) {
        console.warn('[C.A.R.E. PR7] Trigger analysis error (non-breaking):', err.message);
      }
    }

    // ── Florida Real Estate Triggers ──────────────────────────

    // 5. Buyer leads created
    let buyerLeads = [];
    try {
      buyerLeads = await detectBuyerLeadsCreated(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectBuyerLeadsCreated failed, skipping',
      );
    }
    for (const lead of buyerLeads) {
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.BUYER_LEAD_CREATED,
        recordType: 'lead',
        recordId: lead.id,
        context: {
          lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
          lead_type: lead.lead_type,
          property_type: lead.metadata?.property_type || null,
        },
      });
      triggerCount++;
    }

    // 6. Listing/seller leads created
    let listingLeads = [];
    try {
      listingLeads = await detectListingLeadsCreated(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectListingLeadsCreated failed, skipping',
      );
    }
    for (const lead of listingLeads) {
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.LISTING_LEAD_CREATED,
        recordType: 'lead',
        recordId: lead.id,
        context: {
          lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
          lead_type: lead.lead_type,
        },
      });
      triggerCount++;
    }

    // 7. Showings scheduled (first meeting on a lead)
    let showings = [];
    try {
      showings = await detectShowingsScheduled(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectShowingsScheduled failed, skipping',
      );
    }
    for (const activity of showings) {
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.SHOWING_SCHEDULED,
        recordType: 'lead',
        recordId: activity.related_id,
        context: {
          activity_id: activity.id,
          subject: activity.subject,
        },
      });
      triggerCount++;
    }

    // 8. Inspection period open (opp stage = proposal/negotiation)
    let inspectionOpps = [];
    try {
      inspectionOpps = await detectInspectionPeriodsOpen(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectInspectionPeriodsOpen failed, skipping',
      );
    }
    for (const opp of inspectionOpps) {
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.INSPECTION_PERIOD_OPEN,
        recordType: 'opportunity',
        recordId: opp.id,
        context: {
          deal_name: opp.name,
          stage: opp.stage,
          close_date: opp.close_date,
          amount: opp.amount,
          property_type: opp.metadata?.property_type || null,
          year_built: opp.metadata?.year_built || null,
          roof_age: opp.metadata?.roof_age || null,
        },
      });
      triggerCount++;
    }

    // 9. 30 days to closing (insurance binder check)
    let closingThirtyOpps = [];
    try {
      closingThirtyOpps = await detectClosingThirtyDays(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectClosingThirtyDays failed, skipping',
      );
    }
    for (const opp of closingThirtyOpps) {
      const daysToClose = Math.round(
        (new Date(opp.close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.CLOSING_THIRTY_DAYS,
        recordType: 'opportunity',
        recordId: opp.id,
        context: {
          deal_name: opp.name,
          close_date: opp.close_date,
          days_to_close: daysToClose,
          amount: opp.amount,
          flood_zone: opp.metadata?.flood_zone || null,
          property_type: opp.metadata?.property_type || null,
        },
      });
      triggerCount++;
    }

    // 10. Effective date set (Day 0 — sprint kickoff)
    let effectiveDateOpps = [];
    try {
      effectiveDateOpps = await detectEffectiveDateSet(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectEffectiveDateSet failed, skipping',
      );
    }
    for (const opp of effectiveDateOpps) {
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.EFFECTIVE_DATE_SET,
        recordType: 'opportunity',
        recordId: opp.id,
        context: {
          deal_name: opp.name,
          effective_date: opp.metadata?.effective_date,
          close_date: opp.close_date,
          amount: opp.amount,
        },
      });
      triggerCount++;
    }

    // 11. Escrow Day 3 — deposit verification
    let escrowOpps = [];
    try {
      escrowOpps = await detectEscrowDay3(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectEscrowDay3 failed, skipping',
      );
    }
    for (const opp of escrowOpps) {
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.ESCROW_DAY3,
        recordType: 'opportunity',
        recordId: opp.id,
        context: {
          deal_name: opp.name,
          effective_date: opp.metadata?.effective_date,
          close_date: opp.close_date,
        },
      });
      triggerCount++;
    }

    // 12. HOA/condo docs received — 3-day rescission
    let hoaOpps = [];
    try {
      hoaOpps = await detectHoaDocsReceived(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectHoaDocsReceived failed, skipping',
      );
    }
    for (const opp of hoaOpps) {
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.HOA_DOCS_RECEIVED,
        recordType: 'opportunity',
        recordId: opp.id,
        context: {
          deal_name: opp.name,
          hoa_docs_received_date: opp.metadata?.hoa_docs_received_date,
          close_date: opp.close_date,
          property_type: opp.metadata?.property_type || null,
        },
      });
      triggerCount++;
    }

    // 13. Loan commitment Day 30 deadline
    let loanCommitmentOpps = [];
    try {
      loanCommitmentOpps = await detectLoanCommitmentDay30(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectLoanCommitmentDay30 failed, skipping',
      );
    }
    for (const opp of loanCommitmentOpps) {
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.LOAN_COMMITMENT_DAY30,
        recordType: 'opportunity',
        recordId: opp.id,
        context: {
          deal_name: opp.name,
          effective_date: opp.metadata?.effective_date,
          close_date: opp.close_date,
          amount: opp.amount,
        },
      });
      triggerCount++;
    }

    // 14. 3 days to closing — final compliance checklist
    let closingThreeDayOpps = [];
    try {
      closingThreeDayOpps = await detectClosingThreeDays(tenantUuid);
    } catch (detectErr) {
      logger.warn(
        { err: detectErr, tenantSlug },
        '[AiTriggersWorker] detectClosingThreeDays failed, skipping',
      );
    }
    for (const opp of closingThreeDayOpps) {
      const daysToClose = Math.round(
        (new Date(opp.close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      await processTriggeredAction(tenantUuid, {
        triggerId: TRIGGER_TYPES.CLOSING_THREE_DAYS,
        recordType: 'opportunity',
        recordId: opp.id,
        context: {
          deal_name: opp.name,
          close_date: opp.close_date,
          days_to_close: daysToClose,
          amount: opp.amount,
          effective_date: opp.metadata?.effective_date || null,
        },
      });
      triggerCount++;
    }

    if (triggerCount > 0) {
      logger.debug({ tenantSlug, triggerCount }, '[AiTriggersWorker] Triggers detected for tenant');
    }
  } catch (err) {
    logger.error({ err, tenantSlug }, '[AiTriggersWorker] Error processing tenant');
  }

  return triggerCount;
}

/**
 * Detect leads that have been inactive for too long
 * Uses Supabase JS client with simple filters
 */
async function detectStagnantLeads(tenantUuid) {
  const stagnantDate = new Date();
  stagnantDate.setDate(stagnantDate.getDate() - LEAD_STAGNANT_DAYS);

  try {
    // Step 1: Get candidate leads (simple query)
    // Exclude test data records
    const { data: leads, error } = await supabase
      .from('leads')
      .select(
        'id, first_name, last_name, email, phone, status, updated_at, created_at, is_test_data',
      )
      .eq('tenant_id', tenantUuid)
      .not('status', 'in', '(converted,closed,disqualified)')
      .lt('updated_at', stagnantDate.toISOString())
      .or('is_test_data.is.null,is_test_data.eq.false')
      .order('updated_at', { ascending: true })
      .limit(50);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectStagnantLeads error');
      return [];
    }

    // Step 2: Get existing pending suggestions for these leads
    const leadIds = (leads || []).map((l) => l.id);
    if (leadIds.length === 0) return [];

    const { data: existingSuggestions } = await supabase
      .from('ai_suggestions')
      .select('record_id')
      .eq('tenant_id', tenantUuid)
      .eq('trigger_id', TRIGGER_TYPES.LEAD_STAGNANT)
      .eq('status', 'pending')
      .in('record_id', leadIds);

    const existingIds = new Set((existingSuggestions || []).map((s) => s.record_id));

    // Step 3: Filter in JavaScript and calculate days_stagnant
    // Exclude ghost leads (no name, email, or phone — not actionable)
    return (leads || [])
      .filter((lead) => !existingIds.has(lead.id))
      .filter((lead) => {
        const hasName = lead.first_name || lead.last_name;
        const hasContact = lead.email || lead.phone;
        if (!hasName && !hasContact) {
          logger.debug(
            { leadId: lead.id },
            '[AiTriggersWorker] Skipping ghost lead (no name, email, or phone)',
          );
          return false;
        }
        return true;
      })
      .map((lead) => ({
        ...lead,
        days_stagnant: Math.floor(
          (Date.now() - new Date(lead.updated_at || lead.created_at).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
        last_activity_at: null,
      }));
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectStagnantLeads error');
    return [];
  }
}

/**
 * Detect opportunities with no recent activity
 * Uses Supabase JS client with simple filters
 */
async function detectDealDecay(tenantUuid) {
  const decayDate = new Date();
  decayDate.setDate(decayDate.getDate() - DEAL_DECAY_DAYS);

  try {
    // Step 1: Get candidate opportunities (simple query)
    // Exclude test data records
    // Include account_id and lead_id for entity normalization
    const { data: opportunities, error } = await supabase
      .from('opportunities')
      .select(
        'id, name, stage, amount, close_date, updated_at, created_at, is_test_data, account_id, lead_id',
      )
      .eq('tenant_id', tenantUuid)
      .not('stage', 'in', '(closed_won,closed_lost)')
      .lt('updated_at', decayDate.toISOString())
      .or('is_test_data.is.null,is_test_data.eq.false')
      .order('amount', { ascending: false })
      .limit(50);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectDealDecay error');
      return [];
    }

    // Step 2: Get existing pending suggestions
    const oppIds = (opportunities || []).map((o) => o.id);
    if (oppIds.length === 0) return [];

    const { data: existingSuggestions } = await supabase
      .from('ai_suggestions')
      .select('record_id')
      .eq('tenant_id', tenantUuid)
      .eq('trigger_id', TRIGGER_TYPES.DEAL_DECAY)
      .eq('status', 'pending')
      .in('record_id', oppIds);

    const existingIds = new Set((existingSuggestions || []).map((s) => s.record_id));

    // Step 3: Filter in JavaScript and calculate days_inactive
    return (opportunities || [])
      .filter((opp) => !existingIds.has(opp.id))
      .map((deal) => ({
        ...deal,
        days_inactive: Math.floor(
          (Date.now() - new Date(deal.updated_at || deal.created_at).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      }));
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectDealDecay error');
    return [];
  }
}

/**
 * Detect overdue activities
 * Uses Supabase JS client - activities with due_date column (not metadata)
 * Note: activities table uses 'updated_date' not 'updated_at'
 */
async function detectOverdueActivities(tenantUuid) {
  const today = new Date().toISOString().split('T')[0];

  try {
    // Step 1: Get activities with overdue due_date (direct column, not metadata)
    // Filter incomplete activities in JS since status column may not exist
    // Exclude test data records
    // Include related_id to normalize to relationship entity for CARE
    const { data: activities, error } = await supabase
      .from('activities')
      .select('id, subject, type, due_date, metadata, related_to, related_id, is_test_data')
      .eq('tenant_id', tenantUuid)
      .lt('due_date', today)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .limit(100);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectOverdueActivities error');
      return [];
    }

    // Step 2: Filter out completed activities in JavaScript
    // Check both metadata.status and direct status if it exists
    const overdueCandidates = (activities || []).filter((act) => {
      const status = act.status || act.metadata?.status;
      if (status === 'completed' || status === 'cancelled' || status === 'done') return false;
      return true;
    });

    if (overdueCandidates.length === 0) return [];

    // Step 3: Get existing pending suggestions
    const actIds = overdueCandidates.map((a) => a.id);
    const { data: existingSuggestions } = await supabase
      .from('ai_suggestions')
      .select('record_id')
      .eq('tenant_id', tenantUuid)
      .eq('trigger_id', TRIGGER_TYPES.ACTIVITY_OVERDUE)
      .eq('status', 'pending')
      .in('record_id', actIds);

    const existingIds = new Set((existingSuggestions || []).map((s) => s.record_id));

    // Step 4: Filter and calculate days_overdue
    // Include related_id for normalizing to relationship entity
    return overdueCandidates
      .filter((act) => !existingIds.has(act.id))
      .map((activity) => ({
        ...activity,
        days_overdue: Math.floor(
          (Date.now() - new Date(activity.due_date).getTime()) / (1000 * 60 * 60 * 24),
        ),
        related_to: activity.related_to || activity.metadata?.related_to || null,
        related_id: activity.related_id || activity.metadata?.related_id || null,
      }))
      .slice(0, 50);
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectOverdueActivities error');
    return [];
  }
}

/**
 * Detect hot opportunities (high probability, closing soon)
 * Uses Supabase JS client with simple filters
 */
async function detectHotOpportunities(tenantUuid) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 14);
  const today = new Date().toISOString().split('T')[0];
  const futureDateStr = futureDate.toISOString().split('T')[0];

  try {
    // Step 1: Get candidate opportunities (simple query)
    // Exclude test data records
    // Include account_id and lead_id for entity normalization
    const { data: opportunities, error } = await supabase
      .from('opportunities')
      .select('id, name, stage, amount, probability, close_date, is_test_data, account_id, lead_id')
      .eq('tenant_id', tenantUuid)
      .not('stage', 'in', '(closed_won,closed_lost)')
      .gte('probability', 70)
      .gte('close_date', today)
      .lte('close_date', futureDateStr)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .order('amount', { ascending: false })
      .limit(20);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectHotOpportunities error');
      return [];
    }

    // Step 2: Get existing pending suggestions
    const oppIds = (opportunities || []).map((o) => o.id);
    if (oppIds.length === 0) return [];

    const { data: existingSuggestions } = await supabase
      .from('ai_suggestions')
      .select('record_id')
      .eq('tenant_id', tenantUuid)
      .eq('trigger_id', TRIGGER_TYPES.OPPORTUNITY_HOT)
      .eq('status', 'pending')
      .in('record_id', oppIds);

    const existingIds = new Set((existingSuggestions || []).map((s) => s.record_id));

    // Step 3: Filter in JavaScript and calculate days_to_close
    return (opportunities || [])
      .filter((opp) => !existingIds.has(opp.id))
      .map((opp) => ({
        ...opp,
        days_to_close: Math.floor(
          (new Date(opp.close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        ),
      }));
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectHotOpportunities error');
    return [];
  }
}

// ============================================================
// Florida Real Estate Trigger Detectors
// ============================================================

/**
 * Helper: get existing playbook execution IDs to deduplicate FL triggers.
 * Uses care_playbook_execution (not ai_suggestions) since these route to playbooks.
 * Returns a Set of entity_ids that have a recent non-skipped execution.
 */
async function getRecentPlaybookExecutionIds(tenantUuid, triggerType, windowHours = 25) {
  try {
    const cutoff = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from('care_playbook_execution')
      .select('entity_id')
      .eq('tenant_id', tenantUuid)
      .eq('trigger_type', triggerType)
      .neq('status', 'cooldown_skipped')
      .gte('started_at', cutoff);
    return new Set((data || []).map((r) => r.entity_id));
  } catch (_) {
    return new Set(); // fail open
  }
}

/**
 * Detect new buyer leads (lead_type = 'buyer') created in the last 25 hours.
 * Fires PB-001: Buyer Lead — Property Type Triage
 */
async function detectBuyerLeadsCreated(tenantUuid) {
  try {
    const since = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, first_name, last_name, lead_type, status, metadata, created_at')
      .eq('tenant_id', tenantUuid)
      .eq('lead_type', 'buyer')
      .gte('created_at', since)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .limit(50);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectBuyerLeadsCreated error');
      return [];
    }

    const existingIds = await getRecentPlaybookExecutionIds(
      tenantUuid,
      TRIGGER_TYPES.BUYER_LEAD_CREATED,
    );
    return (leads || []).filter((l) => !existingIds.has(l.id));
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectBuyerLeadsCreated error');
    return [];
  }
}

/**
 * Detect new seller/listing leads (lead_type = 'seller') created in the last 25 hours.
 * Fires PB-004: Listing Lead — Seller Insurance Prep
 */
async function detectListingLeadsCreated(tenantUuid) {
  try {
    const since = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, first_name, last_name, lead_type, status, metadata, created_at')
      .eq('tenant_id', tenantUuid)
      .eq('lead_type', 'seller')
      .gte('created_at', since)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .limit(50);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectListingLeadsCreated error');
      return [];
    }

    const existingIds = await getRecentPlaybookExecutionIds(
      tenantUuid,
      TRIGGER_TYPES.LISTING_LEAD_CREATED,
    );
    return (leads || []).filter((l) => !existingIds.has(l.id));
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectListingLeadsCreated error');
    return [];
  }
}

/**
 * Detect the first-ever meeting activity scheduled for a lead (created in last 25 hours).
 * Fires PB-005: Pre-Showing — Compliance Check
 * "First ever" is enforced by checking playbook_execution history with no time bound,
 * and by verifying the activity is the earliest meeting on record for that lead.
 */
async function detectShowingsScheduled(tenantUuid) {
  try {
    const since = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const { data: activities, error } = await supabase
      .from('activities')
      .select('id, related_id, related_to, subject, created_at')
      .eq('tenant_id', tenantUuid)
      .eq('type', 'meeting')
      .eq('related_to', 'lead')
      .gte('created_at', since)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .limit(50);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectShowingsScheduled error');
      return [];
    }

    if (!activities || activities.length === 0) return [];

    // Only fire for leads that have never had this playbook triggered (unbounded lookback)
    const alreadyFiredIds = await getRecentPlaybookExecutionIds(
      tenantUuid,
      TRIGGER_TYPES.SHOWING_SCHEDULED,
      // Use a 10-year window to approximate "first ever" without a full table scan
      87600,
    );

    // Among candidates, keep only those where this is the earliest meeting for the lead
    const candidateLeadIds = [
      ...new Set(
        (activities || [])
          .filter((a) => a.related_id && !alreadyFiredIds.has(a.related_id))
          .map((a) => a.related_id),
      ),
    ];

    if (candidateLeadIds.length === 0) return [];

    // Verify these are actually first-ever meetings: no earlier meeting exists for each lead
    const { data: earlierMeetings } = await supabase
      .from('activities')
      .select('related_id, created_at')
      .eq('tenant_id', tenantUuid)
      .eq('type', 'meeting')
      .eq('related_to', 'lead')
      .in('related_id', candidateLeadIds)
      .lt('created_at', since)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .limit(200);

    // Leads with a pre-existing meeting are excluded — this would not be their first showing
    const leadsWithPriorMeeting = new Set((earlierMeetings || []).map((m) => m.related_id));

    return (activities || []).filter(
      (a) =>
        a.related_id &&
        !alreadyFiredIds.has(a.related_id) &&
        !leadsWithPriorMeeting.has(a.related_id),
    );
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectShowingsScheduled error');
    return [];
  }
}

/**
 * Detect opportunities where stage entered proposal/negotiation in last 25 hours.
 * Fires PB-002: Inspection Period — Insurance Risk Flags
 */
async function detectInspectionPeriodsOpen(tenantUuid) {
  try {
    const since = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const { data: opps, error } = await supabase
      .from('opportunities')
      .select('id, name, stage, close_date, amount, metadata, updated_at')
      .eq('tenant_id', tenantUuid)
      .in('stage', ['proposal', 'negotiation'])
      .gte('updated_at', since)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .limit(50);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectInspectionPeriodsOpen error');
      return [];
    }

    const existingIds = await getRecentPlaybookExecutionIds(
      tenantUuid,
      TRIGGER_TYPES.INSPECTION_PERIOD_OPEN,
      168, // 7-day window — fire once per opportunity per week
    );
    return (opps || []).filter((o) => !existingIds.has(o.id));
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectInspectionPeriodsOpen error');
    return [];
  }
}

/**
 * Detect opportunities where close_date is 25–35 days out.
 * Fires PB-003: 30 Days to Close — Insurance Binder Checklist
 */
async function detectClosingThirtyDays(tenantUuid) {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 25 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const windowEnd = new Date(now.getTime() + 35 * 24 * 3600 * 1000).toISOString().split('T')[0];

    const { data: opps, error } = await supabase
      .from('opportunities')
      .select('id, name, stage, close_date, amount, metadata')
      .eq('tenant_id', tenantUuid)
      .not('stage', 'in', '(closed_won,closed_lost)')
      .gte('close_date', windowStart)
      .lte('close_date', windowEnd)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .limit(50);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectClosingThirtyDays error');
      return [];
    }

    const existingIds = await getRecentPlaybookExecutionIds(
      tenantUuid,
      TRIGGER_TYPES.CLOSING_THIRTY_DAYS,
      48, // 48-hour window — fire once per opportunity per 2 days
    );
    return (opps || []).filter((o) => !existingIds.has(o.id));
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectClosingThirtyDays error');
    return [];
  }
}

/**
 * Detect opportunities where metadata.effective_date was set in the last 25 hours.
 * Fires PB-006: Effective Date — Transaction Sprint Kickoff
 *
 * Note: effective_date is stored as YYYY-MM-DD string in opportunity metadata.
 * Agents set this when the contract is fully executed (Day 0).
 */
async function detectEffectiveDateSet(tenantUuid) {
  try {
    const since = new Date(Date.now() - 25 * 3600 * 1000).toISOString();

    // Step 1: Get opportunities updated recently with effective_date in metadata
    const { data: opps, error } = await supabase
      .from('opportunities')
      .select('id, name, stage, close_date, amount, metadata, updated_at')
      .eq('tenant_id', tenantUuid)
      .not('stage', 'in', '(closed_won,closed_lost)')
      .filter('metadata->>effective_date', 'not.is', null)
      .gte('updated_at', since)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .limit(50);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectEffectiveDateSet error');
      return [];
    }

    const existingIds = await getRecentPlaybookExecutionIds(
      tenantUuid,
      TRIGGER_TYPES.EFFECTIVE_DATE_SET,
      99999, // fire exactly once per opportunity — very long window
    );
    return (opps || []).filter((o) => o.metadata?.effective_date && !existingIds.has(o.id));
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectEffectiveDateSet error');
    return [];
  }
}

/**
 * Detect opportunities where effective_date was 2–4 days ago.
 * Fires PB-007: Day 3 — Escrow Deposit Verification
 */
async function detectEscrowDay3(tenantUuid) {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 4 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const windowEnd = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString().split('T')[0];

    const { data: opps, error } = await supabase
      .from('opportunities')
      .select('id, name, stage, close_date, amount, metadata')
      .eq('tenant_id', tenantUuid)
      .not('stage', 'in', '(closed_won,closed_lost)')
      .filter('metadata->>effective_date', 'not.is', null)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .limit(100);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectEscrowDay3 error');
      return [];
    }

    // JS filter: effective_date falls in the 2–4 day window
    const candidates = (opps || []).filter((o) => {
      const ed = o.metadata?.effective_date;
      if (!ed) return false;
      return ed >= windowStart && ed <= windowEnd;
    });

    if (candidates.length === 0) return [];

    const existingIds = await getRecentPlaybookExecutionIds(
      tenantUuid,
      TRIGGER_TYPES.ESCROW_DAY3,
      99999, // fire exactly once per opportunity
    );
    return candidates.filter((o) => !existingIds.has(o.id));
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectEscrowDay3 error');
    return [];
  }
}

/**
 * Detect opportunities where metadata.hoa_docs_received_date was set in last 25 hours.
 * Fires PB-008: Condo/HOA Docs — 3-Day Rescission Tracker
 *
 * Note: hoa_docs_received_date is set by the agent (or AiSHA) when docs are delivered.
 */
async function detectHoaDocsReceived(tenantUuid) {
  try {
    const since = new Date(Date.now() - 25 * 3600 * 1000).toISOString();

    const { data: opps, error } = await supabase
      .from('opportunities')
      .select('id, name, stage, close_date, amount, metadata, updated_at')
      .eq('tenant_id', tenantUuid)
      .not('stage', 'in', '(closed_won,closed_lost)')
      .filter('metadata->>hoa_docs_received_date', 'not.is', null)
      .gte('updated_at', since)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .limit(50);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectHoaDocsReceived error');
      return [];
    }

    const existingIds = await getRecentPlaybookExecutionIds(
      tenantUuid,
      TRIGGER_TYPES.HOA_DOCS_RECEIVED,
      99999, // fire exactly once per opportunity
    );
    return (opps || []).filter((o) => o.metadata?.hoa_docs_received_date && !existingIds.has(o.id));
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectHoaDocsReceived error');
    return [];
  }
}

/**
 * Detect opportunities where effective_date was 26–30 days ago.
 * Fires PB-009: Day 30 — Loan Commitment Deadline
 */
async function detectLoanCommitmentDay30(tenantUuid) {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const windowEnd = new Date(now.getTime() - 26 * 24 * 3600 * 1000).toISOString().split('T')[0];

    const { data: opps, error } = await supabase
      .from('opportunities')
      .select('id, name, stage, close_date, amount, metadata')
      .eq('tenant_id', tenantUuid)
      .not('stage', 'in', '(closed_won,closed_lost)')
      .filter('metadata->>effective_date', 'not.is', null)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .limit(100);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectLoanCommitmentDay30 error');
      return [];
    }

    const candidates = (opps || []).filter((o) => {
      const ed = o.metadata?.effective_date;
      if (!ed) return false;
      return ed >= windowStart && ed <= windowEnd;
    });

    if (candidates.length === 0) return [];

    const existingIds = await getRecentPlaybookExecutionIds(
      tenantUuid,
      TRIGGER_TYPES.LOAN_COMMITMENT_DAY30,
      99999,
    );
    return candidates.filter((o) => !existingIds.has(o.id));
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectLoanCommitmentDay30 error');
    return [];
  }
}

/**
 * Detect opportunities where close_date is 2–4 days out.
 * Fires PB-010: 3 Days to Close — Final Compliance Checklist
 */
async function detectClosingThreeDays(tenantUuid) {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const windowEnd = new Date(now.getTime() + 4 * 24 * 3600 * 1000).toISOString().split('T')[0];

    const { data: opps, error } = await supabase
      .from('opportunities')
      .select('id, name, stage, close_date, amount, metadata')
      .eq('tenant_id', tenantUuid)
      .not('stage', 'in', '(closed_won,closed_lost)')
      .gte('close_date', windowStart)
      .lte('close_date', windowEnd)
      .or('is_test_data.is.null,is_test_data.eq.false')
      .limit(50);

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] detectClosingThreeDays error');
      return [];
    }

    const existingIds = await getRecentPlaybookExecutionIds(
      tenantUuid,
      TRIGGER_TYPES.CLOSING_THREE_DAYS,
      48,
    );
    return (opps || []).filter((o) => !existingIds.has(o.id));
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectClosingThreeDays error');
    return [];
  }
}

/**
 * Create a suggestion if one doesn't already exist for this trigger+record
 * Uses Supabase JS client for insert
 *
 * @param {string} tenantUuid
 * @param {object} triggerData
 * @param {object} [_deps] — optional dependency overrides for testing
 */
/**
 * Route trigger through playbook if configured, otherwise create suggestion.
 * This is the single entry point for all trigger processing — replaces direct
 * calls to createSuggestionIfNew in the trigger loops.
 *
 * @param {string} tenantUuid - Tenant UUID
 * @param {object} triggerData - Same shape as createSuggestionIfNew expects
 * @returns {string|null} Suggestion ID if created, or null
 */
async function processTriggeredAction(tenantUuid, triggerData) {
  try {
    // Try playbook first
    const playbookResult = await routeTriggerToPlaybook(tenantUuid, triggerData);

    if (playbookResult) {
      // Playbook handled it — log and skip suggestion creation
      logger.info(
        {
          tenantId: tenantUuid,
          triggerId: triggerData.triggerId,
          recordId: triggerData.recordId,
          playbookStatus: playbookResult.status,
          executionId: playbookResult.executionId,
        },
        '[AiTriggersWorker] Trigger routed to playbook',
      );
      return null;
    }

    // No playbook → fall through to existing suggestion creation
    return await createSuggestionIfNew(tenantUuid, triggerData);
  } catch (err) {
    // If playbook router throws, fall through to suggestions as safety net
    logger.warn(
      { err, triggerId: triggerData.triggerId },
      '[AiTriggersWorker] Playbook router error — falling back to suggestion',
    );
    return await createSuggestionIfNew(tenantUuid, triggerData);
  }
}

export async function createSuggestionIfNew(tenantUuid, triggerData, _deps = {}) {
  const _supabase = _deps.supabase || supabase;
  const _generate = _deps.generateAiSuggestion || generateAiSuggestion;
  const _webhooks = _deps.emitTenantWebhooks || emitTenantWebhooks;
  const _log = _deps.logger || logger;
  const _audit = _deps.emitCareAudit || emitCareAudit;

  const { triggerId, recordType, recordId, context, priority = 'normal' } = triggerData;
  let outcomeType = OUTCOME_TYPES.error; // default: catch-all
  let suggestionId = null;

  try {
    // Check if there's already a pending OR recently rejected suggestion for this trigger+record
    // Cooldown: Don't recreate suggestions rejected within the last 7 days
    const cooldownDays = 7;
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - cooldownDays);

    const { data: existing, error: checkError } = await _supabase
      .from('ai_suggestions')
      .select('id, status, updated_at')
      .eq('tenant_id', tenantUuid)
      .eq('trigger_id', triggerId)
      .eq('record_id', recordId)
      .or(`status.eq.pending,and(status.eq.rejected,updated_at.gte.${cooldownDate.toISOString()})`)
      .limit(1);

    if (checkError) {
      _log.error({ err: checkError }, '[AiTriggersWorker] Error checking existing suggestion');
    }

    if (existing && existing.length > 0) {
      const existingStatus = existing[0].status;
      outcomeType = OUTCOME_TYPES.duplicate_suppressed;
      _log.debug(
        { triggerId, recordId, existingStatus, outcomeType },
        '[AiTriggersWorker] Skipping - existing suggestion',
      );
      return null;
    }

    // Generate AI suggestion using propose_actions mode
    const suggestion = await _generate(tenantUuid, triggerId, recordType, recordId, context);

    if (!suggestion) {
      outcomeType = OUTCOME_TYPES.generation_failed;
      _log.debug(
        { triggerId, recordId, outcomeType },
        '[AiTriggersWorker] No suggestion generated',
      );
      return null;
    }

    // Confidence gate — suppress low-confidence suggestions before INSERT
    const MIN_CONFIDENCE = 0.7;
    const confidence = suggestion.confidence ?? 0;
    if (confidence < MIN_CONFIDENCE) {
      outcomeType = OUTCOME_TYPES.low_confidence;
      _log.debug(
        { triggerId, recordId, confidence, MIN_CONFIDENCE, outcomeType },
        '[AiTriggersWorker] Suggestion below confidence threshold',
      );
      return null;
    }

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SUGGESTION_EXPIRY_DAYS);

    // Insert suggestion using Supabase JS client
    const { data, error } = await _supabase
      .from('ai_suggestions')
      .insert({
        tenant_id: tenantUuid,
        trigger_id: triggerId,
        trigger_context: context,
        record_type: recordType,
        record_id: recordId,
        action: suggestion.action,
        confidence: suggestion.confidence || 0.75,
        reasoning: suggestion.reasoning || '',
        priority,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
        outcome_type: OUTCOME_TYPES.suggestion_created,
      })
      .select('id')
      .single();

    if (error) {
      // Check if it's a duplicate (constraint violation)
      if (error.code === '23505') {
        outcomeType = OUTCOME_TYPES.constraint_violation;
        _log.debug(
          { triggerId, recordId, outcomeType },
          '[AiTriggersWorker] Suggestion already exists',
        );
        return null;
      }
      outcomeType = OUTCOME_TYPES.error;
      _log.error(
        { err: error, triggerId, recordId, outcomeType },
        '[AiTriggersWorker] Error inserting suggestion',
      );
      return null;
    }

    if (data) {
      suggestionId = data.id;
      outcomeType = OUTCOME_TYPES.suggestion_created;
      _log.info(
        { suggestionId: data.id, triggerId, recordId, outcomeType },
        '[AiTriggersWorker] Created suggestion',
      );

      // Emit webhook for new suggestion
      await _webhooks(tenantUuid, 'ai.suggestion.generated', {
        suggestion_id: data.id,
        trigger_id: triggerId,
        record_type: recordType,
        record_id: recordId,
        priority,
      }).catch((err) => _log.error({ err }, '[AiTriggersWorker] Webhook emission failed'));

      outcomeType = OUTCOME_TYPES.suggestion_created;
      return data.id;
    }

    outcomeType = OUTCOME_TYPES.error;
    return null;
  } catch (err) {
    outcomeType = OUTCOME_TYPES.error;
    _log.error(
      { err, triggerId, recordId, outcomeType },
      '[AiTriggersWorker] Error creating suggestion',
    );
    return null;
  } finally {
    // Emit ACTION_OUTCOME audit for every trigger evaluation (fire-and-forget)
    try {
      _audit({
        tenant_id: tenantUuid,
        entity_type: 'ai_suggestion',
        entity_id: suggestionId || recordId,
        event_type: CareAuditEventType.ACTION_OUTCOME,
        action_origin: 'care_autonomous',
        reason: `Trigger evaluation outcome: ${outcomeType}`,
        policy_gate_result: CarePolicyGateResult.ALLOWED,
        meta: {
          trigger_id: triggerId,
          record_type: recordType,
          record_id: recordId,
          outcome_type: outcomeType,
          suggestion_id: suggestionId,
        },
      });
    } catch (auditErr) {
      _log.error(
        { err: auditErr, triggerId, recordId, outcomeType },
        '[AiTriggersWorker] ACTION_OUTCOME audit emission failed',
      );
    }
  }
}

/**
 * Generate AI suggestion using AI Brain in propose_actions mode
 * Stage 2 Implementation: Full AI Brain integration with fallback to templates
 */
async function generateAiSuggestion(tenantUuid, triggerId, recordType, recordId, context) {
  // Check if AI-powered suggestions are enabled
  const useAiBrain = process.env.AI_SUGGESTIONS_USE_BRAIN === 'true';

  if (useAiBrain) {
    try {
      const brainSuggestion = await generateAiBrainSuggestion(
        tenantUuid,
        triggerId,
        recordType,
        recordId,
        context,
      );
      if (brainSuggestion) {
        return brainSuggestion;
      }
    } catch (brainError) {
      logger.warn(
        { err: brainError },
        '[AiTriggersWorker] AI Brain suggestion failed, falling back to templates',
      );
    }
  }

  // Fallback to deterministic templates
  return generateTemplateSuggestion(triggerId, recordType, recordId, context);
}

/**
 * Generate suggestion using AI Brain with propose_actions mode
 */
async function generateAiBrainSuggestion(tenantUuid, triggerId, recordType, recordId, context) {
  // System user ID for autonomous operations
  const systemUserId = safeSystemUserId();
  if (!systemUserId) {
    logger.warn(
      '[AiTriggersWorker] SYSTEM_USER_ID is invalid or unset; skipping AI Brain suggestion',
    );
    return null;
  }

  const taskContext = {
    trigger_type: triggerId,
    record_type: recordType,
    record_id: recordId,
    trigger_context: context,
    instruction: `Analyze this ${triggerId} trigger and propose the best action to take. Return a single proposed action.`,
  };

  const taskType = mapTriggerToTaskType(triggerId);

  try {
    const result = await runAiBrainTask({
      tenantId: tenantUuid,
      userId: systemUserId,
      taskType,
      mode: 'propose_actions',
      context: taskContext,
    });

    // Extract proposed action from AI Brain result
    if (result?.proposed_actions?.length > 0) {
      const proposed = result.proposed_actions[0];

      return {
        action: {
          tool_name: `${proposed.type}_${proposed.entity}`,
          tool_args: proposed.payload || {},
        },
        confidence: proposed.confidence || 0.75,
        reasoning: proposed.reason || result.summary || 'AI Brain suggested this action.',
      };
    }

    // If AI Brain didn't propose actions, return null to fall back to templates
    return null;
  } catch (error) {
    logger.error({ err: error, triggerId }, '[AiTriggersWorker] AI Brain error');
    throw error;
  }
}

/**
 * Map trigger type to AI Brain task type
 */
function mapTriggerToTaskType(triggerId) {
  const taskTypeMap = {
    [TRIGGER_TYPES.LEAD_STAGNANT]: 'lead_followup_suggestion',
    [TRIGGER_TYPES.DEAL_DECAY]: 'opportunity_engagement_suggestion',
    [TRIGGER_TYPES.DEAL_REGRESSION]: 'opportunity_recovery_suggestion',
    [TRIGGER_TYPES.ACCOUNT_RISK]: 'account_risk_mitigation',
    [TRIGGER_TYPES.ACTIVITY_OVERDUE]: 'activity_reschedule_suggestion',
    [TRIGGER_TYPES.CONTACT_INACTIVE]: 'contact_reengagement_suggestion',
    [TRIGGER_TYPES.OPPORTUNITY_HOT]: 'opportunity_closing_suggestion',
    [TRIGGER_TYPES.FOLLOWUP_NEEDED]: 'followup_action_suggestion',
  };

  return taskTypeMap[triggerId] || 'general_crm_suggestion';
}

/**
 * Generate suggestion using deterministic templates (fallback)
 */
function generateTemplateSuggestion(triggerId, _recordType, recordId, context) {
  const suggestionTemplates = {
    [TRIGGER_TYPES.LEAD_STAGNANT]: {
      action: {
        tool_name: 'create_activity',
        tool_args: {
          type: 'task',
          subject: `Follow up with ${context.lead_name || 'lead'}`,
          body: `This lead has been inactive for ${context.days_stagnant} days. Consider reaching out to re-engage.`,
          related_to: 'lead',
          related_id: recordId,
        },
      },
      confidence: 0.8,
      reasoning: `Lead "${context.lead_name}" has been stagnant for ${context.days_stagnant} days. A follow-up task is recommended to re-engage.`,
    },

    [TRIGGER_TYPES.DEAL_DECAY]: {
      action: {
        tool_name: 'create_activity',
        tool_args: {
          type: 'call',
          subject: `Check in on ${context.deal_name || 'opportunity'}`,
          body: `This deal has had no activity for ${context.days_inactive} days. Stage: ${context.stage}. Amount: $${context.amount || 0}.`,
          related_to: 'opportunity',
          related_id: recordId,
        },
      },
      confidence: 0.85,
      reasoning: `Opportunity "${context.deal_name}" (${context.stage}) has been inactive for ${context.days_inactive} days. A check-in call is recommended.`,
    },

    [TRIGGER_TYPES.ACTIVITY_OVERDUE]: {
      action: {
        tool_name: 'update_activity',
        tool_args: {
          activity_id: recordId,
          updates: {
            status: 'pending',
            metadata: {
              reschedule_needed: true,
              original_due_date: context.due_date,
            },
          },
        },
      },
      confidence: 0.7,
      reasoning: `Activity "${context.subject}" is ${context.days_overdue} days overdue. Consider rescheduling or completing.`,
    },

    [TRIGGER_TYPES.OPPORTUNITY_HOT]: {
      action: {
        tool_name: 'create_activity',
        tool_args: {
          type: 'meeting',
          subject: `Close ${context.deal_name || 'high-priority deal'}`,
          body: `Hot opportunity! ${context.probability}% probability, closing in ${context.days_to_close} days. Amount: $${context.amount || 0}.`,
          related_to: 'opportunity',
          related_id: recordId,
        },
      },
      confidence: 0.9,
      reasoning: `Opportunity "${context.deal_name}" is hot (${context.probability}% probability) and closing in ${context.days_to_close} days. Schedule a meeting to close.`,
    },
  };

  return suggestionTemplates[triggerId] || null;
}

/**
 * Expire old pending suggestions
 * Uses Supabase JS client
 */
async function expireOldSuggestions() {
  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('ai_suggestions')
      .update({ status: 'expired', updated_at: now })
      .eq('status', 'pending')
      .lt('expires_at', now)
      .select('id');

    if (error) {
      logger.error({ err: error }, '[AiTriggersWorker] Error expiring suggestions');
      return;
    }

    if (data && data.length > 0) {
      logger.debug({ count: data.length }, '[AiTriggersWorker] Expired old suggestions');
    }
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] Error expiring suggestions');
  }
}

/**
 * Hash string to integer for advisory lock (reserved for future use)
 */
function _hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Manual trigger for testing - process triggers for a specific tenant
 */
export async function triggerForTenant(_pool, tenantUuid) {
  const supa = getSupabaseClient();

  const { data: tenantData, error: tenantError } = await supa
    .from('tenant')
    .select('id, tenant_id, name')
    .eq('id', tenantUuid)
    .single();

  if (tenantError || !tenantData) {
    throw new Error('Tenant not found');
  }

  // Temporarily set supabase if not already set
  const prevSupabase = supabase;
  supabase = supa;

  try {
    const triggers = await processTriggersForTenant(tenantData);
    return { triggers_detected: triggers };
  } finally {
    supabase = prevSupabase;
  }
}

/**
 * Get pending suggestions for a tenant
 * Uses Supabase JS client with simple query
 */
export async function getPendingSuggestions(_pool, tenantUuid, limit = 50) {
  const supa = getSupabaseClient();

  // Simple query - get suggestions
  const { data: suggestions, error } = await supa
    .from('ai_suggestions')
    .select('*')
    .eq('tenant_id', tenantUuid)
    .eq('status', 'pending')
    .order('priority', { ascending: true }) // urgent=1, high=2, normal=3, low=4 order
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error({ err: error, tenantUuid }, '[AiTriggersWorker] getPendingSuggestions error');
    return [];
  }

  // Enrich with record names in JavaScript
  const enriched = await Promise.all(
    (suggestions || []).map(async (s) => {
      let recordName = null;
      try {
        if (s.record_type === 'lead') {
          const { data } = await supa
            .from('leads')
            .select('first_name, last_name')
            .eq('id', s.record_id)
            .single();
          recordName = data ? `${data.first_name || ''} ${data.last_name || ''}`.trim() : null;
        } else if (s.record_type === 'opportunity') {
          const { data } = await supa
            .from('opportunities')
            .select('name')
            .eq('id', s.record_id)
            .single();
          recordName = data?.name || null;
        } else if (s.record_type === 'activity') {
          const { data } = await supa
            .from('activities')
            .select('subject')
            .eq('id', s.record_id)
            .single();
          recordName = data?.subject || null;
        }
      } catch {
        // Ignore enrichment errors
      }
      return { ...s, record_name: recordName };
    }),
  );

  return enriched;
}
