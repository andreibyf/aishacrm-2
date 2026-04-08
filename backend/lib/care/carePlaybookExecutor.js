/**
 * C.A.R.E. Playbook Executor
 *
 * Processes playbook execution records step-by-step.
 * Each step is an action (send_email, create_task, send_notification, etc.)
 * with optional delay, engagement detection, and approval gating.
 *
 * Flow:
 *   1. Load execution record + playbook
 *   2. For each step starting from current_step:
 *      a. If delay_minutes > 0 → schedule delayed job, return
 *      b. If stop_on_engagement → check for recent entity activity, abort if engaged
 *      c. If shadow_mode → log step but don't execute
 *      d. If require_approval + use_ai_generation → queue for approval, pause
 *      e. Execute action via the appropriate service
 *      f. Record step result
 *   3. Mark execution completed
 *
 * Action types:
 *   send_email       → Create email activity via Supabase (emailWorker picks up)
 *   create_task       → Create activity record
 *   send_notification → Insert into notifications table
 *   reassign          → Update entity assigned_to
 *   update_field      → Update entity field
 *   send_whatsapp     → Send via WhatsApp template (Twilio)
 *   escalate          → Create escalation notification
 *   webhook           → Fire HTTP webhook mid-sequence
 *
 * @module carePlaybookExecutor
 */

import { getSupabaseClient } from '../supabase-db.js';
import { emitCareAudit } from './careAuditEmitter.js';
import { CareAuditEventType, CarePolicyGateResult } from './careAuditTypes.js';
import { triggerCareWorkflow } from './careWorkflowTriggerClient.js';
import { runTask as runAiBrainTask } from '../aiBrain.js';
import logger from '../logger.js';
import { playbookQueue } from './carePlaybookQueue.js';

// ============================================================
// Queue processor initialization
// ============================================================

/**
 * Initialize the Bull queue processors.
 * Call this once at server startup (e.g. in server.js or worker entry).
 */
export function initPlaybookQueueProcessor() {
  // Start a new playbook execution — process all immediate steps
  playbookQueue.process('execute-playbook', 2, async (job) => {
    const { executionId } = job.data;
    logger.info({ executionId, jobId: job.id }, '[PlaybookExecutor] Starting playbook execution');

    try {
      await executePlaybook(executionId);
      return { executionId, status: 'processed' };
    } catch (err) {
      logger.error({ err, executionId }, '[PlaybookExecutor] Playbook execution failed');
      throw err;
    }
  });

  // Resume a delayed step
  playbookQueue.process('execute-step', 2, async (job) => {
    const { executionId, stepIndex } = job.data;
    logger.info(
      { executionId, stepIndex, jobId: job.id },
      '[PlaybookExecutor] Resuming delayed step',
    );

    try {
      await executePlaybook(executionId, stepIndex);
      return { executionId, stepIndex, status: 'processed' };
    } catch (err) {
      logger.error({ err, executionId, stepIndex }, '[PlaybookExecutor] Step execution failed');
      throw err;
    }
  });

  logger.info('[PlaybookExecutor] Queue processors registered');
}

// ============================================================
// Core execution logic
// ============================================================

/**
 * Execute a playbook from a given step index.
 *
 * @param {string} executionId - care_playbook_execution UUID
 * @param {number} [startStep=null] - Step index to start from (null = use current_step)
 */
