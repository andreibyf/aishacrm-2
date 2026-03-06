/**
 * C.A.R.E. Playbook Router
 *
 * Intercepts trigger events and routes them to playbook execution
 * instead of (or in addition to) creating ai_suggestions.
 *
 * Decision flow:
 *   1. Look up care_playbook for tenant + trigger_type
 *   2. If no playbook → return null (caller falls through to createSuggestionIfNew)
 *   3. If playbook found but disabled → return null
 *   4. Check cooldown (last execution for this entity within cooldown window?)
 *   5. Check daily limit (executions today < max_executions_per_day?)
 *   6. Check conflict resolution (if multiple playbooks could fire, use priority)
 *   7. Create care_playbook_execution record
 *   8. Route to execution mode (native / webhook / both)
 *   9. Emit audit event
 *
 * @module carePlaybookRouter
 */

import { getSupabaseClient } from '../supabase-db.js';
import { emitCareAudit } from './careAuditEmitter.js';
import { CareAuditEventType, CarePolicyGateResult } from './careAuditTypes.js';
import { triggerCareWorkflow } from './careWorkflowTriggerClient.js';
import { queuePlaybookExecution } from './carePlaybookExecutor.js';
import logger from '../logger.js';

// In-memory cache for playbook lookups (tenant_id:trigger_type → playbook | null)
// TTL: 60s — same as visibility scope cache
const playbookCache = new Map();
const CACHE_TTL_MS = 60_000;

/**
 * Attempt to route a trigger event through a playbook.
 *
 * @param {string} tenantId - Tenant UUID
 * @param {object} triggerData - Trigger event data
 * @param {string} triggerData.triggerId - Trigger type (e.g. 'lead_stagnant')
 * @param {string} triggerData.recordType - Entity type (e.g. 'lead')
 * @param {string} triggerData.recordId - Entity UUID
 * @param {object} triggerData.context - Trigger context (lead_name, days_stagnant, etc.)
 * @param {object} [deps] - Dependency overrides for testing
 * @returns {object|null} Execution record if routed to playbook, null if no playbook (fall through)
 */
