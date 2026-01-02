/**
 * AI Settings API Routes
 * 
 * Provides endpoints to manage AI configuration settings.
 * Superadmin only - these are global system settings.
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { clearAiSettingsCache } from '../lib/aiSettingsLoader.js';

const router = express.Router();

/**
 * GET /api/ai-settings
 * List all AI settings, optionally filtered by agent_role
 */
router.get('/', async (req, res) => {
  try {
    const { agent_role } = req.query;
    const supa = getSupabaseClient();
    
    let query = supa
      .from('ai_settings')
      .select('*')
      .is('tenant_id', null) // Only global settings for now
      .order('category')
      .order('setting_key');
    
    if (agent_role) {
      query = query.eq('agent_role', agent_role);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[ai-settings] List error:', error);
      return res.status(500).json({ error: error.message });
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
      agent_roles: [...new Set((data || []).map(s => s.agent_role))],
    });
  } catch (err) {
    console.error('[ai-settings] List error:', err);
    res.status(500).json({ error: err.message });
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
 * Update a single setting
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({ error: 'value is required' });
    }
    
    const supa = getSupabaseClient();
    
    // Get existing setting to preserve metadata
    const { data: existing, error: fetchError } = await supa
      .from('ai_settings')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    // Validate value against min/max if present
    const meta = existing.setting_value || {};
    if (meta.type === 'number') {
      const numVal = Number(value);
      if (isNaN(numVal)) {
        return res.status(400).json({ error: 'Value must be a number' });
      }
      if (meta.min !== undefined && numVal < meta.min) {
        return res.status(400).json({ error: `Value must be >= ${meta.min}` });
      }
      if (meta.max !== undefined && numVal > meta.max) {
        return res.status(400).json({ error: `Value must be <= ${meta.max}` });
      }
    }
    
    // Update the value while preserving other metadata
    const newSettingValue = {
      ...meta,
      value: meta.type === 'boolean' ? Boolean(value) : meta.type === 'number' ? Number(value) : value,
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
      console.error('[ai-settings] Update error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    // Clear cache so new value takes effect immediately
    clearAiSettingsCache();
    
    res.json({
      success: true,
      data,
      message: `Updated ${existing.display_name || existing.setting_key}`,
    });
  } catch (err) {
    console.error('[ai-settings] Update error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ai-settings/reset
 * Reset all settings to defaults (re-run seed)
 */
router.post('/reset', async (req, res) => {
  try {
    const { agent_role } = req.body;
    const supa = getSupabaseClient();
    
    // Delete current settings
    let deleteQuery = supa
      .from('ai_settings')
      .delete()
      .is('tenant_id', null); // Only global settings
    
    if (agent_role) {
      deleteQuery = deleteQuery.eq('agent_role', agent_role);
    }
    
    const { error: deleteError } = await deleteQuery;
    
    if (deleteError) {
      console.error('[ai-settings] Reset delete error:', deleteError);
      return res.status(500).json({ error: deleteError.message });
    }
    
    // Re-seed by running the migration INSERT
    // For now, just clear cache and let next load re-populate from defaults
    clearAiSettingsCache();
    
    res.json({
      success: true,
      message: 'Settings reset. Please run migration 106_ai_settings.sql to re-seed defaults.',
    });
  } catch (err) {
    console.error('[ai-settings] Reset error:', err);
    res.status(500).json({ error: err.message });
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