async function executePlaybook(executionId, startStep = null) {
  const supabase = getSupabaseClient();

  // 1. Load execution record
  const { data: execution, error: execErr } = await supabase
    .from('care_playbook_execution')
    .select('*')
    .eq('id', executionId)
    .single();

  if (execErr || !execution) {
    logger.error({ execErr, executionId }, '[PlaybookExecutor] Execution record not found');
    return;
  }

  // Guard: don't process completed/cancelled/failed executions
  if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
    logger.debug(
      { executionId, status: execution.status },
      '[PlaybookExecutor] Execution already terminal',
    );
    return;
  }

  // 2. Load playbook
  const { data: playbook, error: pbErr } = await supabase
    .from('care_playbook')
    .select('*')
    .eq('id', execution.playbook_id)
    .single();

  if (pbErr || !playbook) {
    logger.error(
      { pbErr, playbookId: execution.playbook_id },
      '[PlaybookExecutor] Playbook not found',
    );
    await markExecutionFailed(supabase, executionId, 'playbook_not_found');
    return;
  }

  const steps = playbook.steps || [];
  const stepIndex = startStep ?? execution.current_step ?? 0;
  const stepResults = execution.step_results || [];
  let tokensUsed = execution.tokens_used || 0;

  // 3. Process steps sequentially from stepIndex
  for (let i = stepIndex; i < steps.length; i++) {
    const step = steps[i];

    // 3a. Check delay — if this step has a delay and we're not resuming it
    if (step.delay_minutes > 0 && i === stepIndex && startStep === null) {
      // Schedule delayed execution
      const delayMs = step.delay_minutes * 60 * 1000;
      const nextStepAt = new Date(Date.now() + delayMs).toISOString();

      await supabase
        .from('care_playbook_execution')
        .update({
          current_step: i,
          step_results: stepResults,
          next_step_at: nextStepAt,
          tokens_used: tokensUsed,
        })
        .eq('id', executionId);

      await playbookQueue.add(
        'execute-step',
        {
          executionId,
          stepIndex: i,
        },
        {
          delay: delayMs,
          jobId: `playbook-step-${executionId}-${i}`,
        },
      );

      logger.info(
        {
          executionId,
          stepIndex: i,
          delayMinutes: step.delay_minutes,
          nextStepAt,
        },
        '[PlaybookExecutor] Step delayed — scheduled for later',
      );

      return; // Exit — Bull will resume at the delayed step
    }

    // 3b. Check stop_on_engagement
    if (step.stop_on_engagement) {
      const engaged = await checkEntityEngagement(
        supabase,
        execution.entity_type,
        execution.entity_id,
        execution.started_at,
      );

      if (engaged) {
        logger.info(
          { executionId, stepIndex: i, entityId: execution.entity_id },
          '[PlaybookExecutor] Entity re-engaged — stopping playbook',
        );

        stepResults.push({
          step_id: step.step_id,
          step_index: i,
          status: 'skipped',
          reason: 'engagement_detected',
          timestamp: new Date().toISOString(),
        });

        await supabase
          .from('care_playbook_execution')
          .update({
            status: 'completed',
            stopped_reason: 'engagement_detected',
            current_step: i,
            step_results: stepResults,
            tokens_used: tokensUsed,
            completed_at: new Date().toISOString(),
          })
          .eq('id', executionId);

        emitCareAudit({
          tenant_id: execution.tenant_id,
          entity_type: execution.entity_type,
          entity_id: execution.entity_id,
          event_type: CareAuditEventType.ACTION_OUTCOME,
          action_origin: 'care_autonomous',
          reason: `Playbook stopped: entity re-engaged at step ${i + 1}/${steps.length}`,
          policy_gate_result: CarePolicyGateResult.ALLOWED,
          meta: {
            playbook_id: playbook.id,
            execution_id: executionId,
            stopped_at_step: i,
          },
        });

        return;
      }
    }

    // 3c. Execute the step action
    let stepResult;
    try {
      if (execution.shadow_mode) {
        // Shadow mode: log but don't execute
        stepResult = {
          step_id: step.step_id,
          step_index: i,
          action_type: step.action_type,
          status: 'shadow_logged',
          config: step.config,
          timestamp: new Date().toISOString(),
        };
        logger.info(
          { executionId, stepIndex: i, actionType: step.action_type },
          '[PlaybookExecutor] Shadow mode — step logged, not executed',
        );
      } else {
        // Execute the action
        stepResult = await executeStepAction(supabase, execution, playbook, step, i);

        // Track AI token usage
        if (stepResult.tokens) {
          tokensUsed += stepResult.tokens;
        }
      }
    } catch (stepErr) {
      stepResult = {
        step_id: step.step_id,
        step_index: i,
        action_type: step.action_type,
        status: 'error',
        error: stepErr.message,
        timestamp: new Date().toISOString(),
      };
      logger.error(
        { err: stepErr, executionId, stepIndex: i },
        '[PlaybookExecutor] Step execution error',
      );
    }

    stepResults.push(stepResult);

    // Update progress after each step
    await supabase
      .from('care_playbook_execution')
      .update({
        current_step: i + 1,
        step_results: stepResults,
        tokens_used: tokensUsed,
      })
      .eq('id', executionId);

    // Emit per-step audit
    emitCareAudit({
      tenant_id: execution.tenant_id,
      entity_type: execution.entity_type,
      entity_id: execution.entity_id,
      event_type: CareAuditEventType.ACTION_OUTCOME,
      action_origin: 'care_autonomous',
      reason: `Playbook step ${i + 1}/${steps.length}: ${step.action_type} → ${stepResult.status}`,
      policy_gate_result: CarePolicyGateResult.ALLOWED,
      meta: {
        playbook_id: playbook.id,
        execution_id: executionId,
        step_index: i,
        step_result: stepResult,
        shadow_mode: execution.shadow_mode,
      },
    });
  }

  // 4. All steps completed
  await supabase
    .from('care_playbook_execution')
    .update({
      status: 'completed',
      stopped_reason: 'completed',
      tokens_used: tokensUsed,
      completed_at: new Date().toISOString(),
    })
    .eq('id', executionId);

  logger.info(
    {
      executionId,
      stepsCompleted: steps.length,
      tokensUsed,
      shadowMode: execution.shadow_mode,
    },
    '[PlaybookExecutor] Playbook execution completed',
  );
}

