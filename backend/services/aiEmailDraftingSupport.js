import logger from '../lib/logger.js';

export function buildServiceError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function buildMissingEmailMessage(entityType, entity) {
  const label = entityType === 'bizdev_source' ? 'BizDev source' : entityType;
  const name =
    entity?.first_name || entity?.last_name
      ? `${entity.first_name || ''} ${entity.last_name || ''}`.trim()
      : entity?.name || 'this record';
  return `This ${label} (${name}) has no email address. Please add one before drafting an email.`;
}

export function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function cleanString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function normalizeEmailEntityType(entityType) {
  const normalized = cleanString(entityType)?.toLowerCase();
  const map = {
    lead: 'lead',
    leads: 'lead',
    contact: 'contact',
    contacts: 'contact',
    account: 'account',
    accounts: 'account',
    opportunity: 'opportunity',
    opportunities: 'opportunity',
    bizdev_source: 'bizdev_source',
    'bizdev-sources': 'bizdev_source',
    bizdev_sources: 'bizdev_source',
  };

  return map[normalized] || null;
}

export function buildEntityTableName(entityType) {
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
  if (entityType === 'account')
    return 'id, name, email, assigned_to, assigned_to_name, assigned_to_team';
  if (entityType === 'opportunity')
    return 'id, name, contact_id, lead_id, assigned_to, assigned_to_name, assigned_to_team';
  // contacts table has no 'company' column \u2014 company comes from joined accounts
  if (entityType === 'contact')
    return 'id, first_name, last_name, email, assigned_to, assigned_to_name, assigned_to_team, accounts!contacts_account_id_fkey(name)';
  return 'id, first_name, last_name, company, email, assigned_to, assigned_to_name, assigned_to_team';
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
    throw buildServiceError(500, 'ai_email_related_lookup_failed', result.error.message);
  }

  return cleanString(result.data?.email);
}

async function resolveRelatedRecipientEmail(supabase, activityLike, entity) {
  const directEmail = cleanString(activityLike.related_email);
  if (directEmail) return directEmail;

  if (activityLike.related_to === 'opportunity') {
    const contactEmail = await loadEntityEmailById(
      supabase,
      activityLike.tenant_id,
      'contact',
      entity?.contact_id,
    );
    if (contactEmail) return contactEmail;

    return loadEntityEmailById(supabase, activityLike.tenant_id, 'lead', entity?.lead_id);
  }

  return cleanString(entity?.email);
}

export async function loadRelatedEntityContext(supabase, activityLike) {
  if (!activityLike.related_to || !activityLike.related_id) {
    return { recipientEmail: cleanString(activityLike.related_email), entity: null };
  }

  const normalizedEntityType = normalizeEmailEntityType(activityLike.related_to);
  const tableName = buildEntityTableName(normalizedEntityType);
  if (!tableName) {
    return { recipientEmail: cleanString(activityLike.related_email), entity: null };
  }

  const result = await supabase
    .from(tableName)
    .select(buildEntitySelectColumns(normalizedEntityType))
    .eq('tenant_id', activityLike.tenant_id)
    .eq('id', activityLike.related_id)
    .maybeSingle();

  if (result.error) {
    throw buildServiceError(500, 'ai_email_related_lookup_failed', result.error.message);
  }

  const entity = result.data || null;
  return {
    recipientEmail: await resolveRelatedRecipientEmail(supabase, activityLike, entity),
    entity,
  };
}

export async function loadRecentNotes(supabase, tenantId, activityLike) {
  if (!activityLike.related_to || !activityLike.related_id) return [];

  const normalizedEntityType = normalizeEmailEntityType(activityLike.related_to);
  const result = await supabase
    .from('note')
    .select('id, title, content, created_at')
    .eq('tenant_id', tenantId)
    .eq('related_type', normalizedEntityType || activityLike.related_to)
    .eq('related_id', activityLike.related_id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (result.error) {
    throw buildServiceError(500, 'ai_email_notes_lookup_failed', result.error.message);
  }

  return result.data || [];
}

export async function loadRecentCommunications(supabase, tenantId, activityLike) {
  if (!activityLike.related_to || !activityLike.related_id) return [];

  const normalizedEntityType = normalizeEmailEntityType(activityLike.related_to);
  const linksResult = await supabase
    .from('communications_entity_links')
    .select('thread_id, message_id')
    .eq('tenant_id', tenantId)
    .eq('entity_type', normalizedEntityType || activityLike.related_to)
    .eq('entity_id', activityLike.related_id)
    .limit(10);

  if (linksResult.error) {
    throw buildServiceError(500, 'ai_email_links_lookup_failed', linksResult.error.message);
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
    throw buildServiceError(500, 'ai_email_messages_lookup_failed', messagesResult.error.message);
  }

  return messagesResult.data || [];
}

export function formatContextBlock(activityLike, relatedEntity, notes, communications) {
  const contextSections = [];

  if (activityLike.related_to && activityLike.related_id) {
    contextSections.push(
      `Related CRM record: ${JSON.stringify({
        type: activityLike.related_to,
        id: activityLike.related_id,
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

function buildAiEmailDraftNotificationPayload({
  tenantId,
  source,
  sourceRecord,
  generationResult,
  recipientEmail,
  userEmail,
}) {
  if (!userEmail) return null;

  const status = generationResult?.status || 'completed';
  const title =
    status === 'pending_approval'
      ? 'AI email draft ready for approval'
      : 'AI email draft generated';
  const description =
    status === 'pending_approval'
      ? `A draft for ${recipientEmail} is waiting for your approval.`
      : `A draft for ${recipientEmail} was generated and queued.`;

  return {
    tenant_id: tenantId,
    user_email: userEmail,
    type: 'info',
    title,
    message: description,
    is_read: false,
    metadata: {
      description,
      icon: 'bell',
      link: '/activities',
      source,
      source_record_id: sourceRecord?.id || null,
      source_record_type: sourceRecord?.type || null,
      related_to: sourceRecord?.related_to || null,
      related_id: sourceRecord?.related_id || null,
      recipient_email: recipientEmail,
      generation_status: status,
      suggestion_id: generationResult?.suggestion_id || null,
      generated_activity_id: generationResult?.activity_id || null,
    },
  };
}

export async function createAiEmailDraftNotification(
  supabase,
  { tenantId, source, sourceRecord, generationResult, recipientEmail, userEmail },
) {
  const notificationPayload = buildAiEmailDraftNotificationPayload({
    tenantId,
    source,
    sourceRecord,
    generationResult,
    recipientEmail,
    userEmail: cleanString(userEmail),
  });

  if (!notificationPayload) return null;

  const { data, error } = await supabase
    .from('notifications')
    .insert(notificationPayload)
    .select('id')
    .single();

  if (error) {
    logger.warn(
      { err: error, tenantId, source, sourceRecordId: sourceRecord?.id || null },
      '[aiEmailDraftingSupport] Failed to create draft notification',
    );
    return null;
  }

  return data?.id || null;
}
