/**
 * Entity Label Injector for AI Context
 * Dynamically injects custom entity labels into AI system prompts
 * so the AI can recognize renamed entities (e.g., "Clients" instead of "Accounts")
 */

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