function getEntityNameSelectFields(entityType) {
  const normalized = String(entityType || '').toLowerCase();
  if (normalized === 'lead') {
    return 'first_name, last_name, company, assigned_to, assigned_to_name';
  }
  if (normalized === 'contact') {
    return 'first_name, last_name, assigned_to, assigned_to_name';
  }
  if (normalized === 'account') {
    return 'name, assigned_to, assigned_to_name';
  }
  if (normalized === 'opportunity') {
    return 'name, assigned_to, assigned_to_name';
  }
  if (normalized === 'bizdev_source') {
    return 'name, assigned_to, assigned_to_name';
  }
  return 'name, assigned_to, assigned_to_name';
}

// ============================================================
// Step action dispatcher
// ============================================================

/**
 * Execute a single action step.
 *
 * @param {object} supabase - Supabase client
 * @param {object} execution - care_playbook_execution record
 * @param {object} playbook - care_playbook record
 * @param {object} step - Step object from playbook.steps JSONB
 * @param {number} stepIndex - Current step index
 * @returns {object} Step result object
 */
async function executeStepAction(supabase, execution, playbook, step, stepIndex) {
  const { action_type, config = {} } = step;
  const { tenant_id, entity_type, entity_id } = execution;

  const baseResult = {
    step_id: step.step_id,
    step_index: stepIndex,
    action_type,
    timestamp: new Date().toISOString(),
  };

  switch (action_type) {
    case 'send_email':
      return await executeCareSendEmailAction(
        supabase,
        tenant_id,
        entity_type,
        entity_id,
        config,
        baseResult,
      );

    case 'create_task':
      return await executeCreateTask(
        supabase,
        tenant_id,
        entity_type,
        entity_id,
        config,
        baseResult,
      );

    case 'send_notification':
      return await executeSendNotification(
        supabase,
        tenant_id,
        entity_type,
        entity_id,
        config,
        baseResult,
      );

    case 'reassign':
      return await executeReassign(supabase, tenant_id, entity_type, entity_id, config, baseResult);

    case 'update_field':
      return await executeUpdateField(
        supabase,
        tenant_id,
        entity_type,
        entity_id,
        config,
        baseResult,
      );

    case 'send_whatsapp':
      return await executeSendWhatsApp(
        supabase,
        tenant_id,
        entity_type,
        entity_id,
        config,
        baseResult,
      );

    case 'escalate':
      return await executeEscalate(supabase, tenant_id, entity_type, entity_id, config, baseResult);

    case 'webhook':
      return await executeWebhook(tenant_id, execution, playbook, step, baseResult);

    default:
      return { ...baseResult, status: 'error', error: `Unknown action_type: ${action_type}` };
  }
}

// ============================================================
// Action implementations
// ============================================================

/**
 * Send email — creates an email activity record.
 * emailWorker polls for these and sends via SMTP.
 */
