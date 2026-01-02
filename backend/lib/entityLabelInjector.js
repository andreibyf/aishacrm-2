/**
 * Entity Label Injector for AI Context
 * Dynamically injects custom entity labels into AI system prompts
 * so the AI can recognize renamed entities (e.g., "Clients" instead of "Accounts")
 */

import { CORE_TOOLS } from './aiBudgetConfig.js';

// Default entity labels
const DEFAULT_LABELS = {
  leads: { plural: 'Leads', singular: 'Lead' },
  contacts: { plural: 'Contacts', singular: 'Contact' },
  accounts: { plural: 'Accounts', singular: 'Account' },
  opportunities: { plural: 'Opportunities', singular: 'Opportunity' },
  activities: { plural: 'Activities', singular: 'Activity' },
  bizdev_sources: { plural: 'BizDev Sources', singular: 'BizDev Source' },
};

// UUID format regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve tenant identifier to UUID.
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} tenantIdOrSlug - UUID or text slug
 * @returns {Promise<string|null>} UUID or null if not found
 */
async function resolveTenantUUID(pool, tenantIdOrSlug) {
  if (!tenantIdOrSlug) return null;
  
  // If already a UUID, return as-is
  if (UUID_REGEX.test(tenantIdOrSlug)) {
    return tenantIdOrSlug;
  }
  
  // Otherwise, look up by text slug
  try {
    const result = await pool.query(
      'SELECT id FROM tenant WHERE tenant_id = $1 LIMIT 1',
      [tenantIdOrSlug]
    );
    return result.rows[0]?.id || null;
  } catch (err) {
    console.error('[entityLabelInjector] Error resolving tenant slug:', err.message);
    return null;
  }
}

/**
 * Fetch entity labels for a tenant from the database
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} tenantIdOrSlug - Tenant UUID or text slug
 * @returns {Promise<Object>} Entity labels merged with defaults
 */
export async function fetchEntityLabels(pool, tenantIdOrSlug) {
  if (!tenantIdOrSlug) {
    return { ...DEFAULT_LABELS };
  }

  try {
    // Resolve to UUID
    const tenantUUID = await resolveTenantUUID(pool, tenantIdOrSlug);
    
    if (!tenantUUID) {
      console.warn('[entityLabelInjector] Tenant not found, using defaults:', tenantIdOrSlug);
      return { ...DEFAULT_LABELS };
    }

    // Fetch custom labels
    const result = await pool.query(
      `SELECT entity_key, custom_label, custom_label_singular 
       FROM entity_labels 
       WHERE tenant_id = $1`,
      [tenantUUID]
    );

    // Merge with defaults
    const labels = { ...DEFAULT_LABELS };
    for (const row of result.rows) {
      if (labels[row.entity_key]) {
        labels[row.entity_key] = {
          plural: row.custom_label || labels[row.entity_key].plural,
          singular: row.custom_label_singular || labels[row.entity_key].singular,
        };
      }
    }

    return labels;
  } catch (err) {
    console.error('[entityLabelInjector] Error fetching entity labels:', err.message);
    return { ...DEFAULT_LABELS };
  }
}

/**
 * Generate a system prompt section explaining custom entity terminology
 * @param {Object} labels - Entity labels object from fetchEntityLabels()
 * @returns {string} System prompt section to inject
 */
