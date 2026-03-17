/**
 * Template-Driven Email Draft Service
 *
 * Generates AI email drafts from reusable templates by:
 * 1. Loading the template + substituting {{variables}} with user inputs + CRM context
 * 2. Loading live CRM entity data, notes, and communications
 * 3. Merging everything into a rich prompt for the AI engine
 * 4. Routing through the CARE playbook for approval/delivery
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
import logger from '../lib/logger.js';

/**
 * Build variable context from CRM entity for automatic substitution.
 * These are always available without the user providing them.
 */
function buildAutoVariables(entity, entityType, user) {
  const vars = {};

  if (entity) {
    vars.first_name = entity.first_name || entity.name || '';
    vars.last_name = entity.last_name || '';
    vars.company = entity.company || entity.name || '';
    vars.email = entity.email || '';
    vars.entity_type = entityType || '';
  }

  if (user) {
    vars.sender_name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'AiSHA';
    vars.sender_email = user.email || '';
  }

  return vars;
}

/**
 * Substitute {{variable}} placeholders in a string.
 * Uses merged context: user-provided values override auto-resolved CRM values.
 */
function substituteVariables(text, variables) {
  if (!text || typeof text !== 'string') return text;

  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = variables[varName];
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
    return match; // Keep placeholder if no value
  });
}

/**
 * Validate user-provided variable values against the template's variable definitions.
 */
function validateTemplateVariables(templateVariables, providedValues) {
  const errors = [];

  for (const varDef of templateVariables || []) {
    const value = providedValues?.[varDef.name];
    const isEmpty = value === undefined || value === null || value === '';

    if (varDef.required && isEmpty && !varDef.default) {
      errors.push(`Missing required variable: ${varDef.name}`);
    }
  }

  return errors;
}

/**
 * Resolve final variable values: defaults → auto (CRM) → user-provided.
 */
function resolveVariables(templateVariables, userValues, autoValues) {
  const resolved = { ...autoValues };

  // Apply defaults from template variable definitions
  for (const varDef of templateVariables || []) {
    if (varDef.default && !resolved[varDef.name]) {
      resolved[varDef.name] = varDef.default;
    }
  }

  // User-provided values override everything
  if (userValues && typeof userValues === 'object') {
    for (const [key, value] of Object.entries(userValues)) {
      if (value !== undefined && value !== null && value !== '') {
        resolved[key] = String(value);
      }
    }
  }

  return resolved;
}

export async function generateTemplateDrivenEmailDraft(
  {
    tenantId,
    templateId,
    entityType,
    entityId,
    variables: userVariables = {},
    additionalPrompt,
    requireApproval = true,
    conversationId,
    user,
  },
  { supabase = getSupabaseClient(), executeSendEmailAction } = {},
) {
  // 1. Load the template
  const { data: template, error: templateError } = await supabase
    .from('email_template')
    .select('*')
    .or(`tenant_id.eq.${tenantId},is_system.eq.true`)
    .eq('id', templateId)
    .eq('is_active', true)
    .maybeSingle();

  if (templateError) {
    throw buildServiceError(500, 'template_lookup_failed', templateError.message);
  }
  if (!template) {
    throw buildServiceError(404, 'template_not_found', 'Email template not found or inactive');
  }

  // 2. Validate entity type compatibility
  const normalizedEntityType = normalizeEmailEntityType(entityType);
  if (!normalizedEntityType || !entityId) {
    throw buildServiceError(
      400,
      'template_email_invalid_context',
      'Template email drafting requires a supported entity context',
    );
  }

  if (template.entity_types && !template.entity_types.includes(normalizedEntityType)) {
    throw buildServiceError(
      400,
      'template_entity_type_mismatch',
      `Template "${template.name}" does not support entity type "${normalizedEntityType}". Supported: ${template.entity_types.join(', ')}`,
    );
  }

  // 3. Validate user-provided variables
  const variableErrors = validateTemplateVariables(template.variables, userVariables);
  if (variableErrors.length > 0) {
    throw buildServiceError(400, 'template_variable_validation_failed', variableErrors.join('; '));
  }

  // 4. Load CRM context
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
      'template_email_missing_recipient',
      'Unable to resolve recipient email for this record',
    );
  }

  // 5. Build merged variable context and substitute
  const autoVars = buildAutoVariables(entity, normalizedEntityType, user);
  const resolvedVars = resolveVariables(template.variables, userVariables, autoVars);
  const resolvedSubject = substituteVariables(template.subject_template, resolvedVars);
  const resolvedBodyPrompt = substituteVariables(template.body_prompt, resolvedVars);

  // 6. Build full prompt with CRM context
  const promptContext = formatContextBlock(contextRecord, entity, notes, communications);
  const promptParts = [resolvedBodyPrompt];
  if (additionalPrompt) {
    promptParts.push(`Additional instructions: ${cleanString(additionalPrompt)}`);
  }
  if (promptContext) {
    promptParts.push(promptContext);
  }
  const mergedPrompt = promptParts.join('\n\n');

  // 7. Generate via CARE playbook
  const requestedAt = new Date().toISOString();
  const sourceRecord = {
    id: entityId,
    type: 'template_ai_email',
    related_to: normalizedEntityType,
    related_id: entityId,
  };

  // Lazy-load CARE executor to avoid module-level Redis queue init in tests
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
      source: 'template_ai_email',
      activity_metadata: {
        template_ai_email: {
          template_id: template.id,
          template_name: template.name,
          conversation_id: conversationId || null,
          generated_by_user_id: user?.id || null,
          variables_used: Object.keys(resolvedVars),
        },
      },
    },
    {
      status: 'completed',
      timestamp: requestedAt,
      template_id: template.id,
      conversation_id: conversationId || null,
    },
  );

  // 8. Increment usage count (fire-and-forget)
  supabase
    .rpc('increment_email_template_usage', { template_id: templateId })
    .then(() => {})
    .catch((err) => logger.warn({ err, templateId }, '[templateEmailDraft] Failed to increment usage count'));

  // 9. Create notification
  await createAiEmailDraftNotification(supabase, {
    tenantId,
    source: 'template_ai_email',
    sourceRecord,
    generationResult,
    recipientEmail,
    userEmail: user?.email,
  });

  const responseMessage =
    generationResult.status === 'pending_approval'
      ? `I drafted an email using the "${template.name}" template for ${recipientEmail} and sent it for approval.`
      : `I drafted an email using the "${template.name}" template for ${recipientEmail} and queued it for delivery.`;

  return {
    response: responseMessage,
    recipient_email: recipientEmail,
    subject: resolvedSubject,
    template: { id: template.id, name: template.name, category: template.category },
    generation_result: generationResult,
    context_summary: {
      notes_count: notes.length,
      communications_count: communications.length,
      variables_resolved: Object.keys(resolvedVars).length,
    },
  };
}