export async function executeCareSendEmailAction(
  supabase,
  tenantId,
  entityType,
  entityId,
  config,
  base,
) {
  const { to, subject, body_prompt, use_ai_generation, require_approval } = config;
  let emailBody = config.body || '';
  let tokens = 0;
  const emailMetadata =
    config.email && typeof config.email === 'object' && !Array.isArray(config.email)
      ? config.email
      : {};
  const communicationsMetadata =
    config.communications &&
    typeof config.communications === 'object' &&
    !Array.isArray(config.communications)
      ? config.communications
      : {};

  // AI-generate body if configured
  if (use_ai_generation && body_prompt) {
    // If approval is required, create a pending suggestion instead
    if (require_approval !== false) {
      // Resolve entity name + sender BEFORE insert so record_name and recipient_name
      // are available in the suggestion card and email preview immediately.
      let recipientName = to;
      let senderName = config.sender_name || null;
      let entityDisplayName = null;
      if (entityType && entityId) {
        try {
          const entityTable =
            entityType === 'bizdev_source'
              ? 'bizdev_sources'
              : entityType === 'opportunity'
                ? 'opportunities'
                : `${entityType}s`;
          const nameFields = getEntityNameSelectFields(entityType);
          const { data: entRec } = await supabase
            .from(entityTable)
            .select(nameFields)
            .eq('id', entityId)
            .eq('tenant_id', tenantId)
            .single();
          if (entRec) {
            const resolvedName = entRec.first_name
              ? `${entRec.first_name}${entRec.last_name ? ' ' + entRec.last_name : ''}`
              : entRec.company || entRec.name || null;
            entityDisplayName = resolvedName;
            recipientName = resolvedName || to;
            // Sender: prefer assigned_to_name, then employee lookup, then admin fallback
            if (!senderName) {
              if (entRec.assigned_to_name) {
                senderName = entRec.assigned_to_name;
              } else if (entRec.assigned_to) {
                const { data: emp } = await supabase
                  .from('employees')
                  .select('first_name, last_name')
                  .eq('id', entRec.assigned_to)
                  .eq('tenant_id', tenantId)
                  .single();
                if (emp?.first_name) {
                  senderName = `${emp.first_name}${emp.last_name ? ' ' + emp.last_name : ''}`;
                }
              }
              // Fallback: tenant admin when record is unassigned
              if (!senderName) {
                const { data: adminUser } = await supabase
                  .from('users')
                  .select('first_name, last_name')
                  .eq('tenant_id', tenantId)
                  .in('role', ['admin', 'superadmin'])
                  .limit(1)
                  .maybeSingle();
                if (adminUser?.first_name) {
                  senderName = `${adminUser.first_name}${adminUser.last_name ? ' ' + adminUser.last_name : ''}`;
                }
              }
            }
          }
        } catch (_) {
          /* non-critical */
        }
      }

      // Insert into ai_suggestions for human review
      const { data: suggestion } = await supabase
        .from('ai_suggestions')
        .insert({
          tenant_id: tenantId,
          trigger_id: 'playbook_email',
          record_type: entityType,
          record_id: entityId,
          record_name: entityDisplayName || config.record_name || null,
          status: 'pending',
          action: {
            tool_name: 'send_email',
            tool_args: {
              subject,
              body_prompt,
              to,
              recipient_name: recipientName,
              sender_name: senderName,
              source: 'care_playbook',
              requires_approval: true,
              ...(Object.keys(emailMetadata).length > 0 ? { email: emailMetadata } : {}),
              ...(Object.keys(communicationsMetadata).length > 0
                ? { communications: communicationsMetadata }
                : {}),
            },
          },
          confidence: 0.9,
          reasoning: 'AI-drafted email from CARE playbook — pending human approval',
        })
        .select('id')
        .single();

      // Fire-and-forget: pre-generate the email body and cache in Redis
      // recipientName and senderName already resolved above — reuse them.
      const isValidUuid = (v) =>
        typeof v === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      if (suggestion?.id && isValidUuid(tenantId)) {
        // Explicitly capture all closed-over values to prevent GC/mutation issues in async IIFE
        const _tenantId = tenantId;
        const _entityType = entityType;
        const _entityId = entityId;
        const _body_prompt = body_prompt;
        const _recipientName = recipientName;
        const _senderName = senderName;
        const _suggestionId = suggestion.id;
        (async () => {
          try {
            const { default: cacheManager } = await import('../cacheManager.js');
            const SYSTEM_USER_ID =
              process.env.SYSTEM_USER_ID || '00000000-0000-0000-0000-000000000000';

            const { buildStyleDirective } = await import(
              '../communications/contracts/emailStyleGuardrailsContract.js'
            );
            const styleDirective = buildStyleDirective(
              { tone: 'friendly', length_tier: 'standard' },
              { recipient_name: _recipientName, sender_name: _senderName },
            );
            const styledPrompt = `${styleDirective}\n\n${_body_prompt}`;
            const result = await runAiBrainTask({
              tenantId: _tenantId,
              userId: SYSTEM_USER_ID,
              taskType: 'email_generation',
              mode: 'generate_content',
              context: { prompt: styledPrompt, entity_type: _entityType, entity_id: _entityId },
            });
            const rawBody = result?.summary || result?.content || '';
            if (rawBody) {
              const { cleanAiEmailResponse } = await import(
                '../communications/cleanAiEmailResponse.js'
              );
              const cleaned = cleanAiEmailResponse(rawBody, subject);
              const cacheKey = `tenant:${_tenantId}:suggestion_preview:${_suggestionId}`;
              await cacheManager.set(
                cacheKey,
                {
                  body: cleaned.body,
                  subject: cleaned.subject,
                  recipientName: _recipientName,
                  senderName: _senderName,
                },
                3600,
              );
              logger.info(
                { suggestionId: _suggestionId },
                '[PlaybookExecutor] Pre-generated email cached',
              );
            }
          } catch (preGenErr) {
            logger.warn(
              { err: preGenErr },
              '[PlaybookExecutor] Pre-generation failed (non-blocking)',
            );
          }
        })();
      }

      return {
        ...base,
        status: 'pending_approval',
        suggestion_id: suggestion?.id,
        message: 'AI-drafted email queued for human approval',
      };
    }

    // No approval needed — generate now
    try {
      const SYSTEM_USER_ID = process.env.SYSTEM_USER_ID || '00000000-0000-0000-0000-000000000000';

      // Resolve recipient name and assigned employee for style
      let recipientName = to;
      let senderName = null;
      if (entityType && entityId) {
        try {
          const entityTable =
            entityType === 'bizdev_source'
              ? 'bizdev_sources'
              : entityType === 'opportunity'
                ? 'opportunities'
                : `${entityType}s`;
          const nameFieldsNoApproval = getEntityNameSelectFields(entityType);
          const { data: entityRec } = await supabase
            .from(entityTable)
            .select(nameFieldsNoApproval)
            .eq('id', entityId)
            .eq('tenant_id', tenantId)
            .single();
          if (entityRec) {
            recipientName = entityRec.first_name
              ? `${entityRec.first_name}${entityRec.last_name ? ' ' + entityRec.last_name : ''}`
              : entityRec.company || entityRec.name || to;
            // Prefer denormalized assigned_to_name; fall back to employees lookup
            if (entityRec.assigned_to_name) {
              senderName = entityRec.assigned_to_name;
            } else if (entityRec.assigned_to) {
              const { data: emp } = await supabase
                .from('employees')
                .select('first_name, last_name')
                .eq('id', entityRec.assigned_to)
                .eq('tenant_id', tenantId)
                .single();
              if (emp?.first_name) {
                senderName = `${emp.first_name}${emp.last_name ? ' ' + emp.last_name : ''}`;
              }
            }
          }
        } catch (_) {
          /* non-critical */
        }
      }
      // Fallback: use caller-provided sender name (e.g. from the logged-in user)
      if (!senderName && config.sender_name) {
        senderName = config.sender_name;
      }

      // Inject email style guidelines into the prompt
      const { buildStyleDirective } = await import(
        '../communications/contracts/emailStyleGuardrailsContract.js'
      );
      const styleDirective = buildStyleDirective(
        { tone: 'friendly', length_tier: 'standard' },
        { recipient_name: recipientName, sender_name: senderName },
      );
      const styledPrompt = `${styleDirective}\n\n${body_prompt}`;
      const result = await runAiBrainTask({
        tenantId,
        userId: SYSTEM_USER_ID,
        taskType: 'email_generation',
        mode: 'generate_content',
        context: { prompt: styledPrompt, entity_type: entityType, entity_id: entityId },
      });
      emailBody = result?.content || result?.summary || emailBody;
      tokens = result?.usage?.total_tokens || 0;
    } catch (aiErr) {
      logger.warn(
        { err: aiErr },
        '[PlaybookExecutor] AI email generation failed — using empty body',
      );
    }
  }

  const activityMetadata =
    config.activity_metadata && typeof config.activity_metadata === 'object'
      ? config.activity_metadata
      : {};
  const activitySource =
    typeof config.source === 'string' && config.source.trim()
      ? config.source.trim()
      : 'care_playbook';

  // Create email activity (emailWorker picks this up)
  const { data: activity, error } = await supabase
    .from('activities')
    .insert({
      tenant_id: tenantId,
      type: 'email',
      subject: subject || 'Follow-up',
      description: emailBody,
      status: 'queued',
      related_to: entityType,
      related_id: entityId,
      metadata: {
        source: activitySource,
        ...(activitySource === 'care_playbook' ? { playbook_generated: true } : {}),
        ...activityMetadata,
        ...(Object.keys(emailMetadata).length > 0
          ? {
              email: {
                ...(activityMetadata.email && typeof activityMetadata.email === 'object'
                  ? activityMetadata.email
                  : {}),
                ...emailMetadata,
              },
            }
          : {}),
        ...(Object.keys(communicationsMetadata).length > 0
          ? {
              communications: {
                ...(activityMetadata.communications &&
                typeof activityMetadata.communications === 'object'
                  ? activityMetadata.communications
                  : {}),
                ...communicationsMetadata,
              },
            }
          : {}),
      },
    })
    .select('id')
    .single();

  if (error) {
    return { ...base, status: 'error', error: error.message };
  }

  return { ...base, status: 'completed', activity_id: activity?.id, tokens };
}

