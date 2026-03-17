/**
 * Notes-Driven Email Draft Service
 *
 * Generates AI email drafts using notes attached to CRM records as
 * structured drafting context by:
 * 1. Loading specified note(s) by ID (or the most recent notes for an entity)
 * 2. Using note title + content as the primary drafting context
 * 3. Loading related CRM entity data and communications
 * 4. Merging everything into a rich prompt for the AI engine
 * 5. Routing through the CARE playbook for approval/delivery
 */

import { getSupabaseClient } from '../lib/supabase-db.js';
import {
  buildServiceError,
  cleanString,
  normalizeEmailEntityType,
  loadRelatedEntityContext,
  loadRecentCommunications,
  formatContextBlock,
  createAiEmailDraftNotification,
} from './aiEmailDraftingSupport.js';

function buildNotesContextPrompt(notes) {
  if (!notes || notes.length === 0) return '';

  const lines = notes.map((note) => {
    const title = cleanString(note.title) || 'Untitled';
    const content = cleanString(note.content) || '';
    return `- ${title}: ${content}`;
  });

  return `Drafting notes:\n${lines.join('\n')}`;
}

export async function generateNotesDrivenEmailDraft(
  {
    tenantId,
    noteIds,
    entityType,
    entityId,
    prompt,
    subject,
    conversationId,
    requireApproval = true,
    user,
  },
  { supabase = getSupabaseClient(), executeSendEmailAction } = {},
) {
  const normalizedEntityType = normalizeEmailEntityType(entityType);
  if (!normalizedEntityType || !entityId) {
    throw buildServiceError(
      400,
      'notes_email_invalid_context',
      'Notes-driven email drafting requires a supported entity context',
    );
  }

  // 1. Load notes — either specified by ID or the most recent for this entity
  let notes = [];
  const hasNoteIds = Array.isArray(noteIds) && noteIds.length > 0;

  if (hasNoteIds) {
    const { data, error } = await supabase
      .from('note')
      .select('id, title, content, created_at')
      .eq('tenant_id', tenantId)
      .in('id', noteIds);

    if (error) {
      throw buildServiceError(500, 'notes_email_notes_lookup_failed', error.message);
    }
    notes = data || [];

    if (notes.length === 0) {
      throw buildServiceError(
        404,
        'notes_email_notes_not_found',
        'None of the specified notes were found',
      );
    }
  } else {
    // Fallback: load recent notes for the entity
    const { data, error } = await supabase
      .from('note')
      .select('id, title, content, created_at')
      .eq('tenant_id', tenantId)
      .eq('related_type', normalizedEntityType)
      .eq('related_id', entityId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      throw buildServiceError(500, 'notes_email_notes_lookup_failed', error.message);
    }
    notes = data || [];

    if (notes.length === 0) {
      throw buildServiceError(
        404,
        'notes_email_no_notes',
        'No notes found for this entity to use as drafting context',
      );
    }
  }

  // 2. Load CRM context in parallel
  const contextRecord = {
    tenant_id: tenantId,
    related_to: normalizedEntityType,
    related_id: entityId,
    related_email: null,
  };

  const [{ recipientEmail, entity }, communications] = await Promise.all([
    loadRelatedEntityContext(supabase, contextRecord),
    loadRecentCommunications(supabase, tenantId, contextRecord),
  ]);

  if (!recipientEmail) {
    throw buildServiceError(
      400,
      'notes_email_missing_recipient',
      'Unable to resolve recipient email for this record',
    );
  }

  // 3. Build merged prompt with notes context + CRM context
  const notesContext = buildNotesContextPrompt(notes);
  const crmContext = formatContextBlock(contextRecord, entity, notes, communications);
  const userPrompt =
    cleanString(prompt) || 'Draft a professional email using the attached notes as context.';

  const promptParts = [userPrompt];
  if (notesContext) promptParts.push(notesContext);
  if (crmContext) promptParts.push(crmContext);
  const mergedPrompt = promptParts.join('\n\n');

  const requestedAt = new Date().toISOString();
  const resolvedSubject =
    cleanString(subject) ||
    (notes.length === 1 ? cleanString(notes[0].title) : null) ||
    `Follow up from ${user?.first_name || 'AiSHA'}`;

  const sourceRecord = {
    id: entityId,
    type: 'notes_ai_email',
    related_to: normalizedEntityType,
    related_id: entityId,
  };

  // 4. Generate via CARE playbook (lazy-load to avoid Redis queue init in tests)
  if (!executeSendEmailAction) {
    const { executeCareSendEmailAction } = await import('../lib/care/carePlaybookExecutor.js');
    executeSendEmailAction = executeCareSendEmailAction;
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
      source: 'notes_ai_email',
      activity_metadata: {
        notes_ai_email: {
          note_ids: notes.map((n) => n.id),
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

  // 5. Create notification
  await createAiEmailDraftNotification(supabase, {
    tenantId,
    source: 'notes_ai_email',
    sourceRecord,
    generationResult,
    recipientEmail,
    userEmail: user?.email,
  });

  const responseMessage =
    generationResult.status === 'pending_approval'
      ? `I drafted an email using ${notes.length} note(s) for ${recipientEmail} and sent it for approval.`
      : `I drafted an email using ${notes.length} note(s) for ${recipientEmail} and queued it for delivery.`;

  return {
    response: responseMessage,
    recipient_email: recipientEmail,
    subject: resolvedSubject,
    notes_used: notes.map((n) => ({ id: n.id, title: n.title })),
    generation_result: generationResult,
    context_summary: {
      notes_count: notes.length,
      communications_count: communications.length,
    },
  };
}