export function generateEntityLabelPrompt(labels) {
  const customizations = [];
  
  for (const [entityKey, label] of Object.entries(labels)) {
    const defaultLabel = DEFAULT_LABELS[entityKey];
    
    // Check if customized
    if (label.plural !== defaultLabel?.plural || label.singular !== defaultLabel?.singular) {
      const canonicalSingular = defaultLabel.singular;
      const canonicalPlural = defaultLabel.plural;
      
      customizations.push({
        entityKey,
        canonicalSingular,
        canonicalPlural,
        customSingular: label.singular,
        customPlural: label.plural,
      });
    }
  }

  if (customizations.length === 0) {
    return ''; // No customizations, return empty string
  }

  // Build prompt section
  let prompt = '\n\n**CUSTOM ENTITY TERMINOLOGY (CRITICAL):**\n';
  prompt += 'This tenant has customized their CRM terminology. When the user mentions these terms, map them to the correct entity type:\n\n';
  
  for (const custom of customizations) {
    prompt += `- "${custom.customPlural}" / "${custom.customSingular}" → ${custom.canonicalPlural} (${custom.entityKey})\n`;
    prompt += `  Tools: Use ${custom.entityKey}-related tools (e.g., list_${custom.entityKey}, create_${custom.entityKey.slice(0, -1)})\n`;
  }

  prompt += '\n**Example Mapping:**\n';
  for (const custom of customizations) {
    prompt += `- User says: "Show me all ${custom.customPlural.toLowerCase()}" → Call: list_${custom.entityKey}\n`;
    prompt += `- User says: "Create a new ${custom.customSingular.toLowerCase()}" → Call: create_${custom.entityKey.slice(0, -1)}\n`;
  }

  prompt += '\n**IMPORTANT:** Always use the canonical tool names (list_accounts, create_lead, etc.) even when the user uses custom terminology.\n';

  return prompt;
}

/**
 * Replace entity names in tool descriptions with custom labels
 * @param {string} description - Original tool description
 * @param {Object} labels - Entity labels object
 * @returns {string} Updated description with custom labels
 */
export function replaceEntityLabelsInDescription(description, labels) {
  let updated = description;
  
  // Replace plural forms (more specific first to avoid conflicts)
  for (const [entityKey, label] of Object.entries(labels)) {
    const defaultLabel = DEFAULT_LABELS[entityKey];
    if (!defaultLabel) continue;
    
    // Replace plural (case-insensitive)
    const pluralRegex = new RegExp(`\\b${defaultLabel.plural}\\b`, 'gi');
    updated = updated.replace(pluralRegex, (match) => {
      // Preserve case
      if (match === match.toUpperCase()) return label.plural.toUpperCase();
      if (match[0] === match[0].toUpperCase()) return label.plural;
      return label.plural.toLowerCase();
    });
    
    // Replace singular (case-insensitive)
    const singularRegex = new RegExp(`\\b${defaultLabel.singular}\\b`, 'gi');
    updated = updated.replace(singularRegex, (match) => {
      // Preserve case
      if (match === match.toUpperCase()) return label.singular.toUpperCase();
      if (match[0] === match[0].toUpperCase()) return label.singular;
      return label.singular.toLowerCase();
    });
  }
  
  return updated;
}

/**
 * Generate enhanced system prompt with entity label awareness
 * @param {string} basePrompt - Original system prompt
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} tenantIdOrSlug - Tenant UUID or text slug
 * @returns {Promise<string>} Enhanced system prompt with entity label mapping
 */
export async function enhanceSystemPromptWithLabels(basePrompt, pool, tenantIdOrSlug) {
  try {
    const labels = await fetchEntityLabels(pool, tenantIdOrSlug);
    const labelPrompt = generateEntityLabelPrompt(labels);
    
    if (labelPrompt) {
      return basePrompt + labelPrompt;
    }
    
    return basePrompt;
  } catch (err) {
    console.error('[entityLabelInjector] Error enhancing system prompt:', err.message);
    return basePrompt; // Return original on error
  }
}

/**
 * Generate enhanced system prompt with FULL tenant context dictionary.
 * This is the v3.0.0 version that includes workflow definitions, status cards,
 * module visibility, and business model context in addition to entity labels.
 * 
 * Use this for new AI sessions where complete tenant context is needed.
 * 
 * @param {string} basePrompt - Original system prompt
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} tenantIdOrSlug - Tenant UUID or text slug
 * @returns {Promise<string>} Enhanced system prompt with full context dictionary
 */
