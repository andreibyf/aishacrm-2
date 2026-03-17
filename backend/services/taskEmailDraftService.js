/**
 * Task-Driven Email Draft Service
 *
 * Generates AI email drafts from tasks/activities by:
 * 1. Loading the activity record (task, todo, call, meeting, etc.)
 * 2. Extracting task context: subject, description, due date, priority
 * 3. Loading related CRM entity data, notes, and communications
 * 4. Merging everything into a rich prompt for the AI engine
 * 5. Routing through the CARE playbook for approval/delivery
 */

import { getSupabaseClient } from '../lib/supabase-db.js';
import {
  buildServiceError,
  cleanString,
  normalizeEmailEntityType,
  loadRelatedEntityContext,
  loadRecentNotes,
  loadRecentCommunications,
  formatContextBlock,
  createAiEmailDraftNotification,
} from './aiEmailDraftingSupport.js';

function buildTaskContextPrompt(activity) {
  const parts = [];

  if (activity.subject) {
    parts.push(`Task subject: ${activity.subject}`);
  }
  if (activity.description) {
    parts.push(`Task description: ${activity.description}`);
  }
  if (activity.body) {
    parts.push(`Task details: ${activity.body}`);
  }
  if (activity.type) {
    parts.push(`Task type: ${activity.type}`);
  }
  if (activity.status) {
    parts.push(`Task status: ${activity.status}`);
  }
  if (activity.priority) {
    parts.push(`Priority: ${activity.priority}`);
  }
  if (activity.due_date) {
    parts.push(`Due date: ${activity.due_date}`);
  }

  return parts.length > 0 ? `Task context:\n${parts.join('\n')}` : '';
}

function resolveEntityType(activity) {
  if (activity.related_to) return normalizeEmailEntityType(activity.related_to);
  if (activity.contact_id) return 'contact';
  if (activity.lead_id) return 'lead';
  if (activity.account_id) return 'account';
  if (activity.opportunity_id) return 'opportunity';
  return null;
}

function resolveEntityId(activity, entityType) {
  if (activity.related_id) return activity.related_id;
  if (entityType === 'contact') return activity.contact_id;
  if (entityType === 'lead') return activity.lead_id;
  if (entityType === 'account') return activity.account_id;
  if (entityType === 'opportunity') return activity.opportunity_id;
  return null;
}

export async function generateTaskEmailDraft(
  { tenantId, activityId, prompt, subject, conversationId, requireApproval = true, user },
  { supabase = getSupabaseClient(), executeSendEmailAction } = {},
) {
  if (!activityId) {
    throw buildServiceError(400, 'task_email_missing_activity', 'An activity_id is required');
  }

  // 1. Load the activity record
  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select(
      'id, tenant_id, type, subject, body, description, status, priority, due_date, related_to, related_id, related_email, related_name, contact_id, lead_id, account_id, opportunity_id, activity_metadata',
    )
    .eq('tenant_id', tenantId)
    .eq('id', activityId)
    .maybeSingle();

  if (activityError) {
    throw buildServiceError(500, 'task_email_activity_lookup_failed', activityError.message);
  }
  if (!activity) {
    throw buildServiceError(404, 'task_email_activity_not_found', 'Activity not found');
  }

  // 2. Resolve linked entity
  const entityType = resolveEntityType(activity);
  const entityId = entityType ? resolveEntityId(activity, entityType) : null;

  const contextRecord = {
    tenant_id: tenantId,
    related_to: entityType,
    related_id: entityId,
    related_email: cleanString(activity.related_email),
  };

  // 3. Load CRM context in parallel
  const [{ recipientEmail, entity }, notes, communications] = await Promise.all([
    loadRelatedEntityContext(supabase, contextRecord),
    loadRecentNotes(supabase, tenantId, contextRecord),
    loadRecentCommunications(supabase, tenantId, contextRecord),
  ]);

  if (!recipientEmail) {
    throw buildServiceError(
      400,
      'task_email_missing_recipient',
      'Unable to resolve recipient email from this task or its related record',
    );
  }

  // 4. Build merged prompt with task context + CRM context
  const taskContext = buildTaskContextPrompt(activity);
  const crmContext = formatContextBlock(contextRecord, entity, notes, communications);
  const userPrompt = cleanString(prompt) || 'Draft a professional email based on this task.';

  const promptParts = [userPrompt];
  if (taskContext) promptParts.push(taskContext);
  if (crmContext) promptParts.push(crmContext);
  const mergedPrompt = promptParts.join('\n\n');

  const requestedAt = new Date().toISOString();
  const resolvedSubject =
    cleanString(subject) || cleanString(activity.subject) || `Follow up from ${user?.first_name || 'AiSHA'}`;

  const sourceRecord = {
    id: activityId,
    type: 'task_ai_email',
    related_to: entityType,
    related_id: entityId,
  };

  // 5. Generate via CARE playbook (lazy-load to avoid Redis queue init in tests)
  if (!executeSendEmailAction) {
    const { executeCareSendEmailAction } = await import('../lib/care/carePlaybookExecutor.js');
    executeSendEmailAction = executeCareSendEmailAction;
  }

  const generationResult = await executeSendEmailAction(
    supabase,
    tenantId,
    entityType || 'activity',
    entityId || activityId,
    {
      to: recipientEmail,
      subject: resolvedSubject,
      body_prompt: mergedPrompt,
      use_ai_generation: true,
      require_approval: requireApproval !== false,
      source: 'task_ai_email',
      activity_metadata: {
        task_ai_email: {
          activity_id: activityId,
          activity_type: activity.type || null,
          conversation_id: conversationId || null,
          generated_by_user_id: user?.id || null,
        },
      },
    },
    {
      status: 'completed',
      timestamp: requestedAt,
      activity_id: activityId,
      conversation_id: conversationId || null,
    },
  );

  // 6. Create notification
  await createAiEmailDraftNotification(supabase, {
    tenantId,
    source: 'task_ai_email',
    sourceRecord,
    generationResult,
    recipientEmail,
    userEmail: user?.email,
  });

  const responseMessage =
    generationResult.status === 'pending_approval'
      ? `I drafted an email based on the task "${cleanString(activity.subject) || 'task'}" for ${recipientEmail} and sent it for approval.`
      : `I drafted an email based on the task "${cleanString(activity.subject) || 'task'}" for ${recipientEmail} and queued it for delivery.`;

  return {
    response: responseMessage,
    recipient_email: recipientEmail,
    subject: resolvedSubject,
    activity: { id: activity.id, type: activity.type, subject: activity.subject },
    generation_result: generationResult,
    context_summary: {
      notes_count: notes.length,
      communications_count: communications.length,
      has_task_context: Boolean(taskContext),
    },
  };
}
