/**
 * AI Settings API Routes
 *
 * Provides endpoints to manage AI configuration settings.
 * Superadmin only - settings are always tenant-scoped.
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { clearAiSettingsCache } from '../lib/aiSettingsLoader.js';
import logger from '../lib/logger.js';

const router = express.Router();

/**
 * Default seed settings for bootstrapping a new tenant.
 * These are the same defaults from migration 106_ai_settings.sql.
 */
const DEFAULT_SETTINGS = {
  aisha: [
    // Context Management
    {
      category: 'context',
      setting_key: 'max_messages',
      setting_value: { value: 8, min: 2, max: 20, type: 'number' },
      display_name: 'Max Messages per Request',
      description:
        'Limits conversation history sent to AI. Lower values save tokens but reduce context. Recommended: 6-10.',
    },
    {
      category: 'context',
      setting_key: 'max_chars_per_message',
      setting_value: { value: 1500, min: 500, max: 5000, type: 'number' },
      display_name: 'Max Characters per Message',
      description:
        'Truncates long messages to reduce token usage. Very long messages get cut off at this limit.',
    },
    // Tool Execution
    {
      category: 'tools',
      setting_key: 'max_iterations',
      setting_value: { value: 3, min: 1, max: 10, type: 'number' },
      display_name: 'Max Tool Iterations',
      description:
        'How many tool calls AI can chain in one request. Higher allows complex multi-step tasks but uses more tokens.',
    },
    {
      category: 'tools',
      setting_key: 'max_tools',
      setting_value: { value: 12, min: 5, max: 30, type: 'number' },
      display_name: 'Max Tools per Request',
      description:
        'Limits tool schemas sent to AI. More tools = more capabilities but higher token cost per request.',
    },
    // Memory/RAG
    {
      category: 'memory',
      setting_key: 'top_k',
      setting_value: { value: 3, min: 0, max: 10, type: 'number' },
      display_name: 'Memory Chunks to Retrieve',
      description:
        'Number of past notes/activities injected as context. Set to 0 to disable memory retrieval.',
    },
    {
      category: 'memory',
      setting_key: 'max_chunk_chars',
      setting_value: { value: 300, min: 100, max: 1000, type: 'number' },
      display_name: 'Max Chunk Size (chars)',
      description:
        'Truncates each memory chunk. Longer chunks provide more context but use more tokens.',
    },
    // Model Behavior
    {
      category: 'model',
      setting_key: 'temperature',
      setting_value: { value: 0.4, min: 0, max: 1, step: 0.1, type: 'number' },
      display_name: 'Temperature',
      description:
        'Controls randomness. 0 = very deterministic/factual, 1 = creative/varied. For CRM data, keep low (0.2-0.4).',
    },
    {
      category: 'model',
      setting_key: 'top_p',
      setting_value: { value: 1.0, min: 0.1, max: 1, step: 0.1, type: 'number' },
      display_name: 'Top P (Nucleus Sampling)',
      description:
        'Alternative to temperature. 1.0 = consider all tokens, lower = focus on most likely tokens.',
    },
    // Behavior
    {
      category: 'behavior',
      setting_key: 'intent_confidence_threshold',
      setting_value: { value: 0.7, min: 0.3, max: 1, step: 0.1, type: 'number' },
      display_name: 'Intent Confidence Threshold',
      description:
        'When to use focused tool routing vs full tool set. Higher = more conservative intent matching.',
    },
    {
      category: 'behavior',
      setting_key: 'enable_memory',
      setting_value: { value: true, type: 'boolean' },
      display_name: 'Enable Memory/RAG',
      description:
        'When enabled, AI retrieves relevant past notes and activities as context for responses.',
    },
    {
      category: 'behavior',
      setting_key: 'enable_follow_up_suggestions',
      setting_value: { value: true, type: 'boolean' },
      display_name: 'Enable Follow-up Suggestions',
      description: 'When enabled, AI provides 2-4 suggested follow-up actions after each response.',
    },
  ],
  developer: [
    {
      category: 'model',
      setting_key: 'temperature',
      setting_value: { value: 0.2, min: 0, max: 1, step: 0.1, type: 'number' },
      display_name: 'Temperature',
      description: 'Developer AI uses lower temperature for more precise, deterministic responses.',
    },
    {
      category: 'tools',
      setting_key: 'max_iterations',
      setting_value: { value: 5, min: 1, max: 15, type: 'number' },
      display_name: 'Max Tool Iterations',
      description: 'Developer AI may need more iterations for complex debugging tasks.',
    },
    {
      category: 'behavior',
      setting_key: 'require_approval_for_destructive',
      setting_value: { value: true, type: 'boolean' },
      display_name: 'Require Approval for Destructive Ops',
      description:
        'When enabled, destructive operations (delete, drop) require explicit user confirmation.',
    },
  ],
};