export async function enhanceSystemPromptWithFullContext(basePrompt, pool, tenantIdOrSlug) {
  try {
    // Dynamically import to avoid circular dependencies
    const { buildTenantContextDictionary, generateContextDictionaryPrompt } = await import('./tenantContextDictionary.js');
    
    const dictionary = await buildTenantContextDictionary(pool, tenantIdOrSlug);
    
    if (dictionary.error) {
      console.warn('[entityLabelInjector] Failed to build context dictionary:', dictionary.error);
      // Fall back to labels-only enhancement
      return await enhanceSystemPromptWithLabels(basePrompt, pool, tenantIdOrSlug);
    }
    
    const contextPrompt = generateContextDictionaryPrompt(dictionary);
    return basePrompt + contextPrompt;
  } catch (err) {
    console.error('[entityLabelInjector] Error enhancing with full context:', err.message);
    // Fall back to labels-only enhancement
    return await enhanceSystemPromptWithLabels(basePrompt, pool, tenantIdOrSlug);
  }
}

/**
 * Update tool schemas with custom entity labels in descriptions
 * @param {Array} toolSchemas - Array of OpenAI tool schemas
 * @param {Object} labels - Entity labels object
 * @returns {Array} Updated tool schemas
 */
export function updateToolSchemasWithLabels(toolSchemas, labels) {
  return toolSchemas.map(schema => {
    const updated = { ...schema };
    
    if (updated.function?.description) {
      updated.function.description = replaceEntityLabelsInDescription(
        updated.function.description,
        labels
      );
    }
    
    // Also update parameter descriptions if present
    if (updated.function?.parameters?.properties) {
      const props = { ...updated.function.parameters.properties };
      for (const [key, value] of Object.entries(props)) {
        if (value.description) {
          props[key] = {
            ...value,
            description: replaceEntityLabelsInDescription(value.description, labels),
          };
        }
      }
      updated.function.parameters.properties = props;
    }
    
    return updated;
  });
}

/**
 * Check if a user message indicates a need for full CRM context
 * (asking about CRM workflow, how statuses work, entity relationships, etc.)
 * @param {string} message - User's message
 * @returns {boolean} True if full context is needed
 */
export function needsFullContextForQuery(message) {
  if (!message) return false;
  
  // Patterns indicating user wants to understand CRM structure/workflow
  const fullContextPatterns = [
    /how does (?:the )?(crm|system|workflow|pipeline|sales|lead)/i,
    /what (?:are|is) (?:the )?(?:different )?(status|statuses|stages|workflow)/i,
    /explain (?:the )?(crm|system|workflow|pipeline|funnel)/i,
    /walk me through/i,
    /what can (?:you|i|we) do/i,
    /help me (?:understand|learn|get started)/i,
    /how (?:do i|should i) (?:use|work with)/i,
    /what (?:entities|modules|features) (?:are|do)/i,
    /difference between .* and .*/i,
    /when (?:do i|should i) (?:use|create|convert)/i,
  ];
  
  return fullContextPatterns.some(pattern => pattern.test(message));
}

/**
 * Check if this is the first message in a conversation
 * (no history besides the current user message)
 * @param {Array} messages - Conversation messages array
 * @returns {boolean} True if this is the first user message
 */
export function isFirstMessage(messages) {
  if (!Array.isArray(messages)) return true;
  // Filter to user messages only (exclude system prompt)
  const userMessages = messages.filter(m => m.role === 'user');
  return userMessages.length <= 1;
}

/**
 * Check if full context should be forced via environment variable
 * @returns {boolean} True if AI_FORCE_FULL_CONTEXT is enabled
 */
export function shouldForceFullContext() {
  return process.env.AI_FORCE_FULL_CONTEXT === 'true' || process.env.AI_FORCE_FULL_CONTEXT === '1';
}

/**
 * Truncate a prompt to a maximum token count (rough estimate: 1 token ≈ 4 chars)
 * @param {string} prompt - The prompt to truncate
 * @param {number} maxTokens - Maximum tokens (default 1200)
 * @returns {string} Truncated prompt
 */