/**
 * Create task — inserts an activity record of type task/call.
 */
async function executeCreateTask(supabase, tenantId, entityType, entityId, config, base) {
  const { subject, description, assigned_to, priority, due_offset_hours } = config;

  // Resolve assigned_to
  let assigneeId = null;
  if (assigned_to === 'owner') {
    // Look up current entity owner
    const { data: entity } = await supabase
      .from(getTableName(entityType))
      .select('assigned_to')
      .eq('id', entityId)
      .single();
    assigneeId = entity?.assigned_to;
  }
  // 'manager' and 'specific' would need additional resolution — parked for now

  const dueDate = due_offset_hours
    ? new Date(Date.now() + due_offset_hours * 3600 * 1000).toISOString()
    : null;

  const { data: activity, error } = await supabase
    .from('activities')
    .insert({
      tenant_id: tenantId,
      type: 'task',
      subject: subject || 'Follow-up task',
      description: description || '',
      status: 'pending',
      priority: priority || 'normal',
      due_date: dueDate,
      assigned_to: assigneeId,
      related_to: entityType,
      related_id: entityId,
      metadata: { source: 'care_playbook', playbook_generated: true },
    })
    .select('id')
    .single();

  if (error) {
    return { ...base, status: 'error', error: error.message };
  }

  return { ...base, status: 'completed', activity_id: activity?.id };
}

