/**
 * Tenant Context Dictionary Builder
 * 
 * Builds a comprehensive context dictionary for AI to understand tenant-specific:
 * - Entity terminology (custom labels)
 * - Status card customizations
 * - Workflow definitions (v3.0.0)
 * - Business model context (B2B/B2C/Hybrid)
 * - Module visibility settings
 * 
 * This dictionary is reviewed by AI at session start to ensure accurate understanding
 * of tenant-specific terminology and workflows.
 */

import { fetchEntityLabels } from './entityLabelInjector.js';

// v3.0.0 Workflow Definitions - static but tenant can customize terminology
const V3_WORKFLOW_DEFINITIONS = {
  bizdev_to_lead: {
    name: 'Lead Generation',
    description: 'BizDev Sources are promoted to Leads for qualification',
    stages: ['BizDev Source', 'Lead'],
    actions: ['promote'],
    notes: 'B2B sources typically have company_name; B2C sources are person-focused'
  },
  lead_to_conversion: {
    name: 'Lead Conversion',
    description: 'Qualified Leads are converted to Contact + Account + Opportunity',
    stages: ['Lead', 'Contact', 'Account', 'Opportunity'],
    actions: ['qualify', 'convert'],
    notes: 'Conversion creates linked Contact, Account, and optionally Opportunity'
  },
  opportunity_pipeline: {
    name: 'Sales Pipeline',
    description: 'Opportunities progress through sales stages to close',
    stages: ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'],
    actions: ['update_stage', 'add_activity', 'add_note'],
    notes: 'Each stage can have activities and notes attached'
  }
};

// Default status card configurations
const DEFAULT_STATUS_CARDS = {
  contacts: ['active', 'prospect', 'customer', 'inactive'],
  accounts: ['prospect', 'customer', 'partner', 'competitor', 'inactive'],
  leads: ['new', 'contacted', 'qualified', 'converted', 'rejected'],
  opportunities: ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'],
  activities: ['scheduled', 'in_progress', 'overdue', 'completed'],
  bizdev_sources: ['active', 'promoted', 'rejected', 'duplicate']
};

/**
 * Fetch tenant's business model and configuration
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<Object>} Tenant configuration
 */
