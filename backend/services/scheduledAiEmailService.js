import { getSupabaseClient } from '../lib/supabase-db.js';
import { executeCareSendEmailAction } from '../lib/care/carePlaybookExecutor.js';
import {
  buildServiceError,
  asObject,
  cleanString,
  loadRelatedEntityContext,
  loadRecentNotes,
  loadRecentCommunications,
  formatContextBlock,
  createAiEmailDraftNotification,
} from './aiEmailDraftingSupport.js';

export async function generateScheduledAiEmailDraft(
  { tenantId, activityId, user },
  { supabase = getSupabaseClient(), executeSendEmailAction = executeCareSendEmailAction } = {},
) {
  const activityResult = await supabase
    .from('activities')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', activityId)
    .maybeSingle();

  if (activityResult.error) {
    throw buildServiceError(
      500,
      'scheduled_ai_email_activity_lookup_failed',
      activityResult.error.message,
    );
  }

  const activity = activityResult.data;
  if (!activity) {
    throw buildServiceError(404, 'scheduled_ai_email_not_found', 'Activity not found');
  }

  if (activity.type !== 'scheduled_ai_email') {
    throw buildServiceError(
      400,
      'scheduled_ai_email_invalid_type',
      'Activity must be of type scheduled_ai_email',
    );
  }

  const metadata = asObject(activity.metadata);
  const aiEmailConfig = {
    ...asObject(metadata.ai_email_config),
    ...asObject(activity.ai_email_config),
  };

  const subject = cleanString(aiEmailConfig.subject_template) || cleanString(activity.subject);
  const bodyPrompt = cleanString(aiEmailConfig.body_prompt);

  if (!subject || !bodyPrompt) {
    throw buildServiceError(
      400,
      'scheduled_ai_email_missing_config',
      'scheduled_ai_email requires ai_email_config.subject_template and body_prompt',
    );
  }

  const [{ recipientEmail, entity }, notes, communications] = await Promise.all([
    loadRelatedEntityContext(supabase, activity),
    loadRecentNotes(supabase, tenantId, activity),
    loadRecentCommunications(supabase, tenantId, activity),
  ]);

  if (!recipientEmail) {
    throw buildServiceError(
      400,
      'scheduled_ai_email_missing_recipient',
      'Unable to resolve recipient email for scheduled_ai_email activity',
    );
  }

  const promptContext = formatContextBlock(activity, entity, notes, communications);
  const mergedPrompt = promptContext ? `${bodyPrompt}\n\n${promptContext}` : bodyPrompt;
  const requestedAt = new Date().toISOString();

  const generationResult = await executeSendEmailAction(
    supabase,
    tenantId,
    activity.related_to || 'activity',
    activity.related_id || activity.id,
    {
      to: recipientEmail,
      subject,
      body_prompt: mergedPrompt,
      use_ai_generation: true,
      require_approval:
        typeof aiEmailConfig.require_approval === 'boolean' ? aiEmailConfig.require_approval : true,
      source: 'scheduled_ai_email',
      activity_metadata: {
        scheduled_ai_email: {
          source_activity_id: activity.id,
          generated_from_type: activity.type,
        },
      },
    },
    {
      status: 'completed',
      source_activity_id: activity.id,
      timestamp: requestedAt,
    },
  );

  const nextMetadata = {
    ...metadata,
    ai_email_generation: {
      requested_at: requestedAt,
      requested_by: user?.email || user?.id || 'unknown',
      recipient_email: recipientEmail,
      subject,
      status: generationResult.status,
      suggestion_id: generationResult.suggestion_id || null,
      generated_activity_id: generationResult.activity_id || null,
      tokens: generationResult.tokens || 0,
      context_summary: {
        notes_count: notes.length,
        communications_count: communications.length,
      },
    },
  };

  const updatedActivityResult = await supabase
    .from('activities')
    .update({
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', activity.id)
    .select('*')
    .single();

  if (updatedActivityResult.error) {
    throw buildServiceError(
      500,
      'scheduled_ai_email_update_failed',
      updatedActivityResult.error.message,
    );
  }

  await createAiEmailDraftNotification(supabase, {
    tenantId,
    source: 'scheduled_ai_email',
    sourceRecord: updatedActivityResult.data,
    generationResult,
    recipientEmail,
    userEmail: user?.email,
  });

  return {
    activity: updatedActivityResult.data,
    generation_result: generationResult,
  };
}