/**
 * Send in-app notification — inserts into notifications table.
 */
async function executeSendNotification(supabase, tenantId, entityType, entityId, config, base) {
  const { message, priority, target } = config;

  // Resolve target user email
  let userEmail = null;
  if (target === 'owner') {
    const { data: entity } = await supabase
      .from(getTableName(entityType))
      .select('assigned_to')
      .eq('id', entityId)
      .single();

    if (entity?.assigned_to) {
      const { data: employee } = await supabase
        .from('employees')
        .select('email')
        .eq('id', entity.assigned_to)
        .single();
      userEmail = employee?.email;
    }
  }

  if (!userEmail) {
    return { ...base, status: 'error', error: 'Could not resolve notification target email' };
  }

  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      tenant_id: tenantId,
      user_email: userEmail,
      type: 'care_playbook',
      title: 'C.A.R.E. Playbook Alert',
      message: message || 'Action required',
      is_read: false,
      metadata: {
        entity_type: entityType,
        entity_id: entityId,
        source: 'care_playbook',
        priority: priority || 'normal',
      },
    })
    .select('id')
    .single();

  if (error) {
    return { ...base, status: 'error', error: error.message };
  }

  return { ...base, status: 'completed', notification_id: notification?.id };
}

/**
 * Reassign entity to a different owner.
 */