export async function routeTriggerToPlaybook(tenantId, triggerData, deps = {}) {
  const supabase = deps.supabase || getSupabaseClient();
  const _log = deps.logger || logger;

  const { triggerId, recordType, recordId, context } = triggerData;

  try {
    // 1. Look up playbook for this tenant + trigger type
    const playbook = await getPlaybookForTrigger(tenantId, triggerId, supabase, _log);

    if (!playbook) {
      // No playbook configured → caller falls through to createSuggestionIfNew
      return null;
    }

    if (!playbook.is_enabled) {
      _log.debug({ tenantId, triggerId }, '[PlaybookRouter] Playbook disabled');
      return null;
    }

    // 2. Check cooldown — was this playbook run for this entity recently?
    const cooldownOk = await checkCooldown(
      supabase,
      tenantId,
      playbook.id,
      recordId,
      playbook.cooldown_minutes,
      _log,
    );

    if (!cooldownOk) {
      // Log as cooldown_skipped execution for audit trail
      const { data: skippedExec } = await supabase
        .from('care_playbook_execution')
        .insert({
          tenant_id: tenantId,
          playbook_id: playbook.id,
          trigger_type: triggerId,
          entity_type: recordType,
          entity_id: recordId,
          status: 'cooldown_skipped',
          total_steps: (playbook.steps || []).length,
          stopped_reason: 'cooldown_active',
          completed_at: new Date().toISOString(),
          shadow_mode: playbook.shadow_mode,
        })
        .select('id')
        .single();

      _log.debug(
        {
          tenantId,
          triggerId,
          recordId,
          executionId: skippedExec?.id,
        },
        '[PlaybookRouter] Cooldown active — skipped',
      );

      return { status: 'cooldown_skipped', executionId: skippedExec?.id };
    }

    // 3. Check daily limit
    const dailyLimitOk = await checkDailyLimit(
      supabase,
      tenantId,
      playbook.id,
      playbook.max_executions_per_day,
      _log,
    );

    if (!dailyLimitOk) {
      _log.warn(
        {
          tenantId,
          triggerId,
          playbook: playbook.name,
          limit: playbook.max_executions_per_day,
        },
        '[PlaybookRouter] Daily execution limit reached',
      );

      emitCareAudit({
        tenant_id: tenantId,
        entity_type: recordType,
        entity_id: recordId,
        event_type: CareAuditEventType.ACTION_OUTCOME,
        action_origin: 'care_autonomous',
        reason: `Playbook "${playbook.name}" daily limit reached (${playbook.max_executions_per_day})`,
        policy_gate_result: CarePolicyGateResult.BLOCKED,
        meta: { playbook_id: playbook.id, trigger_type: triggerId },
      });

      return { status: 'daily_limit_reached' };
    }

    // 4. Create execution record
    const steps = playbook.steps || [];
    const { data: execution, error: execError } = await supabase
      .from('care_playbook_execution')
      .insert({
        tenant_id: tenantId,
        playbook_id: playbook.id,
        trigger_type: triggerId,
        entity_type: recordType,
        entity_id: recordId,
        status: 'pending',
        total_steps: steps.length,
        shadow_mode: playbook.shadow_mode,
      })
      .select()
      .single();

    if (execError) {
      _log.error(
        { err: execError, tenantId, triggerId },
        '[PlaybookRouter] Failed to create execution record',
      );
      return null;
    }

    _log.info(
      {
        executionId: execution.id,
        playbook: playbook.name,
        triggerId,
        recordType,
        recordId,
        executionMode: playbook.execution_mode,
        shadowMode: playbook.shadow_mode,
        stepCount: steps.length,
      },
      '[PlaybookRouter] Playbook execution created',
    );

    // 5. Emit audit event
    emitCareAudit({
      tenant_id: tenantId,
      entity_type: recordType,
      entity_id: recordId,
      event_type: CareAuditEventType.ACTION_OUTCOME,
      action_origin: 'care_autonomous',
      reason: `Playbook "${playbook.name}" triggered${playbook.shadow_mode ? ' (shadow mode)' : ''}`,
      policy_gate_result: CarePolicyGateResult.ALLOWED,
      meta: {
        playbook_id: playbook.id,
        execution_id: execution.id,
        trigger_type: triggerId,
        execution_mode: playbook.execution_mode,
        shadow_mode: playbook.shadow_mode,
        total_steps: steps.length,
      },
    });

    // 6. Route to execution mode
    const mode = playbook.execution_mode;

    if (mode === 'native' || mode === 'both') {
      // Queue for PlaybookExecutor (Step 3 — will be built next)
      // For now, update status to in_progress so the executor can pick it up
      await supabase
        .from('care_playbook_execution')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', execution.id);

      // Queue for PlaybookExecutor via Bull
      await queuePlaybookExecution(execution.id);
      _log.info({ executionId: execution.id }, '[PlaybookRouter] Native execution queued via Bull');
    }

    if (mode === 'webhook' || mode === 'both') {
      // Fire webhook using existing careWorkflowTriggerClient
      try {
        const webhookUrl = playbook.webhook_url;
        const webhookSecret = playbook.webhook_secret;

        if (webhookUrl) {
          // Build payload matching CARE_EVENT_CONTRACT
          const webhookPayload = {
            event_id: `playbook-${execution.id}`,
            type: 'care.playbook.triggered',
            tenant_id: tenantId,
            trigger_type: triggerId,
            entity: {
              type: recordType,
              id: recordId,
            },
            playbook: {
              id: playbook.id,
              name: playbook.name,
            },
            execution_id: execution.id,
            context,
            shadow_mode: playbook.shadow_mode,
            timestamp: new Date().toISOString(),
          };

          if (!playbook.shadow_mode) {
            await triggerCareWorkflow({
              url: webhookUrl,
              secret: webhookSecret,
              payload: webhookPayload,
            });
            _log.info(
              { executionId: execution.id, url: webhookUrl },
              '[PlaybookRouter] Webhook fired',
            );
          } else {
            _log.info(
              { executionId: execution.id, url: webhookUrl },
              '[PlaybookRouter] Webhook skipped (shadow mode)',
            );
          }
        } else {
          _log.warn(
            { executionId: execution.id },
            '[PlaybookRouter] Webhook mode but no URL configured',
          );
        }
      } catch (webhookErr) {
        _log.warn(
          { err: webhookErr, executionId: execution.id },
          '[PlaybookRouter] Webhook fire failed',
        );
      }
    }

    return {
      status: 'routed',
      executionId: execution.id,
      playbookId: playbook.id,
      playbookName: playbook.name,
      executionMode: mode,
      shadowMode: playbook.shadow_mode,
    };
  } catch (err) {
    _log.error({ err, tenantId, triggerId, recordId }, '[PlaybookRouter] Unexpected error');
    return null; // Fall through to suggestion creation on error
  }
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Look up the active playbook for a tenant + trigger type.
 * Uses in-memory cache with 60s TTL.
 */
async function getPlaybookForTrigger(tenantId, triggerType, supabase, _log) {
  const cacheKey = `${tenantId}:${triggerType}`;
  const cached = playbookCache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  const { data, error } = await supabase
    .from('care_playbook')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('trigger_type', triggerType)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows found (expected when no playbook configured)
    _log.warn({ err: error, tenantId, triggerType }, '[PlaybookRouter] Playbook lookup error');
  }

  const playbook = data || null;
  playbookCache.set(cacheKey, { value: playbook, ts: Date.now() });
  return playbook;
}

/**
 * Check if cooldown period has elapsed since last execution for this entity.
 */
async function checkCooldown(supabase, tenantId, playbookId, entityId, cooldownMinutes, _log) {
  if (!cooldownMinutes || cooldownMinutes <= 0) return true;

  const cooldownCutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('care_playbook_execution')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('playbook_id', playbookId)
    .eq('entity_id', entityId)
    .neq('status', 'cooldown_skipped')
    .gte('started_at', cooldownCutoff)
    .limit(1);

  if (error) {
    _log.warn({ err: error }, '[PlaybookRouter] Cooldown check error — allowing execution');
    return true; // Fail open: allow execution if we can't check cooldown
  }

  return !data || data.length === 0;
}

/**
 * Check if daily execution limit has been reached for this playbook.
 */
async function checkDailyLimit(supabase, tenantId, playbookId, maxPerDay, _log) {
  if (!maxPerDay || maxPerDay <= 0) return true;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('care_playbook_execution')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('playbook_id', playbookId)
    .neq('status', 'cooldown_skipped')
    .gte('started_at', todayStart.toISOString());

  if (error) {
    _log.warn({ err: error }, '[PlaybookRouter] Daily limit check error — allowing execution');
    return true; // Fail open
  }

  return (count || 0) < maxPerDay;
}

/**
 * Invalidate cached playbook for a tenant + trigger type.
 * Call this when playbook is created/updated/deleted via API.
 */
export function invalidatePlaybookCache(tenantId, triggerType) {
  if (triggerType) {
    playbookCache.delete(`${tenantId}:${triggerType}`);
  } else {
    // Invalidate all playbooks for this tenant
    for (const key of playbookCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        playbookCache.delete(key);
      }
    }
  }
}

export default { routeTriggerToPlaybook, invalidatePlaybookCache };
