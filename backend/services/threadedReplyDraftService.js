import { getSupabaseClient } from '../lib/supabase-db.js';
import { executeCareSendEmailAction } from '../lib/care/carePlaybookExecutor.js';
import {
  buildServiceError,
  cleanString,
  createAiEmailDraftNotification,
  formatContextBlock,
  loadRelatedEntityContext,
  loadRecentNotes,
  normalizeEmailEntityType,
} from './aiEmailDraftingSupport.js';
import { getCommunicationsThreadMessages } from './communicationsReadService.js';

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeEmail(value) {
  return cleanString(value)?.toLowerCase() || null;
}

function normalizeAddress(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const email = cleanString(entry);
    return email ? { email, name: null } : null;
  }

  if (typeof entry === 'object') {
    const email = cleanString(entry.email);
    if (!email) return null;
    return {
      email,
      name: cleanString(entry.name),
    };
  }

  return null;
}

function pickPrimaryLinkedEntity(thread) {
  for (const link of asArray(thread?.linked_entities)) {
    const entityType = normalizeEmailEntityType(link.entity_type);
    if (entityType && link.entity_id) {
      return {
        entityType,
        entityId: String(link.entity_id),
      };
    }
  }

  return {
    entityType: null,
    entityId: null,
  };
}

function ensureReplySubject(subject, fallbackSubject) {
  const baseSubject = cleanString(subject) || cleanString(fallbackSubject) || 'Follow up';
  if (/^(re|aw):\s*/i.test(baseSubject)) {
    return baseSubject;
  }
  return `Re: ${baseSubject}`;
}

function pickReplyRecipient({ thread, messages, relatedRecipientEmail, user }) {
  const mailboxAddress = normalizeEmail(thread?.mailbox_address);
  const userEmail = normalizeEmail(user?.email);
  const isInternalAddress = (email) => {
    const normalized = normalizeEmail(email);
    return Boolean(normalized && (normalized === mailboxAddress || normalized === userEmail));
  };

  for (const message of [...asArray(messages)].reverse()) {
    if (message?.direction === 'inbound' && cleanString(message.sender_email)) {
      return cleanString(message.sender_email);
    }
  }

  for (const participant of asArray(thread?.participants)) {
    const normalized = normalizeAddress(participant);
    if (!normalized?.email || isInternalAddress(normalized.email)) {
      continue;
    }
    return normalized.email;
  }

  return cleanString(relatedRecipientEmail);
}

function buildThreadHistoryContext(thread, messages) {
  const participantSummary = asArray(thread?.participants)
    .map((participant) => normalizeAddress(participant)?.email)
    .filter(Boolean)
    .join(', ');

  const messageLines = asArray(messages)
    .slice(-10)
    .map((message) => {
      const timestamp = cleanString(message.received_at) || 'unknown time';
      const sender = cleanString(message.sender_email) || cleanString(message.sender_name) || 'unknown';
      const excerpt = cleanString(message.text_body || message.html_body)?.slice(0, 280) || '';
      return `- [${message.direction || 'unknown'}] ${timestamp} ${sender}: ${message.subject || 'No subject'}${excerpt ? ` :: ${excerpt}` : ''}`;
    });

  const sections = [
    `Canonical thread: ${JSON.stringify({
      id: thread?.id || null,
      mailbox_id: thread?.mailbox_id || null,
      mailbox_address: thread?.mailbox_address || null,
      subject: thread?.subject || null,
      participants: participantSummary || null,
      status: thread?.status || null,
    })}`,
  ];

  if (messageLines.length > 0) {
    sections.push(`Canonical thread history:\n${messageLines.join('\n')}`);
  }

  return sections.join('\n\n');
}

function collectThreadReferenceIds(messages) {
  return [...new Set(asArray(messages).map((message) => cleanString(message.internet_message_id)).filter(Boolean))];
}

