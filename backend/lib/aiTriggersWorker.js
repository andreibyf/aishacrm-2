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
import logger from './logger.js';

// PR6: C.A.R.E. shadow wiring (read-only analysis, no behavior change)
import { detectEscalation } from './care/careEscalationDetector.js';
import { proposeTransition, applyTransition } from './care/careStateEngine.js';
import { emitCareAudit } from './care/careAuditEmitter.js';
import { signalsFromTrigger, buildTriggerEscalationText } from './care/careTriggerSignalAdapter.js';
import { CareAuditEventType, CarePolicyGateResult } from './care/careAuditTypes.js';
// PR7: State persistence and policy gate
import { getCareState, upsertCareState, appendCareHistory } from './care/careStateStore.js';
import { isCareStateWriteEnabled } from './care/isCareStateWriteEnabled.js';

let workerInterval = null;
let supabase = null;

// Trigger configuration defaults
const DEFAULT_INTERVAL_MS = 60000; // 1 minute
const LEAD_STAGNANT_DAYS = 7;
const DEAL_DECAY_DAYS = 14;
const SUGGESTION_EXPIRY_DAYS = 7;

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

  logger.info({ intervalMs }, '[AiTriggersWorker] Starting');
  
  // Run immediately on start
  processAllTriggers().catch(err => 
    logger.error({ err }, '[AiTriggersWorker] Initial run error')
  );

  // Then run on interval
  workerInterval = setInterval(() => {
    processAllTriggers().catch(err => 
      logger.error({ err }, '[AiTriggersWorker] Error')
    );
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
    
    for (const tenant of (tenants || [])) {
      try {
        const tenantTriggers = await processTriggersForTenant(tenant);
        totalTriggers += tenantTriggers;
      } catch (tenantErr) {
        logger.error({ err: tenantErr, tenantSlug: tenant.tenant_id }, '[AiTriggersWorker] Error processing tenant');
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
 * Process all triggers for a specific tenant
 */
async function processTriggersForTenant(tenant) {
  const { id: tenantUuid, tenant_id: tenantSlug } = tenant;
  let triggerCount = 0;

  try {
    // 1. Detect stagnant leads
    const stagnantLeads = await detectStagnantLeads(tenantUuid);
    for (const lead of stagnantLeads) {
      await createSuggestionIfNew(tenantUuid, {
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
          entity_id: lead.id
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
        if (escalation.is_escalation) {
          emitCareAudit(CareAuditEventType.ESCALATION_DETECTED, {
            action_origin: CareActionOrigin.CARE_AUTONOMOUS,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            reason: escalation.reason,
            trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
            record_type: 'lead',
            record_id: lead.id,
            metadata: { severity: escalation.severity },
          });
        }

        const proposal = proposeTransition({
          current_state: currentState, // PR7: real state from DB
          signals,
          action_origin: CareActionOrigin.CARE_AUTONOMOUS,
        });

        if (proposal.proposed_state) {
          // Always emit state_proposed
          emitCareAudit(CareAuditEventType.STATE_PROPOSED, {
            action_origin: CareActionOrigin.CARE_AUTONOMOUS,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            current_state: currentState,
            proposed_state: proposal.proposed_state,
            reason: proposal.reason,
            trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
            record_type: 'lead',
            record_id: lead.id,
          });

          // PR7: Conditionally apply transition if state write gate enabled
          if (isCareStateWriteEnabled()) {
            try {
              await applyTransition({
                ctx,
                from_state: currentState,
                to_state: proposal.proposed_state,
                reason: proposal.reason,
                action_origin: CareActionOrigin.CARE_AUTONOMOUS,
                meta: { trigger_type: TRIGGER_TYPES.LEAD_STAGNANT, signals }
              });

              emitCareAudit(CareAuditEventType.STATE_APPLIED, {
                action_origin: CareActionOrigin.CARE_AUTONOMOUS,
                policy_gate_result: CarePolicyGateResult.ALLOWED,
                reason: `State applied: ${currentState} → ${proposal.proposed_state}`,
                trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
                record_type: 'lead',
                record_id: lead.id,
                metadata: { from_state: currentState, to_state: proposal.proposed_state }
              });
            } catch (applyError) {
              logger.warn({ err: applyError }, '[AiTriggers] C.A.R.E. state apply error');
            }
          }
        }

        // Emit action candidate for meaningful follow-ups (logs only)
        if (proposal.proposed_state && ['awareness', 'engagement'].includes(proposal.proposed_state)) {
          emitCareAudit(CareAuditEventType.ACTION_CANDIDATE, {
            action_origin: CareActionOrigin.CARE_AUTONOMOUS,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            action_type: 'follow_up',
            proposed_state: proposal.proposed_state,
            trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
            record_type: 'lead',
            record_id: lead.id,
            metadata: { silence_days: signals.silence_days },
          });
        }

        // PR7: Always emit action_skipped
        emitCareAudit(CareAuditEventType.ACTION_SKIPPED, {
          action_origin: CareActionOrigin.CARE_AUTONOMOUS,
          policy_gate_result: CarePolicyGateResult.ALLOWED,
          reason: 'Autonomous actions disabled (PR7: state persistence only)',
          trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
          record_type: 'lead',
          record_id: lead.id,
        });
      } catch (err) {
        console.warn('[C.A.R.E. PR7] Trigger analysis error (non-breaking):', err.message);
      }
    }

    // 2. Detect deal decay (opportunities with no activity)
    const decayingDeals = await detectDealDecay(tenantUuid);
    for (const deal of decayingDeals) {
      await createSuggestionIfNew(tenantUuid, {
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
          entity_id: deal.id
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
        if (escalation.is_escalation) {
          emitCareAudit(CareAuditEventType.ESCALATION_DETECTED, {
            action_origin: CareActionOrigin.CARE_AUTONOMOUS,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            reason: escalation.reason,
            trigger_type: TRIGGER_TYPES.DEAL_DECAY,
            record_type: 'opportunity',
            record_id: deal.id,
            metadata: { severity: escalation.severity, amount: deal.amount },
          });
        }

        const proposal = proposeTransition({
          current_state: currentState,
          signals,
          action_origin: CareActionOrigin.CARE_AUTONOMOUS,
        });

        if (proposal.proposed_state) {
          // Always emit state_proposed
          emitCareAudit(CareAuditEventType.STATE_PROPOSED, {
            action_origin: CareActionOrigin.CARE_AUTONOMOUS,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            current_state: currentState,
            proposed_state: proposal.proposed_state,
            reason: proposal.reason,
            trigger_type: TRIGGER_TYPES.DEAL_DECAY,
            record_type: 'opportunity',
            record_id: deal.id,
          });

          // PR7: Conditionally apply transition if state write gate enabled
          if (isCareStateWriteEnabled()) {
            try {
              await applyTransition({
                ctx,
                from_state: currentState,
                to_state: proposal.proposed_state,
                reason: proposal.reason,
                action_origin: CareActionOrigin.CARE_AUTONOMOUS,
                meta: { trigger_type: TRIGGER_TYPES.DEAL_DECAY, amount: deal.amount, signals }
              });

              emitCareAudit(CareAuditEventType.STATE_APPLIED, {
                action_origin: CareActionOrigin.CARE_AUTONOMOUS,
                policy_gate_result: CarePolicyGateResult.ALLOWED,
                reason: `State applied: ${currentState} → ${proposal.proposed_state}`,
                trigger_type: TRIGGER_TYPES.DEAL_DECAY,
                record_type: 'opportunity',
                record_id: deal.id,
                metadata: { from_state: currentState, to_state: proposal.proposed_state }
              });
            } catch (applyError) {
              logger.warn({ err: applyError }, '[AiTriggers] C.A.R.E. state apply error');
            }
          }
        }

        if (proposal.proposed_state && deal.amount > 10000) {
          emitCareAudit(CareAuditEventType.ACTION_CANDIDATE, {
            action_origin: CareActionOrigin.CARE_AUTONOMOUS,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            action_type: 'deal_revival',
            proposed_state: proposal.proposed_state,
            trigger_type: TRIGGER_TYPES.DEAL_DECAY,
            record_type: 'opportunity',
            record_id: deal.id,
            metadata: { amount: deal.amount, silence_days: signals.silence_days },
          });
        }

        // PR7: Always emit action_skipped
        emitCareAudit(CareAuditEventType.ACTION_SKIPPED, {
          action_origin: CareActionOrigin.CARE_AUTONOMOUS,
          policy_gate_result: CarePolicyGateResult.ALLOWED,
          reason: 'Autonomous actions disabled (PR7: state persistence only)',
          trigger_type: TRIGGER_TYPES.DEAL_DECAY,
          record_type: 'opportunity',
          record_id: deal.id,
        });
      } catch (err) {
        console.warn('[C.A.R.E. PR7] Trigger analysis error (non-breaking):', err.message);
      }
    }

    // 3. Detect overdue activities
    const overdueActivities = await detectOverdueActivities(tenantUuid);
    for (const activity of overdueActivities) {
      await createSuggestionIfNew(tenantUuid, {
        triggerId: TRIGGER_TYPES.ACTIVITY_OVERDUE,
        recordType: 'activity',
        recordId: activity.id,
        context: {
          subject: activity.subject,
          type: activity.type,
          days_overdue: activity.days_overdue,
          related_to: activity.related_to,
        },
      });
      triggerCount++;

      // PR6+PR7: C.A.R.E. analysis with state persistence (when enabled)
      try {
        // PR7: Build entity context
        const ctx = {
          tenant_id: tenantUuid,
          entity_type: 'activity',
          entity_id: activity.id
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
          record_type: 'activity',
          record_id: activity.id,
        });

        const escalationText = buildTriggerEscalationText({
          trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
          context: {
            subject: activity.subject,
            days_overdue: activity.days_overdue,
          },
        });

        const escalation = detectEscalation({ text: escalationText });
        if (escalation.is_escalation) {
          emitCareAudit(CareAuditEventType.ESCALATION_DETECTED, {
            action_origin: CareActionOrigin.CARE_AUTONOMOUS,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            reason: escalation.reason,
            trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
            record_type: 'activity',
            record_id: activity.id,
            metadata: { severity: escalation.severity, days_overdue: activity.days_overdue },
          });
        }

        const proposal = proposeTransition({
          current_state: currentState,
          signals,
          action_origin: CareActionOrigin.CARE_AUTONOMOUS,
        });

        if (proposal.proposed_state) {
          // Always emit state_proposed
          emitCareAudit(CareAuditEventType.STATE_PROPOSED, {
            action_origin: CareActionOrigin.CARE_AUTONOMOUS,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            current_state: currentState,
            proposed_state: proposal.proposed_state,
            reason: proposal.reason,
            trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
            record_type: 'activity',
            record_id: activity.id,
          });

          // PR7: Conditionally apply transition if state write gate enabled
          if (isCareStateWriteEnabled()) {
            try {
              await applyTransition({
                ctx,
                from_state: currentState,
                to_state: proposal.proposed_state,
                reason: proposal.reason,
                action_origin: CareActionOrigin.CARE_AUTONOMOUS,
                meta: { trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE, days_overdue: activity.days_overdue, signals }
              });

              emitCareAudit(CareAuditEventType.STATE_APPLIED, {
                action_origin: CareActionOrigin.CARE_AUTONOMOUS,
                policy_gate_result: CarePolicyGateResult.ALLOWED,
                reason: `State applied: ${currentState} → ${proposal.proposed_state}`,
                trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
                record_type: 'activity',
                record_id: activity.id,
                metadata: { from_state: currentState, to_state: proposal.proposed_state }
              });
            } catch (applyError) {
              logger.warn({ err: applyError }, '[AiTriggers] C.A.R.E. state apply error');
            }
          }
        }

        if (proposal.proposed_state && activity.days_overdue > 2) {
          emitCareAudit(CareAuditEventType.ACTION_CANDIDATE, {
            action_origin: CareActionOrigin.CARE_AUTONOMOUS,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            action_type: 'activity_reschedule',
            proposed_state: proposal.proposed_state,
            trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
            record_type: 'activity',
            record_id: activity.id,
            metadata: { days_overdue: activity.days_overdue },
          });
        }

        // PR7: Always emit action_skipped
        emitCareAudit(CareAuditEventType.ACTION_SKIPPED, {
          action_origin: CareActionOrigin.CARE_AUTONOMOUS,
          policy_gate_result: CarePolicyGateResult.ALLOWED,
          reason: 'Autonomous actions disabled (PR7: state persistence only)',
          trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
          record_type: 'activity',
          record_id: activity.id,
        });
      } catch (err) {
        console.warn('[C.A.R.E. PR7] Trigger analysis error (non-breaking):', err.message);
      }
    }

    // 4. Detect hot opportunities (high probability, close soon)
    const hotOpportunities = await detectHotOpportunities(tenantUuid);
    for (const opp of hotOpportunities) {
      await createSuggestionIfNew(tenantUuid, {
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
          entity_id: opp.id
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
        if (escalation.is_escalation) {
          emitCareAudit(CareAuditEventType.ESCALATION_DETECTED, {
            action_origin: CareActionOrigin.CARE_AUTONOMOUS,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            reason: escalation.reason,
            trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
            record_type: 'opportunity',
            record_id: opp.id,
            metadata: { severity: escalation.severity, probability: opp.probability },
          });
        }

        const proposal = proposeTransition({
          current_state: currentState,
          signals,
          action_origin: CareActionOrigin.CARE_AUTONOMOUS,
        });

        if (proposal.proposed_state) {
          // Always emit state_proposed
          emitCareAudit(CareAuditEventType.STATE_PROPOSED, {
            action_origin: CareActionOrigin.CARE_AUTONOMOUS,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            current_state: currentState,
            proposed_state: proposal.proposed_state,
            reason: proposal.reason,
            trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
            record_type: 'opportunity',
            record_id: opp.id,
          });

          // PR7: Conditionally apply transition if state write gate enabled
          if (isCareStateWriteEnabled()) {
            try {
              await applyTransition({
                ctx,
                from_state: currentState,
                to_state: proposal.proposed_state,
                reason: proposal.reason,
                action_origin: CareActionOrigin.CARE_AUTONOMOUS,
                meta: { trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT, amount: opp.amount, signals }
              });

              emitCareAudit(CareAuditEventType.STATE_APPLIED, {
                action_origin: CareActionOrigin.CARE_AUTONOMOUS,
                policy_gate_result: CarePolicyGateResult.ALLOWED,
                reason: `State applied: ${currentState} → ${proposal.proposed_state}`,
                trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
                record_type: 'opportunity',
                record_id: opp.id,
                metadata: { from_state: currentState, to_state: proposal.proposed_state }
              });
            } catch (applyError) {
              logger.warn({ err: applyError }, '[AiTriggers] C.A.R.E. state apply error');
            }
          }
        }

        if (proposal.proposed_state && opp.amount > 50000) {
          emitCareAudit(CareAuditEventType.ACTION_CANDIDATE, {
            action_origin: CareActionOrigin.CARE_AUTONOMOUS,
            policy_gate_result: CarePolicyGateResult.ALLOWED,
            action_type: 'deal_closing',
            proposed_state: proposal.proposed_state,
            trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
            record_type: 'opportunity',
            record_id: opp.id,
            metadata: { amount: opp.amount, days_to_close: opp.days_to_close },
          });
        }

        // PR7: Always emit action_skipped
        emitCareAudit(CareAuditEventType.ACTION_SKIPPED, {
          action_origin: CareActionOrigin.CARE_AUTONOMOUS,
          policy_gate_result: CarePolicyGateResult.ALLOWED,
          reason: 'Autonomous actions disabled (PR7: state persistence only)',
          trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
          record_type: 'opportunity',
          record_id: opp.id,
        });
      } catch (err) {
        console.warn('[C.A.R.E. PR7] Trigger analysis error (non-breaking):', err.message);
      }
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
      .select('id, first_name, last_name, status, updated_at, created_at, is_test_data')
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
    const leadIds = (leads || []).map(l => l.id);
    if (leadIds.length === 0) return [];

    const { data: existingSuggestions } = await supabase
      .from('ai_suggestions')
      .select('record_id')
      .eq('tenant_id', tenantUuid)
      .eq('trigger_id', TRIGGER_TYPES.LEAD_STAGNANT)
      .eq('status', 'pending')
      .in('record_id', leadIds);

    const existingIds = new Set((existingSuggestions || []).map(s => s.record_id));

    // Step 3: Filter in JavaScript and calculate days_stagnant
    return (leads || [])
      .filter(lead => !existingIds.has(lead.id))
      .map(lead => ({
        ...lead,
        days_stagnant: Math.floor((Date.now() - new Date(lead.updated_at || lead.created_at).getTime()) / (1000 * 60 * 60 * 24)),
        last_activity_at: null
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
    const { data: opportunities, error } = await supabase
      .from('opportunities')
      .select('id, name, stage, amount, close_date, updated_at, created_at, is_test_data')
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
    const oppIds = (opportunities || []).map(o => o.id);
    if (oppIds.length === 0) return [];

    const { data: existingSuggestions } = await supabase
      .from('ai_suggestions')
      .select('record_id')
      .eq('tenant_id', tenantUuid)
      .eq('trigger_id', TRIGGER_TYPES.DEAL_DECAY)
      .eq('status', 'pending')
      .in('record_id', oppIds);

    const existingIds = new Set((existingSuggestions || []).map(s => s.record_id));

    // Step 3: Filter in JavaScript and calculate days_inactive
    return (opportunities || [])
      .filter(opp => !existingIds.has(opp.id))
      .map(deal => ({
        ...deal,
        days_inactive: Math.floor((Date.now() - new Date(deal.updated_at || deal.created_at).getTime()) / (1000 * 60 * 60 * 24))
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
    const { data: activities, error } = await supabase
      .from('activities')
      .select('id, subject, type, due_date, metadata, related_to, is_test_data')
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
    const overdueCandidates = (activities || []).filter(act => {
      const status = act.status || act.metadata?.status;
      if (status === 'completed' || status === 'cancelled' || status === 'done') return false;
      return true;
    });

    if (overdueCandidates.length === 0) return [];

    // Step 3: Get existing pending suggestions
    const actIds = overdueCandidates.map(a => a.id);
    const { data: existingSuggestions } = await supabase
      .from('ai_suggestions')
      .select('record_id')
      .eq('tenant_id', tenantUuid)
      .eq('trigger_id', TRIGGER_TYPES.ACTIVITY_OVERDUE)
      .eq('status', 'pending')
      .in('record_id', actIds);

    const existingIds = new Set((existingSuggestions || []).map(s => s.record_id));

    // Step 4: Filter and calculate days_overdue
    return overdueCandidates
      .filter(act => !existingIds.has(act.id))
      .map(activity => ({
        ...activity,
        days_overdue: Math.floor((Date.now() - new Date(activity.due_date).getTime()) / (1000 * 60 * 60 * 24)),
        related_to: activity.related_to || activity.metadata?.related_to || null
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
    const { data: opportunities, error } = await supabase
      .from('opportunities')
      .select('id, name, stage, amount, probability, close_date, is_test_data')
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
    const oppIds = (opportunities || []).map(o => o.id);
    if (oppIds.length === 0) return [];

    const { data: existingSuggestions } = await supabase
      .from('ai_suggestions')
      .select('record_id')
      .eq('tenant_id', tenantUuid)
      .eq('trigger_id', TRIGGER_TYPES.OPPORTUNITY_HOT)
      .eq('status', 'pending')
      .in('record_id', oppIds);

    const existingIds = new Set((existingSuggestions || []).map(s => s.record_id));

    // Step 3: Filter in JavaScript and calculate days_to_close
    return (opportunities || [])
      .filter(opp => !existingIds.has(opp.id))
      .map(opp => ({
        ...opp,
        days_to_close: Math.floor((new Date(opp.close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      }));
  } catch (err) {
    logger.error({ err }, '[AiTriggersWorker] detectHotOpportunities error');
    return [];
  }
}

/**
 * Create a suggestion if one doesn't already exist for this trigger+record
 * Uses Supabase JS client for insert
 */
async function createSuggestionIfNew(tenantUuid, triggerData) {
  const { triggerId, recordType, recordId, context, priority = 'normal' } = triggerData;

  try {
    // Check if there's already a pending OR recently rejected suggestion for this trigger+record
    // Cooldown: Don't recreate suggestions rejected within the last 7 days
    const cooldownDays = 7;
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - cooldownDays);
    
    const { data: existing, error: checkError } = await supabase
      .from('ai_suggestions')
      .select('id, status, updated_at')
      .eq('tenant_id', tenantUuid)
      .eq('trigger_id', triggerId)
      .eq('record_id', recordId)
      .or(`status.eq.pending,and(status.eq.rejected,updated_at.gte.${cooldownDate.toISOString()})`)
      .limit(1);
    
    if (checkError) {
      logger.error({ err: checkError }, '[AiTriggersWorker] Error checking existing suggestion');
    }
    
    if (existing && existing.length > 0) {
      const existingStatus = existing[0].status;
      logger.debug({ triggerId, recordId, existingStatus }, '[AiTriggersWorker] Skipping - existing suggestion');
      return null;
    }

    // Generate AI suggestion using propose_actions mode
    const suggestion = await generateAiSuggestion(tenantUuid, triggerId, recordType, recordId, context);
    
    if (!suggestion) {
      logger.debug({ triggerId, recordId }, '[AiTriggersWorker] No suggestion generated');
      return null;
    }

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SUGGESTION_EXPIRY_DAYS);

    // Insert suggestion using Supabase JS client
    const { data, error } = await supabase
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
        status: 'pending'
      })
      .select('id')
      .single();

    if (error) {
      // Check if it's a duplicate (constraint violation)
      if (error.code === '23505') {
        logger.debug({ triggerId, recordId }, '[AiTriggersWorker] Suggestion already exists');
        return null;
      }
      logger.error({ err: error, triggerId, recordId }, '[AiTriggersWorker] Error inserting suggestion');
      return null;
    }

    if (data) {
      logger.info({ suggestionId: data.id, triggerId, recordId }, '[AiTriggersWorker] Created suggestion');
      
      // Emit webhook for new suggestion
      await emitTenantWebhooks(tenantUuid, 'ai.suggestion.generated', {
        suggestion_id: data.id,
        trigger_id: triggerId,
        record_type: recordType,
        record_id: recordId,
        priority,
      }).catch(err => logger.error({ err }, '[AiTriggersWorker] Webhook emission failed'));

      return data.id;
    }

    return null;
  } catch (err) {
    logger.error({ err, triggerId, recordId }, '[AiTriggersWorker] Error creating suggestion');
    return null;
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
      const brainSuggestion = await generateAiBrainSuggestion(tenantUuid, triggerId, recordType, recordId, context);
      if (brainSuggestion) {
        return brainSuggestion;
      }
    } catch (brainError) {
      logger.warn({ err: brainError }, '[AiTriggersWorker] AI Brain suggestion failed, falling back to templates');
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
  const SYSTEM_USER_ID = process.env.SYSTEM_USER_ID || '00000000-0000-0000-0000-000000000000';
  
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
      userId: SYSTEM_USER_ID,
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
      confidence: 0.80,
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
      confidence: 0.70,
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
      confidence: 0.90,
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
    hash = ((hash << 5) - hash) + char;
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
  const enriched = await Promise.all((suggestions || []).map(async (s) => {
    let recordName = null;
    try {
      if (s.record_type === 'lead') {
        const { data } = await supa.from('leads').select('first_name, last_name').eq('id', s.record_id).single();
        recordName = data ? `${data.first_name || ''} ${data.last_name || ''}`.trim() : null;
      } else if (s.record_type === 'opportunity') {
        const { data } = await supa.from('opportunities').select('name').eq('id', s.record_id).single();
        recordName = data?.name || null;
      } else if (s.record_type === 'activity') {
        const { data } = await supa.from('activities').select('subject').eq('id', s.record_id).single();
        recordName = data?.subject || null;
      }
    } catch {
      // Ignore enrichment errors
    }
    return { ...s, record_name: recordName };
  }));

  return enriched;
}
