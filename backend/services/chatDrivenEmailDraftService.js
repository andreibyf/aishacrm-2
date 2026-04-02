import { getSupabaseClient } from '../lib/supabase-db.js';
import { executeCareSendEmailAction } from '../lib/care/carePlaybookExecutor.js';
import {
  buildServiceError,
  buildMissingEmailMessage,
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

/**
 * Derive a short, intent-based subject line from the user's prompt.
 * Extracts the core action/topic (e.g. "Discuss staffing needs" from
 * "draft an email to discuss their staffing needs over lunch").
 */
function deriveSubjectFromPrompt(prompt) {
  if (!prompt) return 'Follow up';
  const lower = prompt.toLowerCase();

  // Strip common email-drafting prefixes to get to the actual intent
  const stripped = lower
    .replace(/^(draft|write|compose|create|send)\s+(an?\s+)?(email|message|note)\s*/i, '')
    .replace(/^(to\s+\S+\s+)?(to|for|about|regarding)\s+/i, '')
    .trim();

  // Try to extract intent via action verbs first (highest quality subjects)
  // Regexes simplified to avoid ReDoS: no nested quantifiers, bounded repetitions
  const actionPatterns = [
    /(?:discuss|propose|schedule|invite|confirm|follow.?up|introduce|request)\s+([^.,;]{3,60})(?:\s+for\s+(?:one|some|his|her|their|my)\b)?(?:\.|$)/i,
    /(?:ask)\s+(?:\w+\s+)?(?:if|whether|about)\s+([^.,;]{5,60})(?:\.|$)/i,
    /(?:interested\s+in|attending|invitation\s+to)\s+([^.,;]{3,50})(?:\s+for\s+(?:one|some|his|her|their|my)\b)?(?:\.|$)/i,
  ];

  for (const pattern of actionPatterns) {
    const match = stripped.match(pattern);
    if (match?.[1]) {
      const raw = match[1]
        .trim()
        .replace(/[,;:]+$/, '')
        .replace(/\s+for\s+(?:one|some|his|her|their|my)\b.*$/i, '')
        .trim();
      if (raw.length >= 3) {
        return raw.charAt(0).toUpperCase() + raw.slice(1);
      }
    }
  }

  // Second pass: broad topic extraction (about/regarding/re:)
  const topicMatch = stripped.match(
    /(?:about|regarding|re:)\s+([^.,;]{5,60})(?:\.|$|over\s|via\s|through\s|by\s+(?:email|phone))/i,
  );
  if (topicMatch?.[1]) {
    const raw = topicMatch[1]
      .trim()
      .replace(/[,;:]+$/, '')
      .trim();
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  // Fallback: take the first meaningful clause (up to 60 chars)
  if (stripped.length >= 5) {
    // Remove recipient name reference and trailing prepositions
    const fallback = stripped
      .replace(/^\S+\s+/, '') // drop leading name
      .replace(/\s+for\s+(?:one|some|his|her|their|my)\b.*$/i, '')
      .trim();
    if (fallback.length >= 5 && fallback.length <= 60) {
      return fallback.charAt(0).toUpperCase() + fallback.slice(1).replace(/[.!?]+$/, '');
    }
    // Last resort: truncate to first 60 chars at a word boundary
    const truncated = stripped
      .slice(0, 60)
      .replace(/\s+\S*$/, '')
      .trim();
    if (truncated.length >= 5) {
      return truncated.charAt(0).toUpperCase() + truncated.slice(1).replace(/[.!?]+$/, '');
    }
  }

  return 'Follow up';
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
      buildMissingEmailMessage(normalizedEntityType, entity),
    );
  }

  const promptContext = formatContextBlock(contextRecord, entity, notes, communications);
  const mergedPrompt = promptContext ? `${normalizedPrompt}\n\n${promptContext}` : normalizedPrompt;
  const requestedAt = new Date().toISOString();
  const resolvedSubject = cleanString(subject) || deriveSubjectFromPrompt(normalizedPrompt);

  // Resolve entity display name for the suggestion card
  const entityDisplayName = entity
    ? entity.first_name || entity.last_name
      ? `${entity.first_name || ''} ${entity.last_name || ''}`.trim()
      : entity.name || null
    : null;

  // Resolve sign-off: prefer assigned_to_name, fall back to employee lookup, then logged-in user
  let resolvedSenderName = null;
  if (entity?.assigned_to_name) {
    resolvedSenderName = entity.assigned_to_name;
  } else if (entity?.assigned_to) {
    try {
      const { data: assignedEmp } = await supabase
        .from('employees')
        .select('first_name, last_name')
        .eq('id', entity.assigned_to)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (assignedEmp?.first_name) {
        resolvedSenderName = `${assignedEmp.first_name}${assignedEmp.last_name ? ' ' + assignedEmp.last_name : ''}`;
      }
    } catch (_) {
      /* non-critical */
    }
  }
  if (!resolvedSenderName) {
    resolvedSenderName =
      user?.first_name || user?.user_metadata?.first_name
        ? `${user.first_name || user.user_metadata?.first_name}${user.last_name || user.user_metadata?.last_name ? ' ' + (user.last_name || user.user_metadata?.last_name) : ''}`
        : null;
  }

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
      sender_name: resolvedSenderName,
      record_name: entityDisplayName,
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

  // Resolve a human-readable name for the response message
  const recipientName = entity
    ? entity.first_name || entity.last_name
      ? `${entity.first_name || ''} ${entity.last_name || ''}`.trim()
      : entity.name || null
    : null;
  const recipientLabel = recipientName || recipientEmail;

  const responseMessage =
    generationResult.status === 'pending_approval'
      ? `I drafted an email for ${recipientLabel} and sent it for approval.`
      : `I drafted an email for ${recipientLabel} and queued it for delivery.`;

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