async function fetchTenantConfig(pool, tenantId) {
  try {
    const result = await pool.query(
      `SELECT 
        id,
        tenant_id as slug,
        name,
        business_model,
        client_type,
        industry,
        metadata
      FROM tenant 
      WHERE id = $1`,
      [tenantId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } catch (err) {
    console.error('[TenantContextDictionary] Error fetching tenant config:', err.message);
    return null;
  }
}

/**
 * Fetch status card customizations from database (if persisted)
 * Falls back to defaults if not found
 * @param {import('pg').Pool} pool - Database pool  
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<Object>} Status card configurations
 */
async function fetchStatusCardConfig(pool, tenantId) {
  try {
    // Check if status_card_preferences table exists and has data
    const result = await pool.query(
      `SELECT entity_type, card_id, custom_label, visible
       FROM status_card_preferences
       WHERE tenant_id = $1`,
      [tenantId]
    );
    
    if (result.rows.length === 0) {
      return { source: 'defaults', cards: DEFAULT_STATUS_CARDS };
    }
    
    // Build customized structure
    const customCards = {};
    for (const row of result.rows) {
      if (!customCards[row.entity_type]) {
        customCards[row.entity_type] = [];
      }
      customCards[row.entity_type].push({
        id: row.card_id,
        label: row.custom_label,
        visible: row.visible
      });
    }
    
    return { source: 'database', cards: customCards };
  } catch (err) {
    // Table might not exist yet - that's fine, use defaults
    if (err.code === '42P01') { // undefined_table
      return { source: 'defaults', cards: DEFAULT_STATUS_CARDS };
    }
    console.error('[TenantContextDictionary] Error fetching status cards:', err.message);
    return { source: 'defaults', cards: DEFAULT_STATUS_CARDS };
  }
}

/**
 * Fetch module visibility settings
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<Object>} Module visibility map
 */
async function fetchModuleSettings(pool, tenantId) {
  try {
    const result = await pool.query(
      `SELECT module_key, enabled, display_name, sort_order
       FROM modulesettings
       WHERE tenant_id = $1
       ORDER BY sort_order`,
      [tenantId]
    );
    
    const modules = {};
    for (const row of result.rows) {
      modules[row.module_key] = {
        enabled: row.enabled,
        displayName: row.display_name,
        sortOrder: row.sort_order
      };
    }
    
    return modules;
  } catch (err) {
    console.error('[TenantContextDictionary] Error fetching module settings:', err.message);
    return {};
  }
}

/**
 * Build complete tenant context dictionary
 * This is the main export - builds everything the AI needs to know about a tenant
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} tenantIdOrSlug - Tenant UUID or slug
 * @returns {Promise<Object>} Complete context dictionary
 */
export async function buildTenantContextDictionary(pool, tenantIdOrSlug) {
  const startTime = Date.now();
  
  // Resolve tenant UUID
  let tenantId = tenantIdOrSlug;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!UUID_REGEX.test(tenantIdOrSlug)) {
    try {
      const result = await pool.query(
        'SELECT id FROM tenant WHERE tenant_id = $1 LIMIT 1',
        [tenantIdOrSlug]
      );
      tenantId = result.rows[0]?.id || null;
    } catch (err) {
      console.error('[TenantContextDictionary] Error resolving tenant:', err.message);
      tenantId = null;
    }
  }
  
  if (!tenantId) {
    return {
      error: 'Tenant not found',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime
    };
  }
  
  // Fetch all context components in parallel
  const [
    tenantConfig,
    entityLabels,
    statusCards,
    moduleSettings
  ] = await Promise.all([
    fetchTenantConfig(pool, tenantId),
    fetchEntityLabels(pool, tenantId),
    fetchStatusCardConfig(pool, tenantId),
    fetchModuleSettings(pool, tenantId)
  ]);
  
  // Build terminology mapping for AI
  const terminology = {};
  for (const [entityKey, labels] of Object.entries(entityLabels)) {
    terminology[entityKey] = {
      singular: labels.singular,
      plural: labels.plural,
      // Check if customized
      isCustomized: labels.singular !== getDefaultLabel(entityKey, 'singular') ||
                    labels.plural !== getDefaultLabel(entityKey, 'plural')
    };
  }
  
  // Build the complete dictionary
  const dictionary = {
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    
    tenant: {
      id: tenantId,
      slug: tenantConfig?.slug || null,
      name: tenantConfig?.name || 'Unknown',
      businessModel: tenantConfig?.business_model || 'Hybrid',
      clientType: tenantConfig?.client_type || 'B2B',
      industry: tenantConfig?.industry || null
    },
    
    terminology: {
      entities: terminology,
      customizationCount: Object.values(terminology).filter(t => t.isCustomized).length
    },
    
    workflows: {
      version: '3.0.0',
      definitions: V3_WORKFLOW_DEFINITIONS,
      businessModelNotes: getBusinessModelNotes(tenantConfig?.business_model)
    },
    
    statusCards: {
      source: statusCards.source,
      entities: statusCards.cards
    },
    
    modules: {
      settings: moduleSettings,
      enabledCount: Object.values(moduleSettings).filter(m => m.enabled).length
    },
    
    // AI-ready summary
    aiContextSummary: buildAIContextSummary(tenantConfig, terminology, statusCards)
  };
  
  return dictionary;
}

/**
 * Get default label for an entity
 */
function getDefaultLabel(entityKey, type) {
  const defaults = {
    leads: { plural: 'Leads', singular: 'Lead' },
    contacts: { plural: 'Contacts', singular: 'Contact' },
    accounts: { plural: 'Accounts', singular: 'Account' },
    opportunities: { plural: 'Opportunities', singular: 'Opportunity' },
    activities: { plural: 'Activities', singular: 'Activity' },
    bizdev_sources: { plural: 'BizDev Sources', singular: 'BizDev Source' },
  };
  return defaults[entityKey]?.[type] || entityKey;
}

/**
 * Get business model specific notes
 */
function getBusinessModelNotes(businessModel) {
  const notes = {
    'B2B': 'Business-to-business model. Leads typically have company information. Focus on account relationships.',
    'B2C': 'Business-to-consumer model. Leads are individual persons. Person profiles are primary.',
    'Hybrid': 'Mixed model. Lead type determined by presence of company data. Support both B2B and B2C flows.'
  };
  return notes[businessModel] || notes['Hybrid'];
}

/**
 * Build AI-ready context summary
 */
function buildAIContextSummary(tenantConfig, terminology, statusCards) {
  const customTerms = Object.entries(terminology)
    .filter(([_, t]) => t.isCustomized)
    .map(([key, t]) => `${t.plural} (${key})`);
  
  let summary = `Tenant: ${tenantConfig?.name || 'Unknown'}\n`;
  summary += `Business Model: ${tenantConfig?.business_model || 'Hybrid'}\n`;
  summary += `Workflow: v3.0.0 (BizDev Source → Lead → Contact + Account + Opportunity)\n`;
  
  if (customTerms.length > 0) {
    summary += `\nCUSTOM TERMINOLOGY: This tenant uses custom names:\n`;
    summary += customTerms.map(t => `  - ${t}`).join('\n');
    summary += `\n\nAlways map user terms to canonical entity types when using tools.`;
  }
  
  return summary;
}

/**
 * Generate system prompt injection for AI
 * This is what gets added to the AI system prompt at session start
 * 
 * @param {Object} dictionary - Result from buildTenantContextDictionary
 * @returns {string} System prompt section to inject
 */
export function generateContextDictionaryPrompt(dictionary) {
  if (dictionary.error) {
    return '\n\n[Context Dictionary: Unable to load tenant configuration]\n';
  }
  
  let prompt = '\n\n**═══════════ TENANT CONTEXT DICTIONARY ═══════════**\n';
  prompt += `Version: ${dictionary.version}\n`;
  prompt += `Loaded: ${dictionary.timestamp}\n\n`;
  
  // Tenant info
  prompt += `**TENANT:**\n`;
  prompt += `- Name: ${dictionary.tenant.name}\n`;
  prompt += `- Business Model: ${dictionary.tenant.businessModel}\n`;
  prompt += `- Industry: ${dictionary.tenant.industry || 'Not specified'}\n\n`;
  
  // Business model context
  prompt += `**WORKFLOW CONTEXT:**\n`;
  prompt += `${dictionary.workflows.businessModelNotes}\n\n`;
  
  // Workflow definitions
  prompt += `**v3.0.0 WORKFLOW:**\n`;
  prompt += `1. BizDev Source → (promote) → Lead\n`;
  prompt += `2. Lead → (qualify + convert) → Contact + Account + Opportunity\n`;
  prompt += `3. Opportunity → (progress stages) → Closed Won/Lost\n\n`;
  
  // Custom terminology
  if (dictionary.terminology.customizationCount > 0) {
    prompt += `**CUSTOM TERMINOLOGY (CRITICAL):**\n`;
    prompt += `This tenant has renamed entities. Map user terms correctly:\n`;
    
    for (const [entityKey, labels] of Object.entries(dictionary.terminology.entities)) {
      if (labels.isCustomized) {
        const defaultPlural = getDefaultLabel(entityKey, 'plural');
        prompt += `- "${labels.plural}" → ${defaultPlural} (use ${entityKey} tools)\n`;
      }
    }
    prompt += `\n`;
  }
  
  // Status values reference
  prompt += `**STATUS VALUES:**\n`;
  for (const [entity, statuses] of Object.entries(dictionary.statusCards.entities)) {
    const statusList = Array.isArray(statuses) 
      ? statuses.map(s => typeof s === 'string' ? s : s.label).join(', ')
      : statuses;
    prompt += `- ${entity}: ${statusList}\n`;
  }
  
  prompt += `\n**═══════════════════════════════════════════════**\n`;
  
  return prompt;
}

export { V3_WORKFLOW_DEFINITIONS, DEFAULT_STATUS_CARDS };