export function truncatePromptToTokenLimit(prompt, maxTokens = 1200) {
  const approxCharsPerToken = 4;
  const maxChars = maxTokens * approxCharsPerToken;
  
  if (prompt.length <= maxChars) return prompt;
  
  // Truncate and add ellipsis marker
  return prompt.substring(0, maxChars - 50) + '\n\n[...context truncated for token efficiency...]';
}

/**
 * Generate CONDENSED system prompt enhancement (default for follow-up messages)
 * Only includes essential terminology mappings, no verbose workflow explanations.
 * Target: ~400 tokens max.
 * 
 * @param {string} basePrompt - Original system prompt
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} tenantIdOrSlug - Tenant UUID or text slug
 * @returns {Promise<string>} Enhanced system prompt with minimal context
 */
export async function enhanceSystemPromptCondensed(basePrompt, pool, tenantIdOrSlug) {
  try {
    // Dynamically import to avoid circular dependencies
    const { buildTenantContextDictionary } = await import('./tenantContextDictionary.js');
    
    const dictionary = await buildTenantContextDictionary(pool, tenantIdOrSlug);
    
    if (dictionary.error) {
      // Fall back to labels-only enhancement
      return await enhanceSystemPromptWithLabels(basePrompt, pool, tenantIdOrSlug);
    }
    
    // Generate condensed context (only essential info)
    let condensedContext = '\n\n**TENANT CONTEXT:**\n';
    condensedContext += `Tenant: ${dictionary.tenant.name} | Model: ${dictionary.tenant.businessModel}\n`;
    
    // Only include custom terminology if any exists
    if (dictionary.terminology.customizationCount > 0) {
      condensedContext += '\n**CUSTOM TERMS:**\n';
      for (const [entityKey, labels] of Object.entries(dictionary.terminology.entities)) {
        if (labels.isCustomized) {
          condensedContext += `- "${labels.plural}" → ${entityKey}\n`;
        }
      }
    }
    
    // Compact status reference (only key entities)
    const keyEntities = ['leads', 'opportunities', 'accounts'];
    condensedContext += '\n**KEY STATUSES:**\n';
    for (const entity of keyEntities) {
      const statuses = dictionary.statusCards.entities[entity];
      if (statuses) {
        const statusList = Array.isArray(statuses) 
          ? statuses.map(s => typeof s === 'string' ? s : s.id || s.label).slice(0, 5).join(', ')
          : String(statuses);
        condensedContext += `- ${entity}: ${statusList}\n`;
      }
    }
    
    return truncatePromptToTokenLimit(basePrompt + condensedContext, 1200);
  } catch (err) {
    console.error('[entityLabelInjector] Error enhancing with condensed context:', err.message);
    return basePrompt;
  }
}

/**
 * Determine which system prompt enhancement to use based on context
 * @param {string} basePrompt - Original system prompt
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} tenantIdOrSlug - Tenant UUID or text slug
 * @param {Object} options - Context options
 * @param {Array} options.messages - Conversation messages
 * @param {string} options.userMessage - Current user message
 * @returns {Promise<string>} Appropriately enhanced system prompt
 */
export async function enhanceSystemPromptSmart(basePrompt, pool, tenantIdOrSlug, options = {}) {
  const { messages = [], userMessage = '' } = options;
  
  // Use FULL context for:
  // 1. First message in conversation
  // 2. User asking about CRM workflow/structure
  // 3. AI_FORCE_FULL_CONTEXT env flag
  const useFullContext = 
    shouldForceFullContext() ||
    isFirstMessage(messages) ||
    needsFullContextForQuery(userMessage);
  
  if (useFullContext) {
    console.log('[SystemPrompt] Using FULL context (first msg, CRM question, or forced)');
    const fullPrompt = await enhanceSystemPromptWithFullContext(basePrompt, pool, tenantIdOrSlug);
    // Still apply token cap to full context
    return truncatePromptToTokenLimit(fullPrompt, 1500); // Slightly higher cap for full context
  }
  
  console.log('[SystemPrompt] Using CONDENSED context (follow-up message)');
  return await enhanceSystemPromptCondensed(basePrompt, pool, tenantIdOrSlug);
}

