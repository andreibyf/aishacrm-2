/**
 * C.A.R.E. State Store
 * 
 * Database access layer for C.A.R.E. state persistence.
 * 
 * This module provides:
 * - getCareState: Read current state
 * - upsertCareState: Insert or update state
 * - appendCareHistory: Write history record
 * 
 * Uses Supabase client for database access (matches repository pattern).
 * 
 * IMPORTANT: These are pure database helpers. They DO NOT:
 * - Check autonomy gates
 * - Execute actions
 * - Send messages
 * - Trigger workflows
 * 
 * @module careStateStore
 */

import { getSupabaseClient } from '../supabase-db.js';
import { validateEntityType } from './careStateEngine.js';

/**
 * Get current C.A.R.E. state for an entity
 * 
 * @param {Object} ctx - Context
 * @param {string} ctx.tenant_id - Tenant UUID
 * @param {string} ctx.entity_type - Entity type (lead|contact|account)
 * @param {string} ctx.entity_id - Entity UUID
 * @returns {Promise<Object|null>} Current state record or null if not found
 */
export async function getCareState(ctx) {
  if (!ctx || !ctx.tenant_id || !ctx.entity_type || !ctx.entity_id) {
    throw new Error('Invalid context: tenant_id, entity_type, and entity_id are required');
  }
  
  validateEntityType(ctx.entity_type);
  
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('customer_care_state')
    .select('*')
    .eq('tenant_id', ctx.tenant_id)
    .eq('entity_type', ctx.entity_type)
    .eq('entity_id', ctx.entity_id)
    .maybeSingle();
  
  if (error) {
    throw new Error(`Failed to get C.A.R.E. state: ${error.message}`);
  }
  
  return data;
}

/**
 * Insert or update C.A.R.E. state for an entity
 * 
 * Uses Supabase upsert with unique constraint on (tenant_id, entity_type, entity_id).
 * 
 * @param {Object} ctx - Context
 * @param {string} ctx.tenant_id - Tenant UUID
 * @param {string} ctx.entity_type - Entity type
 * @param {string} ctx.entity_id - Entity UUID
 * @param {Object} patch - Fields to insert/update
 * @param {string} [patch.care_state] - New state
 * @param {boolean} [patch.hands_off_enabled] - Autonomy flag
 * @param {string} [patch.escalation_status] - Escalation status
 * @param {Date} [patch.last_signal_at] - Last signal timestamp
 * @param {Date} [patch.updated_at] - Update timestamp
 * @returns {Promise<Object>} Updated state record
 */
export async function upsertCareState(ctx, patch) {
  if (!ctx || !ctx.tenant_id || !ctx.entity_type || !ctx.entity_id) {
    throw new Error('Invalid context: tenant_id, entity_type, and entity_id are required');
  }
  
  validateEntityType(ctx.entity_type);
  
  const supabase = getSupabaseClient();
  
  // Build upsert payload
  const payload = {
    tenant_id: ctx.tenant_id,
    entity_type: ctx.entity_type,
    entity_id: ctx.entity_id,
    ...patch,
    updated_at: patch.updated_at || new Date().toISOString()
  };
  
  // Ensure care_state is set (required field)
  if (!payload.care_state) {
    throw new Error('care_state is required for upsert');
  }
  
  const { data, error } = await supabase
    .from('customer_care_state')
    .upsert(payload, {
      onConflict: 'tenant_id,entity_type,entity_id',
      returning: 'representation'
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to upsert C.A.R.E. state: ${error.message}`);
  }
  
  return data;
}

/**
 * Append a history record to customer_care_state_history
 * 
 * Every state change, escalation, or significant event should be logged
 * to the history table for audit and explainability.
 * 
 * @param {Object} ctx - Context
 * @param {string} ctx.tenant_id - Tenant UUID
 * @param {string} ctx.entity_type - Entity type
 * @param {string} ctx.entity_id - Entity UUID
 * @param {Object} event - History event
 * @param {string|null} event.from_state - Previous state (null for initial)
 * @param {string|null} event.to_state - New state (null for non-transition events)
 * @param {string} event.event_type - Event classification
 * @param {string} event.reason - Required explanation
 * @param {Object} [event.meta] - Optional metadata
 * @param {string} [event.actor_type='system'] - Actor type
 * @param {string} [event.actor_id] - Actor ID
 * @returns {Promise<Object>} Created history record
 */
export async function appendCareHistory(ctx, event) {
  if (!ctx || !ctx.tenant_id || !ctx.entity_type || !ctx.entity_id) {
    throw new Error('Invalid context: tenant_id, entity_type, and entity_id are required');
  }
  
  validateEntityType(ctx.entity_type);
  
  // Validate required fields
  if (!event.event_type || typeof event.event_type !== 'string') {
    throw new Error('event_type is required');
  }
  
  if (!event.reason || typeof event.reason !== 'string' || event.reason.trim() === '') {
    throw new Error('Non-empty reason is required for all history events');
  }
  
  const supabase = getSupabaseClient();
  
  const payload = {
    tenant_id: ctx.tenant_id,
    entity_type: ctx.entity_type,
    entity_id: ctx.entity_id,
    from_state: event.from_state || null,
    to_state: event.to_state || null,
    event_type: event.event_type,
    reason: event.reason,
    meta: event.meta || null,
    actor_type: event.actor_type || 'system',
    actor_id: event.actor_id || null,
    created_at: new Date().toISOString()
  };
  
  const { data, error } = await supabase
    .from('customer_care_state_history')
    .insert(payload)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to append C.A.R.E. history: ${error.message}`);
  }
  
  return data;
}

/**
 * Get history records for an entity
 * 
 * Useful for debugging, auditing, and displaying timeline to users.
 * 
 * @param {Object} ctx - Context
 * @param {string} ctx.tenant_id - Tenant UUID
 * @param {string} ctx.entity_type - Entity type
 * @param {string} ctx.entity_id - Entity UUID
 * @param {Object} [options] - Query options
 * @param {number} [options.limit=50] - Max records to return
 * @param {string} [options.order='created_at.desc'] - Sort order
 * @returns {Promise<Array>} History records (newest first by default)
 */
export async function getCareHistory(ctx, options = {}) {
  if (!ctx || !ctx.tenant_id || !ctx.entity_type || !ctx.entity_id) {
    throw new Error('Invalid context: tenant_id, entity_type, and entity_id are required');
  }
  
  validateEntityType(ctx.entity_type);
  
  const supabase = getSupabaseClient();
  
  const limit = options.limit || 50;
  const order = options.order || 'created_at.desc';
  
  const { data, error } = await supabase
    .from('customer_care_state_history')
    .select('*')
    .eq('tenant_id', ctx.tenant_id)
    .eq('entity_type', ctx.entity_type)
    .eq('entity_id', ctx.entity_id)
    .order('created_at', { ascending: order === 'created_at.asc' })
    .limit(limit);
  
  if (error) {
    throw new Error(`Failed to get C.A.R.E. history: ${error.message}`);
  }
  
  return data || [];
}

export default {
  getCareState,
  upsertCareState,
  appendCareHistory,
  getCareHistory
};
