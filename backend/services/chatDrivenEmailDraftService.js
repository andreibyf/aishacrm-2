import { getSupabaseClient } from '../lib/supabase-db.js';
import { executeCareSendEmailAction } from '../lib/care/carePlaybookExecutor.js';
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

function buildSourceRecord(entityType, entityId) {
  return {
    id: entityId,
    type: 'chat_ai_email',
    related_to: entityType,
    related_id: entityId,
  };
}

export async function generateChatDrivenEmailDraft(
  { tenantId, entityType, entityId, prompt, subject, conversationId, requireApproval = true, user },
  { supabase = getSupabaseClient(), executeSendEmailAction = executeCareSendEmailAction } = {},
) {
  const normalizedEntityType = normalizeEmailEntityType(entityType);
  if (!normalizedEntityType || !entityId) {
    throw buildServiceError(
      400,
      'chat_ai_email_invalid_context',
      'Chat-driven email drafting requires a supported entity context',
    );
  }

  const normalizedPrompt = cleanString(prompt);
  if (!normalizedPrompt) {
    throw buildServiceError(400, 'chat_ai_email_missing_prompt', 'A draft prompt is required');
  }

  const sourceRecord = buildSourceRecord(normalizedEntityType, entityId);
  const contextRecord = {
    tenant_id: tenantId,
    related_to: normalizedEntityType,
    related_id: entityId,
    related_email: null,
  };

  const [{ recipientEmail, entity }, notes, communications] = await Promise.all([
    loadRelatedEntityContext(supabase, contextRecord),
    loadRecentNotes(supabase, tenantId, contextRecord),
    loadRecentCommunications(supabase, tenantId, contextRecord),
  ]);

  if (!recipientEmail) {
    throw buildServiceError(
      400,
      'chat_ai_email_missing_recipient',
      'Unable to resolve recipient email for this record',
    );
  }

  const promptContext = formatContextBlock(contextRecord, entity, notes, communications);
  const mergedPrompt = promptContext ? `${normalizedPrompt}\n\n${promptContext}` : normalizedPrompt;
  const requestedAt = new Date().toISOString();
  const resolvedSubject = cleanString(subject) || `Follow up from ${user?.first_name || 'AiSHA'}`;

  const generationResult = await executeSendEmailAction(
    supabase,
    tenantId,
    normalizedEntityType,
    entityId,
    {
      to: recipientEmail,
      subject: resolvedSubject,
      body_prompt: mergedPrompt,
      use_ai_generation: true,
      require_approval: requireApproval !== false,
      source: 'chat_ai_email',
      activity_metadata: {
        chat_ai_email: {
          conversation_id: conversationId || null,
          generated_by_user_id: user?.id || null,
        },
      },
    },
    {
      status: 'completed',
      timestamp: requestedAt,
      conversation_id: conversationId || null,
    },
  );

  await createAiEmailDraftNotification(supabase, {
    tenantId,
    source: 'chat_ai_email',
    sourceRecord,
    generationResult,
    recipientEmail,
    userEmail: user?.email,
  });

  const responseMessage =
    generationResult.status === 'pending_approval'
      ? `I drafted an email for ${recipientEmail} and sent it for approval.`
      : `I drafted an email for ${recipientEmail} and queued it for delivery.`;

  return {
    response: responseMessage,
    recipient_email: recipientEmail,
    subject: resolvedSubject,
    generation_result: generationResult,
    context_summary: {
      notes_count: notes.length,
      communications_count: communications.length,
    },
  };
}