/**
 * Tool cap configuration
 * Only applied when intent is detected - prevents over-capping general queries
 * NOTE: CORE_TOOLS imported from aiBudgetConfig.js for consistency
 */
const TOOL_CAP_MIN = 3;
const TOOL_CAP_MAX = 20; // Raised from 12 to allow more tools when intent is unclear
const TOOL_CAP_DEFAULT = 12;

/**
 * Apply hard cap to focused tools, preserving core tools
 * IMPORTANT: Only applies cap when intent is detected. 
 * When intent is 'none' or null, tools are NOT capped to avoid breaking general queries.
 * 
 * @param {Array} focusedTools - Array of tool schemas
 * @param {Object} options - Options
 * @param {number} options.maxTools - Maximum tools to return (default 12)
 * @param {Array} options.preserveTools - Tool names to always include (default: CORE_TOOLS)
 * @param {string} options.intent - Classified intent for logging. If 'none' or null, cap is NOT applied.
 * @param {string} options.forcedTool - Tool that MUST be included (from tool_choice forcing)
 * @returns {Array} Capped tool schemas (or original if no intent)
 */
export function applyToolHardCap(focusedTools, options = {}) {
  const { 
    maxTools = TOOL_CAP_DEFAULT, 
    preserveTools = CORE_TOOLS,
    intent = null,
    forcedTool = null
  } = options;
  
  // CRITICAL: Only apply cap when intent is detected
  // If no intent, user query is ambiguous - provide all tools for best results
  if (!intent || intent === 'none' || intent === 'NONE') {
    console.log('[ToolCap] Skipping cap (no intent detected) - providing all', focusedTools.length, 'tools');
    return focusedTools;
  }
  
  // Build list of tools that MUST be preserved
  const mustPreserve = new Set(preserveTools);
  if (forcedTool) {
    mustPreserve.add(forcedTool);
  }
  
  // Clamp maxTools within allowed range
  const effectiveMax = Math.max(TOOL_CAP_MIN, Math.min(TOOL_CAP_MAX, maxTools));
  
  if (!Array.isArray(focusedTools) || focusedTools.length <= effectiveMax) {
    return focusedTools; // Already within cap
  }
  
  // Separate must-preserve tools from others
  const mustKeepTools = focusedTools.filter(t => 
    mustPreserve.has(t.function?.name)
  );
  const otherTools = focusedTools.filter(t => 
    !mustPreserve.has(t.function?.name)
  );
  
  // Calculate how many non-preserved tools we can include
  const slotsForOthers = effectiveMax - mustKeepTools.length;
  
  if (slotsForOthers <= 0) {
    // Only room for must-keep tools
    console.log('[ToolCap] Hard cap applied: only must-keep tools fit', {
      original: focusedTools.length,
      capped: mustKeepTools.length,
      maxTools: effectiveMax,
      kept: mustKeepTools.map(t => t.function?.name),
      intent
    });
    return mustKeepTools;
  }
  
  // Take top N other tools (they're already ordered by relevance from getRelevantToolsForIntent)
  const selectedOthers = otherTools.slice(0, slotsForOthers);
  const cappedTools = [...mustKeepTools, ...selectedOthers];
  
  console.log('[ToolCap] Hard cap applied:', {
    original: focusedTools.length,
    capped: cappedTools.length,
    maxTools: effectiveMax,
    mustKeep: mustKeepTools.map(t => t.function?.name),
    intent
  });
  
  return cappedTools;
}

/**
 * Estimate token count for tool schemas
 * Rough estimate: 1 token ≈ 4 chars in JSON
 * @param {Array} tools - Tool schemas
 * @returns {number} Estimated token count
 */
export function estimateToolTokens(tools) {
  if (!Array.isArray(tools)) return 0;
  const jsonStr = JSON.stringify(tools);
  return Math.ceil(jsonStr.length / 4);
}