async function executeReassign(supabase, tenantId, entityType, entityId, config, base) {
  const { strategy, target_id } = config;
  const tableName = getTableName(entityType);

  let newAssignee = target_id;

  if (strategy === 'manager') {
    // Look up current owner's manager via team_members
    const { data: entity } = await supabase
      .from(tableName)
      .select('assigned_to')
      .eq('id', entityId)
      .single();

    if (entity?.assigned_to) {
      const { data: memberRow } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('employee_id', entity.assigned_to)
        .limit(1)
        .single();

      if (memberRow?.team_id) {
        const { data: manager } = await supabase
          .from('team_members')
          .select('employee_id')
          .eq('team_id', memberRow.team_id)
          .eq('role', 'manager')
          .limit(1)
          .single();
        newAssignee = manager?.employee_id;
      }
    }
  }

  if (!newAssignee) {
    return { ...base, status: 'error', error: 'Could not resolve new assignee' };
  }

  const { error } = await supabase
    .from(tableName)
    .update({ assigned_to: newAssignee, updated_at: new Date().toISOString() })
    .eq('id', entityId)
    .eq('tenant_id', tenantId);

  if (error) {
    return { ...base, status: 'error', error: error.message };
  }

  return { ...base, status: 'completed', new_assignee: newAssignee };
}

/**
 * Update a field on the entity.
 */
async function executeUpdateField(supabase, tenantId, entityType, entityId, config, base) {
  const { field, value } = config;
  const tableName = getTableName(entityType);

  if (!field) {
    return { ...base, status: 'error', error: 'No field specified' };
  }

  const { error } = await supabase
    .from(tableName)
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', entityId)
    .eq('tenant_id', tenantId);

  if (error) {
    return { ...base, status: 'error', error: error.message };
  }

  return { ...base, status: 'completed', field, value };
}

/**
 * Send WhatsApp message via template (Twilio).
 * AI generation is NOT supported for WhatsApp — Meta requires pre-approved templates.
 */
async function executeSendWhatsApp(supabase, tenantId, entityType, entityId, config, base) {
  const { template_sid, template_variables } = config;

  if (!template_sid) {
    return { ...base, status: 'error', error: 'No WhatsApp template_sid configured' };
  }

  // Look up entity phone number
  const tableName = getTableName(entityType);
  const { data: entity } = await supabase
    .from(tableName)
    .select('phone, mobile_phone')
    .eq('id', entityId)
    .single();

  const phone = entity?.mobile_phone || entity?.phone;
  if (!phone) {
    return { ...base, status: 'error', error: 'Entity has no phone number' };
  }

  // Get tenant Twilio credentials
  let twilioClient;
  try {
    const { getTwilioCredentials } = await import('../lib/twilioService.js');
    const creds = await getTwilioCredentials(tenantId);
    if (!creds) {
      return { ...base, status: 'error', error: 'Twilio not configured for tenant' };
    }

    const twilio = (await import('twilio')).default;
    twilioClient = twilio(creds.accountSid, creds.authToken);
  } catch (err) {
    return { ...base, status: 'error', error: `Twilio init failed: ${err.message}` };
  }

  try {
    const message = await twilioClient.messages.create({
      from: `whatsapp:${config.from_number || ''}`,
      to: `whatsapp:${phone}`,
      contentSid: template_sid,
      contentVariables: JSON.stringify(template_variables || {}),
    });

    return { ...base, status: 'completed', message_sid: message.sid };
  } catch (err) {
    return { ...base, status: 'error', error: `WhatsApp send failed: ${err.message}` };
  }
}

/**
 * Escalate — create notification + optional escalation record.
 */