export async function generateThreadedReplyDraft(
  { tenantId, threadId, prompt, subject, requireApproval = true, user },
  {
    supabase = getSupabaseClient(),
    getThreadMessages = getCommunicationsThreadMessages,
    executeSendEmailAction = executeCareSendEmailAction,
  } = {},
) {
  if (!cleanString(threadId)) {
    throw buildServiceError(
      400,
      'threaded_ai_reply_missing_thread',
      'A communication thread is required',
    );
  }

  const normalizedPrompt = cleanString(prompt);
  if (!normalizedPrompt) {
    throw buildServiceError(
      400,
      'threaded_ai_reply_missing_prompt',
      'A draft prompt is required',
    );
  }

  const threadResult = await getThreadMessages(
    {
      tenantId,
      threadId,
      limit: 100,
      offset: 0,
    },
    { supabase },
  );

  if (!threadResult?.thread) {
    throw buildServiceError(
      404,
      'threaded_ai_reply_thread_not_found',
      'Communication thread not found',
    );
  }

  const thread = threadResult.thread;
  const messages = asArray(threadResult.messages);
  const { entityType, entityId } = pickPrimaryLinkedEntity(thread);
  const contextRecord = {
    tenant_id: tenantId,
    related_to: entityType,
    related_id: entityId,
    related_email: null,
  };

  const [{ recipientEmail: relatedRecipientEmail, entity }, notes] = await Promise.all([
    entityType && entityId
      ? loadRelatedEntityContext(supabase, contextRecord)
      : { recipientEmail: null, entity: null },
    entityType && entityId ? loadRecentNotes(supabase, tenantId, contextRecord) : [],
  ]);

  const recipientEmail = pickReplyRecipient({
    thread,
    messages,
    relatedRecipientEmail,
    user,
  });

  if (!recipientEmail) {
    throw buildServiceError(
      400,
      'threaded_ai_reply_missing_recipient',
      'Unable to resolve a reply recipient for this thread',
    );
  }

  const threadContext = buildThreadHistoryContext(thread, messages);
  const crmContext = entityType && entityId ? formatContextBlock(contextRecord, entity, notes, []) : '';
  const mergedPrompt = [normalizedPrompt, crmContext, threadContext].filter(Boolean).join('\n\n');
  const lastMessage = messages[messages.length - 1] || null;
  const references = collectThreadReferenceIds(messages);
  const inReplyTo = cleanString(lastMessage?.internet_message_id) || references[references.length - 1] || null;
  const requestedAt = new Date().toISOString();
  const resolvedSubject = ensureReplySubject(subject, thread.subject);

  const generationResult = await executeSendEmailAction(
    supabase,
    tenantId,
    entityType || 'activity',
    entityId || thread.id,
    {
      to: recipientEmail,
      subject: resolvedSubject,
      body_prompt: mergedPrompt,
      use_ai_generation: true,
      require_approval: requireApproval !== false,
      source: 'threaded_ai_reply',
      email: {
        in_reply_to: inReplyTo,
        references,
      },
      communications: {
        thread_id: thread.id,
        mailbox_id: thread.mailbox_id || null,
        mailbox_address: thread.mailbox_address || null,
        participants: asArray(thread.participants),
      },
      activity_metadata: {
        threaded_ai_reply: {
          source_thread_id: thread.id,
          source_message_id: lastMessage?.id || null,
          generated_by_user_id: user?.id || null,
        },
      },
    },
    {
      status: 'completed',
      thread_id: thread.id,
      timestamp: requestedAt,
    },
  );

  await createAiEmailDraftNotification(supabase, {
    tenantId,
    source: 'threaded_ai_reply',
    sourceRecord: {
      id: thread.id,
      type: 'communications_thread',
      related_to: entityType,
      related_id: entityId,
    },
    generationResult,
    recipientEmail,
    userEmail: user?.email,
  });

  return {
    response:
      generationResult.status === 'pending_approval'
        ? `I drafted a threaded reply for ${recipientEmail} and sent it for approval.`
        : `I drafted a threaded reply for ${recipientEmail} and queued it for delivery.`,
    recipient_email: recipientEmail,
    subject: resolvedSubject,
    generation_result: generationResult,
    thread: {
      id: thread.id,
      mailbox_id: thread.mailbox_id || null,
      mailbox_address: thread.mailbox_address || null,
    },
    reply_headers: {
      in_reply_to: inReplyTo,
      references,
    },
    context_summary: {
      notes_count: notes.length,
      thread_messages_count: messages.length,
    },
  };
}