/**
 * Bootstrap settings for a tenant + agent_role if none exist.
 * Copies the defaults into the ai_settings table scoped to this tenant.
 */
async function bootstrapTenantSettings(tenantId, agentRole) {
  const supa = getSupabaseClient();
  const defaults = DEFAULT_SETTINGS[agentRole];
  if (!defaults || defaults.length === 0) return;

  const rows = defaults.map((s) => ({
    tenant_id: tenantId,
    agent_role: agentRole,
    ...s,
  }));

  const { error } = await supa
    .from('ai_settings')
    .upsert(rows, { onConflict: 'tenant_id,agent_role,setting_key', ignoreDuplicates: true });

  if (error) {
    logger.warn(
      `[ai-settings] Bootstrap for tenant ${tenantId}/${agentRole} failed:`,
      error.message,
    );
  } else {
    logger.info(
      `[ai-settings] Bootstrapped ${rows.length} default settings for tenant ${tenantId}/${agentRole}`,
    );
  }
}

/**
 * GET /api/ai-settings
 * List all AI settings for the current tenant, optionally filtered by agent_role
 */
router.get('/', async (req, res) => {
  try {
    const { agent_role } = req.query;
    const tenantId = req.tenant?.id;

    if (!tenantId) {
      return res
        .status(400)
        .json({ success: false, error: 'tenant_id is required — select a tenant first' });
    }

    const supa = getSupabaseClient();

    let query = supa
      .from('ai_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('category')
      .order('setting_key');

    if (agent_role) {
      query = query.eq('agent_role', agent_role);
    }

    let { data, error } = await query;

    if (error) {
      logger.error('[ai-settings] List error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // If no settings exist for this tenant + role, bootstrap from defaults
    if ((!data || data.length === 0) && agent_role) {
      logger.info(
        `[ai-settings] No settings for tenant ${tenantId}/${agent_role} — bootstrapping defaults`,
      );
      await bootstrapTenantSettings(tenantId, agent_role);

      // Re-fetch after bootstrap
      const retry = await supa
        .from('ai_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('agent_role', agent_role)
        .order('category')
        .order('setting_key');

      data = retry.data || [];
      if (retry.error) {
        logger.error('[ai-settings] Re-fetch after bootstrap error:', retry.error);
      }
    } else if ((!data || data.length === 0) && !agent_role) {
      // Bootstrap both roles
      await bootstrapTenantSettings(tenantId, 'aisha');
      await bootstrapTenantSettings(tenantId, 'developer');

      const retry = await supa
        .from('ai_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('category')
        .order('setting_key');

      data = retry.data || [];
    }

    // Group by category for easier UI rendering
    const grouped = {};
    for (const setting of data || []) {
      const cat = setting.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(setting);
    }

    res.json({
      success: true,
      data: data || [],
      grouped,
      agent_roles: [...new Set((data || []).map((s) => s.agent_role))],
    });
  } catch (err) {
    logger.error('[ai-settings] List error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/ai-settings/categories
 * Get available categories and their display info
 */
router.get('/categories', async (_req, res) => {
  res.json({
    success: true,
    categories: {
      context: {
        name: 'Context Management',
        description: 'Controls how much conversation history and context is sent to the AI',
        icon: 'MessageSquare',
      },
      tools: {
        name: 'Tool Execution',
        description: 'Limits on tool calls and iterations per request',
        icon: 'Wrench',
      },
      memory: {
        name: 'Memory / RAG',
        description: 'Settings for retrieving past notes and activities as context',
        icon: 'Brain',
      },
      model: {
        name: 'Model Behavior',
        description: 'LLM parameters like temperature and sampling',
        icon: 'Cpu',
      },
      behavior: {
        name: 'AI Behavior',
        description: 'General behavior settings and feature toggles',
        icon: 'Settings',
      },
    },
  });
});

/**
 * PUT /api/ai-settings/:id
 * Update a single setting (must belong to current tenant)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { value } = req.body;
    const tenantId = req.tenant?.id;

    if (value === undefined) {
      return res.status(400).json({ success: false, error: 'value is required' });
    }

    if (!tenantId) {
      return res
        .status(400)
        .json({ success: false, error: 'tenant_id is required — select a tenant first' });
    }

    const supa = getSupabaseClient();

    // Get existing setting — must belong to this tenant
    const { data: existing, error: fetchError } = await supa
      .from('ai_settings')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, error: 'Setting not found for this tenant' });
    }

    // Validate value against min/max if present
    const meta = existing.setting_value || {};
    if (meta.type === 'number') {
      const numVal = Number(value);
      if (isNaN(numVal)) {
        return res.status(400).json({ success: false, error: 'Value must be a number' });
      }
      if (meta.min !== undefined && numVal < meta.min) {
        return res.status(400).json({ success: false, error: `Value must be >= ${meta.min}` });
      }
      if (meta.max !== undefined && numVal > meta.max) {
        return res.status(400).json({ success: false, error: `Value must be <= ${meta.max}` });
      }
    }

    // Update the value while preserving other metadata
    const newSettingValue = {
      ...meta,
      value:
        meta.type === 'boolean' ? Boolean(value) : meta.type === 'number' ? Number(value) : value,
    };

    const { data, error } = await supa
      .from('ai_settings')
      .update({
        setting_value: newSettingValue,
        updated_at: new Date().toISOString(),
        updated_by: req.user?.id || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('[ai-settings] Update error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Clear cache for this tenant so new value takes effect immediately
    clearAiSettingsCache(tenantId);

    res.json({
      success: true,
      data,
      message: `Updated ${existing.display_name || existing.setting_key}`,
    });
  } catch (err) {
    logger.error('[ai-settings] Update error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ai-settings/reset
 * Reset all settings to defaults for the current tenant
 */
router.post('/reset', async (req, res) => {
  try {
    const { agent_role } = req.body;
    const tenantId = req.tenant?.id;

    if (!tenantId) {
      return res
        .status(400)
        .json({ success: false, error: 'tenant_id is required — select a tenant first' });
    }

    const supa = getSupabaseClient();

    // Delete current tenant settings
    let deleteQuery = supa.from('ai_settings').delete().eq('tenant_id', tenantId);

    if (agent_role) {
      deleteQuery = deleteQuery.eq('agent_role', agent_role);
    }

    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      logger.error('[ai-settings] Reset delete error:', deleteError);
      return res.status(500).json({ success: false, error: deleteError.message });
    }

    // Re-seed defaults for this tenant
    if (agent_role) {
      await bootstrapTenantSettings(tenantId, agent_role);
    } else {
      await bootstrapTenantSettings(tenantId, 'aisha');
      await bootstrapTenantSettings(tenantId, 'developer');
    }

    clearAiSettingsCache(tenantId);

    res.json({
      success: true,
      message: `Settings reset to defaults for tenant ${tenantId}`,
    });
  } catch (err) {
    logger.error('[ai-settings] Reset error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ai-settings/clear-cache
 * Clear the settings cache
 */
router.post('/clear-cache', async (_req, res) => {
  clearAiSettingsCache();
  res.json({ success: true, message: 'AI settings cache cleared' });
});

export default router;
