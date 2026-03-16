import { getSupabaseClient } from '../lib/supabase-db.js';
import { executeCareSendEmailAction } from '../lib/care/carePlaybookExecutor.js';

function buildServiceError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function buildEntityTableName(entityType) {
  const tableMap = {
    lead: 'leads',
    contact: 'contacts',
    account: 'accounts',
    opportunity: 'opportunities',
    bizdev_source: 'bizdev_sources',
  };

  return tableMap[entityType] || null;
}

function buildEntitySelectColumns(entityType) {
  if (entityType === 'account') return 'id, name, email';
  if (entityType === 'opportunity') return 'id, name, contact_id, lead_id';
  if (entityType === 'bizdev_source') return 'id, first_name, last_name, company_name, email';
  return 'id, first_name, last_name, company, email';
}

async function loadEntityEmailById(supabase, tenantId, entityType, entityId) {
  const tableName = buildEntityTableName(entityType);
  if (!tableName || !entityId) return null;

  const result = await supabase
    .from(tableName)
    .select('id, email')
    .eq('tenant_id', tenantId)
    .eq('id', entityId)
    .maybeSingle();

  if (result.error) {
    throw buildServiceError(500, 'scheduled_ai_email_related_lookup_failed', result.error.message);
  }

  return cleanString(result.data?.email);
}

async function resolveRelatedRecipientEmail(supabase, activity, entity) {
  const directEmail = cleanString(activity.related_email);
  if (directEmail) return directEmail;

  if (activity.related_to === 'opportunity') {
    const contactEmail = await loadEntityEmailById(
      supabase,
      activity.tenant_id,
      'contact',
      entity?.contact_id,
    );
    if (contactEmail) return contactEmail;

    return loadEntityEmailById(supabase, activity.tenant_id, 'lead', entity?.lead_id);
  }

  return cleanString(entity?.email);
}

async function loadRelatedEntityContext(supabase, activity) {
  if (!activity.related_to || !activity.related_id) {
    return { recipientEmail: cleanString(activity.related_email), entity: null };
  }

  const tableName = buildEntityTableName(activity.related_to);
  if (!tableName) {
    return { recipientEmail: cleanString(activity.related_email), entity: null };
  }

  const result = await supabase
    .from(tableName)
    .select(buildEntitySelectColumns(activity.related_to))
    .eq('tenant_id', activity.tenant_id)
    .eq('id', activity.related_id)
    .maybeSingle();

  if (result.error) {
    throw buildServiceError(500, 'scheduled_ai_email_related_lookup_failed', result.error.message);
  }

  const entity = result.data || null;
  return {
    recipientEmail: await resolveRelatedRecipientEmail(supabase, activity, entity),
    entity,
  };
}

async function loadRecentNotes(supabase, tenantId, activity) {
  if (!activity.related_to || !activity.related_id) return [];

  const result = await supabase
    .from('note')
    .select('id, title, content, created_at')
    .eq('tenant_id', tenantId)
    .eq('related_type', activity.related_to)
    .eq('related_id', activity.related_id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (result.error) {
    throw buildServiceError(500, 'scheduled_ai_email_notes_lookup_failed', result.error.message);
  }

  return result.data || [];
}

async function loadRecentCommunications(supabase, tenantId, activity) {
  if (!activity.related_to || !activity.related_id) return [];

  const linksResult = await supabase
    .from('communications_entity_links')
    .select('thread_id, message_id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', activity.related_to)
    .eq('entity_id', activity.related_id)
    .limit(10);

  if (linksResult.error) {
    throw buildServiceError(
      500,
      'scheduled_ai_email_links_lookup_failed',
      linksResult.error.message,
    );
  }

  const links = linksResult.data || [];
  const messageIds = [...new Set(links.map((link) => link.message_id).filter(Boolean))];

  if (messageIds.length === 0) return [];

  const messagesResult = await supabase
    .from('communications_messages')
    .select('id, thread_id, direction, subject, sender_email, sender_name, received_at, text_body')
    .eq('tenant_id', tenantId)
    .in('id', messageIds)
    .order('received_at', { ascending: false })
    .limit(5);

  if (messagesResult.error) {
    throw buildServiceError(
      500,
      'scheduled_ai_email_messages_lookup_failed',
      messagesResult.error.message,
    );
  }

  return messagesResult.data || [];
}

function formatContextBlock(activity, relatedEntity, notes, communications) {
  const contextSections = [];

  if (activity.related_to && activity.related_id) {
    contextSections.push(
      `Related CRM record: ${JSON.stringify({
        type: activity.related_to,
        id: activity.related_id,
        entity: relatedEntity || null,
      })}`,
    );
  }

  if (notes.length > 0) {
    contextSections.push(
      `Recent notes:\n${notes
        .map((note) => `- ${note.title || 'Note'}: ${cleanString(note.content) || ''}`)
        .join('\n')}`,
    );
  }

  if (communications.length > 0) {
    contextSections.push(
      `Recent email context:\n${communications
        .map(
          (message) =>
            `- [${message.direction}] ${message.subject || 'No subject'} from ${message.sender_email || message.sender_name || 'unknown'}: ${cleanString(message.text_body)?.slice(0, 280) || ''}`,
        )
        .join('\n')}`,
    );
  }

  return contextSections.join('\n\n');
}

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


  if (generationResult?.status === 'error') {
    throw buildServiceError(
      502,
      'scheduled_ai_email_generation_failed',
      cleanString(generationResult.error) ||
        cleanString(generationResult.message) ||
        'AI email draft generation failed',
    );
  }
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

  return {
    activity: updatedActivityResult.data,
    generation_result: generationResult,
  };
}
