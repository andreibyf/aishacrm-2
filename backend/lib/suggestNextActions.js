/**
 * SUGGEST NEXT ACTIONS MODULE
 * Analyzes entity state and provides intelligent next step recommendations
 * 
 * Integrates with:
 * - AI Memory (RAG) for similar scenario analysis
 * - Entity data (notes, activities, stage, last contact)
 * - Best practices based on lead temperature and urgency
 */

import { getSupabaseClient } from './supabase-db.js';
import { queryMemory } from './aiMemory/index.js';

/**
 * Analyze entity and suggest next actions
 * @param {Object} params - Analysis parameters
 * @param {string} params.entity_type - Entity type (lead, contact, account, opportunity)
 * @param {string} params.entity_id - Entity UUID
 * @param {string} params.tenant_id - Tenant UUID
 * @param {number} params.limit - Max suggestions (default: 3)
 * @returns {Promise<Object>} Suggested actions with reasoning
 */
export async function suggestNextActions({ entity_type, entity_id, tenant_id, limit = 3 }) {
  const supabase = getSupabaseClient();
  
  try {
    // Step 1: Fetch entity data with related records
    const entityData = await fetchEntityWithContext(supabase, entity_type, entity_id, tenant_id);
    
    if (!entityData) {
      return {
        error: 'Entity not found or access denied',
        suggestions: []
      };
    }
    
    // Step 2: Query RAG memory for similar scenarios (if enabled)
    let memorySuggestions = [];
    try {
      const memoryContext = await buildMemoryQuery(entityData);
      const memoryResults = await queryMemory({
        tenantId: tenant_id,
        query: memoryContext,
        entityType: entity_type,
        limit: 5,
        minSimilarity: 0.75
      });
      
      if (memoryResults && memoryResults.length > 0) {
        memorySuggestions = extractActionsFromMemory(memoryResults);
      }
    } catch (memErr) {
      console.warn('[Suggest Actions] RAG memory unavailable:', memErr.message);
      // Continue without memory - fallback to rule-based
    }
    
    // Step 3: Generate rule-based suggestions from entity state
    const ruleSuggestions = generateRuleBasedSuggestions(entityData, entity_type);
    
    // Step 4: Combine and prioritize suggestions
    const allSuggestions = [...memorySuggestions, ...ruleSuggestions];
    const prioritized = prioritizeSuggestions(allSuggestions, entityData);
    
    return {
      entity: {
        type: entity_type,
        id: entity_id,
        name: getEntityDisplayName(entityData, entity_type)
      },
      suggestions: prioritized.slice(0, limit),
      context: {
        stage: entityData.stage || entityData.status,
        lastContactDays: getLastContactDays(entityData),
        urgency: calculateUrgency(entityData),
        temperature: calculateTemperature(entityData)
      }
    };
  } catch (error) {
    console.error('[Suggest Actions] Error:', error);
    return {
      error: error.message,
      suggestions: []
    };
  }
}

/**
 * Fetch entity with related notes, activities, and metadata
 */