async function executeEscalate(supabase, tenantId, entityType, entityId, config, base) {
  const { severity, message, notify } = config;

  // Create escalation notification
  let targetEmail = null;
  if (notify === 'manager') {
    // Resolve entity owner's manager
    const { data: entity } = await supabase
      .from(getTableName(entityType))
      .select('assigned_to')
      .eq('id', entityId)
      .single();

    if (entity?.assigned_to) {
      const { data: memberRow } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('employee_id', entity.assigned_to)
        .limit(1)
        .single();

      if (memberRow?.team_id) {
        const { data: manager } = await supabase
          .from('team_members')
          .select('employee_id')
          .eq('team_id', memberRow.team_id)
          .eq('role', 'manager')
          .limit(1)
          .single();

        if (manager?.employee_id) {
          const { data: emp } = await supabase
            .from('employees')
            .select('email')
            .eq('id', manager.employee_id)
            .single();
          targetEmail = emp?.email;
        }
      }
    }
  }

  if (!targetEmail) {
    return { ...base, status: 'error', error: 'Could not resolve escalation target email' };
  }

  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      tenant_id: tenantId,
      user_email: targetEmail,
      type: 'escalation',
      title: `Escalation: ${severity || 'medium'} priority`,
      message: message || 'Entity requires attention',
      is_read: false,
      metadata: {
        entity_type: entityType,
        entity_id: entityId,
        severity,
        source: 'care_playbook',
      },
    })
    .select('id')
    .single();

  if (error) {
    return { ...base, status: 'error', error: error.message };
  }

  return { ...base, status: 'completed', notification_id: notification?.id, severity };
}

/**
 * Fire webhook mid-sequence.
 */
async function executeWebhook(tenantId, execution, playbook, step, base) {
  const { url, payload_template } = step.config || {};

  if (!url) {
    return { ...base, status: 'error', error: 'No webhook URL configured' };
  }

  const payload = {
    event_id: `playbook-step-${execution.id}-${step.step_id}`,
    type: 'care.playbook.step_webhook',
    tenant_id: tenantId,
    entity: {
      type: execution.entity_type,
      id: execution.entity_id,
    },
    playbook: {
      id: playbook.id,
      name: playbook.name,
    },
    execution_id: execution.id,
    step: step,
    timestamp: new Date().toISOString(),
    ...(payload_template || {}),
  };

  try {
    await triggerCareWorkflow({
      url,
      secret: step.config?.webhook_secret,
      payload,
    });
    return { ...base, status: 'completed', webhook_url: url };
  } catch (err) {
    return { ...base, status: 'error', error: `Webhook failed: ${err.message}` };
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Check if entity has had recent activity since the playbook started.
 */
async function checkEntityEngagement(supabase, entityType, entityId, playbookStartedAt) {
  const { data, error } = await supabase
    .from('activities')
    .select('id')
    .eq('related_to', entityType)
    .eq('related_id', entityId)
    .gt('created_at', playbookStartedAt)
    .in('type', ['email', 'call', 'meeting'])
    .limit(1);

  if (error) {
    logger.warn({ err: error }, '[PlaybookExecutor] Engagement check error — assuming not engaged');
    return false;
  }

  return data && data.length > 0;
}

/**
 * Map entity type to database table name.
 */
function getTableName(entityType) {
  const tableMap = {
    lead: 'leads',
    contact: 'contacts',
    account: 'accounts',
    opportunity: 'opportunities',
    activity: 'activities',
    bizdev_source: 'bizdev_sources',
  };
  return tableMap[entityType] || entityType;
}

/**
 * Mark an execution as failed.
 */
async function markExecutionFailed(supabase, executionId, reason) {
  await supabase
    .from('care_playbook_execution')
    .update({
      status: 'failed',
      stopped_reason: reason,
      completed_at: new Date().toISOString(),
    })
    .eq('id', executionId);
}

// ============================================================
// Public API for queuing
// ============================================================

/**
 * Queue a playbook execution for processing.
 * Called by carePlaybookRouter after creating the execution record.
 *
 * @param {string} executionId - care_playbook_execution UUID
 */
export async function queuePlaybookExecution(executionId) {
  await playbookQueue.add(
    'execute-playbook',
    {
      executionId,
    },
    {
      jobId: `playbook-exec-${executionId}`,
    },
  );

  logger.info({ executionId }, '[PlaybookExecutor] Execution queued');
}

export default {
  initPlaybookQueueProcessor,
  queuePlaybookExecution,
  executeCareSendEmailAction,
};