async function fetchEntityWithContext(supabase, entityType, entityId, tenantId) {
  const table = entityType === 'lead' ? 'leads' 
    : entityType === 'contact' ? 'contacts'
    : entityType === 'account' ? 'accounts'
    : entityType === 'opportunity' ? 'opportunities'
    : null;
  
  if (!table) {
    throw new Error(`Unknown entity type: ${entityType}`);
  }
  
  // Fetch main entity
  const { data: entity, error: entityErr } = await supabase
    .from(table)
    .select('*')
    .eq('id', entityId)
    .eq('tenant_id', tenantId)
    .single();
  
  if (entityErr || !entity) {
    return null;
  }
  
  // Fetch related notes (recent 5)
  const { data: notes } = await supabase
    .from('notes')
    .select('note_text, created_at')
    .eq('tenant_id', tenantId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(5);
  
  // Fetch related activities (recent 5)
  const { data: activities } = await supabase
    .from('activities')
    .select('type, subject, status, due_date')
    .eq('tenant_id', tenantId)
    .or(`lead_id.eq.${entityId},contact_id.eq.${entityId},account_id.eq.${entityId},opportunity_id.eq.${entityId}`)
    .order('created_at', { ascending: false })
    .limit(5);
  
  return {
    ...entity,
    recent_notes: notes || [],
    recent_activities: activities || []
  };
}

/**
 * Build memory query from entity context
 */
function buildMemoryQuery(entityData) {
  const parts = [];
  
  // Include status/stage
  if (entityData.status) parts.push(entityData.status);
  if (entityData.stage) parts.push(entityData.stage);
  
  // Include recent notes context
  if (entityData.recent_notes && entityData.recent_notes.length > 0) {
    const recentNote = entityData.recent_notes[0].note_text;
    parts.push(recentNote.slice(0, 200)); // First 200 chars of most recent note
  }
  
  // Add generic context
  parts.push('next steps', 'follow-up', 'action plan');
  
  return parts.join(' ');
}

/**
 * Extract actionable suggestions from memory chunks
 */
function extractActionsFromMemory(memoryResults) {
  const suggestions = [];
  
  for (const chunk of memoryResults) {
    // Look for action keywords in content
    const content = chunk.content.toLowerCase();
    
    if (content.includes('scheduled call') || content.includes('follow-up call')) {
      suggestions.push({
        action: 'Schedule follow-up call',
        reasoning: `Similar scenarios show calls were effective (similarity: ${Math.round(chunk.similarity * 100)}%)`,
        priority: 8,
        source: 'memory'
      });
    }
    
    if (content.includes('sent email') || content.includes('email follow-up')) {
      suggestions.push({
        action: 'Send follow-up email',
        reasoning: `Past similar cases used email follow-up successfully (similarity: ${Math.round(chunk.similarity * 100)}%)`,
        priority: 7,
        source: 'memory'
      });
    }
    
    if (content.includes('qualified') || content.includes('move to')) {
      suggestions.push({
        action: 'Qualify and advance stage',
        reasoning: `Memory indicates qualification was the next step (similarity: ${Math.round(chunk.similarity * 100)}%)`,
        priority: 9,
        source: 'memory'
      });
    }
  }
  
  return suggestions;
}

/**
 * Generate rule-based suggestions from entity state
 */
function generateRuleBasedSuggestions(entityData, entityType) {
  const suggestions = [];
  const lastContactDays = getLastContactDays(entityData);
  const recentNotes = entityData.recent_notes || [];
  const latestNote = recentNotes[0]?.note_text || '';
  
  // Rule 1: Awaiting callback
  if (latestNote.toLowerCase().includes('awaiting callback') || 
      latestNote.toLowerCase().includes('callback')) {
    suggestions.push({
      action: 'Follow-up call to check status',
      reasoning: 'Customer callback pending - proactive follow-up shows engagement',
      priority: 9,
      source: 'rule',
      timing: lastContactDays > 2 ? 'urgent' : 'normal'
    });
  }
  
  // Rule 2: Left message
  if (latestNote.toLowerCase().includes('left message') || 
      latestNote.toLowerCase().includes('left a message')) {
    suggestions.push({
      action: 'Send follow-up email',
      reasoning: 'Message left without response - email provides alternate contact method',
      priority: 8,
      source: 'rule',
      timing: 'normal'
    });
  }
  
  // Rule 3: Considering email
  if (latestNote.toLowerCase().includes('considering email') || 
      latestNote.toLowerCase().includes('send email')) {
    suggestions.push({
      action: 'Draft and send email',
      reasoning: 'Email follow-up was noted as next step',
      priority: 9,
      source: 'rule',
      timing: 'immediate'
    });
  }
  
  // Rule 4: No recent contact (leads/contacts only)
  if ((entityType === 'lead' || entityType === 'contact') && lastContactDays > 7) {
    suggestions.push({
      action: 'Re-engage with check-in call or email',
      reasoning: `No contact in ${lastContactDays} days - risk of going cold`,
      priority: 7,
      source: 'rule',
      timing: 'urgent'
    });
  }
  
  // Rule 5: Warm lead with no next activity
  if (entityType === 'lead' && 
      (entityData.status?.toLowerCase().includes('warm') || entityData.temperature === 'warm') &&
      (!entityData.recent_activities || entityData.recent_activities.length === 0)) {
    suggestions.push({
      action: 'Schedule discovery call',
      reasoning: 'Warm lead with no scheduled activities - capitalize on interest',
      priority: 10,
      source: 'rule',
      timing: 'urgent'
    });
  }
  
  // Rule 6: Opportunity close date approaching
  if (entityType === 'opportunity' && entityData.close_date) {
    const daysToClose = Math.ceil((new Date(entityData.close_date) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysToClose <= 7 && daysToClose > 0) {
      suggestions.push({
        action: 'Final negotiation call',
        reasoning: `Close date in ${daysToClose} days - time for final push`,
        priority: 10,
        source: 'rule',
        timing: 'urgent'
      });
    }
  }
  
  return suggestions;
}

/**
 * Prioritize and deduplicate suggestions
 */
function prioritizeSuggestions(suggestions, entityData) {
  // Deduplicate by action text (case-insensitive)
  const seen = new Map();
  const unique = [];
  
  for (const sugg of suggestions) {
    const key = sugg.action.toLowerCase();
    if (!seen.has(key) || seen.get(key).priority < sugg.priority) {
      seen.set(key, sugg);
    }
  }
  
  unique.push(...seen.values());
  
  // Sort by priority (descending)
  unique.sort((a, b) => b.priority - a.priority);
  
  return unique;
}

/**
 * Calculate days since last contact
 */
function getLastContactDays(entityData) {
  const lastContact = entityData.last_contact_date || entityData.updated_at || entityData.created_at;
  if (!lastContact) return 999;
  
  const days = Math.floor((new Date() - new Date(lastContact)) / (1000 * 60 * 60 * 24));
  return days;
}

/**
 * Calculate urgency score (0-10)
 */
function calculateUrgency(entityData) {
  let score = 5; // Base
  
  const lastContactDays = getLastContactDays(entityData);
  
  // Recent contact increases urgency
  if (lastContactDays <= 1) score += 3;
  else if (lastContactDays <= 3) score += 2;
  else if (lastContactDays > 14) score -= 2;
  
  // Warm/hot status increases urgency
  const status = (entityData.status || '').toLowerCase();
  if (status.includes('hot')) score += 2;
  else if (status.includes('warm')) score += 1;
  
  return Math.max(0, Math.min(10, score));
}

/**
 * Calculate lead temperature
 */
function calculateTemperature(entityData) {
  const status = (entityData.status || '').toLowerCase();
  if (status.includes('hot')) return 'hot';
  if (status.includes('warm')) return 'warm';
  if (status.includes('cold')) return 'cold';
  return 'unknown';
}

/**
 * Get display name for entity
 */
function getEntityDisplayName(entityData, entityType) {
  if (entityType === 'lead' || entityType === 'contact') {
    return `${entityData.first_name || ''} ${entityData.last_name || ''}`.trim();
  }
  return entityData.name || entityData.company || 'Unnamed';
}
