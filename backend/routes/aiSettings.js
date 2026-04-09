/**
 * AI Settings API Routes
 *
 * Provides endpoints to manage AI configuration settings.
 * Superadmin only - settings are always tenant-scoped.
 */

import express from 'express';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { clearAiSettingsCache } from '../lib/aiSettingsLoader.js';
import { requireSuperAdminRole } from '../middleware/validateTenant.js';
import logger from '../lib/logger.js';

// Path to docker-compose.yml
// Priority: explicit env var > mounted path inside container > repo-root for local dev
function resolveComposePath() {
  if (process.env.COMPOSE_FILE_PATH) return process.env.COMPOSE_FILE_PATH;
  const mounted = '/app/docker-compose.yml';
  try {
    readFileSync(mounted);
    return mounted;
  } catch {
    /* not mounted */
  }
  return resolve(process.cwd(), '..', 'docker-compose.yml');
}
const COMPOSE_PATH = resolveComposePath();

// Ollama env vars that live in docker-compose.yml (require container restart)
const OLLAMA_ENV_KEYS = [
  'OLLAMA_NUM_CTX',
  'OLLAMA_MAX_LOADED_MODELS',
  'OLLAMA_KEEP_ALIVE',
  'OLLAMA_NUM_PARALLEL',
];

/**
 * Read current Ollama env vars from docker-compose.yml
 */
function readOllamaEnvFromCompose() {
  try {
    const raw = readFileSync(COMPOSE_PATH, 'utf8');
    const result = {};
    for (const key of OLLAMA_ENV_KEYS) {
      const match = raw.match(new RegExp('- ' + key + '=(.+)'));
      result[key] = match ? match[1].trim() : null;
    }
    return result;
  } catch (err) {
    logger.warn('[ollama-settings] Could not read compose file:', err.message);
    return {};
  }
}

/**
 * Sanitize environment value to prevent YAML injection
 * @param {string} value - The value to sanitize
 * @returns {string} - Sanitized value safe for YAML
 */
function sanitizeEnvValue(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error('Invalid value type: must be string or number');
  }

  const strValue = String(value);

  // Reject values with newlines, carriage returns, or YAML comment characters
  if (/[\r\n#]/.test(strValue)) {
    throw new Error('Invalid characters in value (newlines and # not allowed)');
  }

  // Limit length to prevent abuse
  if (strValue.length > 500) {
    throw new Error('Value too long (max 500 characters)');
  }

  return strValue;
}

/**
 * Write updated Ollama env vars into docker-compose.yml
 * SECURITY: Values are sanitized to prevent YAML injection
 */
function writeOllamaEnvToCompose(updates) {
  let raw = readFileSync(COMPOSE_PATH, 'utf8');
  for (const [key, value] of Object.entries(updates)) {
    // SECURITY: Sanitize value to prevent YAML injection
    const safeValue = sanitizeEnvValue(value);

    const existing = new RegExp('(- ' + key + '=).+');
    if (existing.test(raw)) {
      raw = raw.replace(existing, '$1' + safeValue);
    } else {
      raw = raw.replace(/(- OLLAMA_[A-Z_]+=.+)/, '$1\n      - ' + key + '=' + safeValue);
    }
  }
  writeFileSync(COMPOSE_PATH, raw, 'utf8');
}

const router = express.Router();

/**
 * @openapi
 * /api/ai-settings:
 *   get:
 *     summary: List AI settings for the current tenant
 *     tags: [ai-settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: agent_role
 *         schema: { type: string, enum: [aisha, developer] }
 *     responses:
 *       200:
 *         description: AI settings retrieved
 *       400:
 *         description: tenant_id is required
 *
 * /api/ai-settings/categories:
 *   get:
 *     summary: List setting categories and labels
 *     tags: [ai-settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Categories retrieved
 *
 * /api/ai-settings/{id}:
 *   put:
 *     summary: Update one AI setting
 *     tags: [ai-settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               setting_value:
 *                 type: object
 *     responses:
 *       200:
 *         description: Setting updated
 *       404:
 *         description: Setting not found
 *
 * /api/ai-settings/reset:
 *   post:
 *     summary: Reset AI settings to defaults for an agent role
 *     tags: [ai-settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               agent_role:
 *                 type: string
 *                 enum: [aisha, developer]
 *     responses:
 *       200:
 *         description: Settings reset
 *
 * /api/ai-settings/clear-cache:
 *   post:
 *     summary: Clear in-memory AI settings cache
 *     tags: [ai-settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache cleared
 *
 * /api/ai-settings/ollama:
 *   get:
 *     summary: Get current Ollama runtime settings
 *     tags: [ai-settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ollama settings retrieved
 *   post:
 *     summary: Update Ollama runtime settings
 *     tags: [ai-settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Ollama settings updated
 *
 * /api/ai-settings/ollama/restart:
 *   post:
 *     summary: Restart Ollama service after config change
 *     tags: [ai-settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Restart requested
 */

/**
 * Default seed settings for bootstrapping a new tenant.
 */
const DEFAULT_SETTINGS = {
  aisha: [
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
    if (agent_role) query = query.eq('agent_role', agent_role);

    let { data, error } = await query;
    if (error) {
      logger.error('[ai-settings] List error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    if ((!data || data.length === 0) && agent_role) {
      logger.info(
        `[ai-settings] No settings for tenant ${tenantId}/${agent_role} — bootstrapping defaults`,
      );
      await bootstrapTenantSettings(tenantId, agent_role);
      const retry = await supa
        .from('ai_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('agent_role', agent_role)
        .order('category')
        .order('setting_key');
      data = retry.data || [];
    } else if ((!data || data.length === 0) && !agent_role) {
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
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { value } = req.body;
    const tenantId = req.tenant?.id;

    if (value === undefined)
      return res.status(400).json({ success: false, error: 'value is required' });
    if (!tenantId)
      return res
        .status(400)
        .json({ success: false, error: 'tenant_id is required — select a tenant first' });

    const supa = getSupabaseClient();
    const { data: existing, error: fetchError } = await supa
      .from('ai_settings')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !existing)
      return res.status(404).json({ success: false, error: 'Setting not found for this tenant' });

    const meta = existing.setting_value || {};
    if (meta.type === 'number') {
      const numVal = Number(value);
      if (isNaN(numVal))
        return res.status(400).json({ success: false, error: 'Value must be a number' });
      if (meta.min !== undefined && numVal < meta.min)
        return res.status(400).json({ success: false, error: `Value must be >= ${meta.min}` });
      if (meta.max !== undefined && numVal > meta.max)
        return res.status(400).json({ success: false, error: `Value must be <= ${meta.max}` });
    }

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
 */
router.post('/reset', async (req, res) => {
  try {
    const { agent_role } = req.body;
    const tenantId = req.tenant?.id;

    if (!tenantId)
      return res
        .status(400)
        .json({ success: false, error: 'tenant_id is required — select a tenant first' });

    const supa = getSupabaseClient();
    let deleteQuery = supa.from('ai_settings').delete().eq('tenant_id', tenantId);
    if (agent_role) deleteQuery = deleteQuery.eq('agent_role', agent_role);

    const { error: deleteError } = await deleteQuery;
    if (deleteError) {
      logger.error('[ai-settings] Reset delete error:', deleteError);
      return res.status(500).json({ success: false, error: deleteError.message });
    }

    if (agent_role) {
      await bootstrapTenantSettings(tenantId, agent_role);
    } else {
      await bootstrapTenantSettings(tenantId, 'aisha');
      await bootstrapTenantSettings(tenantId, 'developer');
    }

    clearAiSettingsCache(tenantId);
    res.json({ success: true, message: `Settings reset to defaults for tenant ${tenantId}` });
  } catch (err) {
    logger.error('[ai-settings] Reset error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ai-settings/clear-cache
 */
router.post('/clear-cache', async (_req, res) => {
  clearAiSettingsCache();
  res.json({ success: true, message: 'AI settings cache cleared' });
});

/**
 * GET /api/ai-settings/ollama
 * Returns Ollama container settings + live status + summary temperature
 *
 * SECURITY: Superadmin only - exposes container configuration
 *
 * NOTE: Ollama settings are container-global (not tenant-specific), but this route
 * is mounted behind validateTenantAccess middleware via server.js. Superadmins must
 * select a tenant to access these endpoints, even though the settings apply globally.
 * Consider mounting /ollama endpoints separately for cleaner architecture.
 */
router.get('/ollama', requireSuperAdminRole, async (_req, res) => {
  const current = readOllamaEnvFromCompose();

  let liveStatus = null;
  try {
    const ollamaUrl = process.env.LOCAL_LLM_BASE_URL?.replace('/v1', '') || 'http://ollama:11434';
    const r = await fetch(ollamaUrl + '/api/tags', { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const json = await r.json();
      liveStatus = { online: true, models: (json.models || []).map((m) => m.name) };
    }
  } catch {
    liveStatus = { online: false, models: [] };
  }

  res.json({
    success: true,
    settings: [
      {
        key: 'OLLAMA_NUM_CTX',
        label: 'Context Window (tokens)',
        description:
          'Max tokens Ollama allocates for context + response. Lower = less RAM. 1024 is plenty for CRM summaries; use 4096 for complex tasks.',
        type: 'number',
        value: Number(current.OLLAMA_NUM_CTX) || 1024,
        min: 512,
        max: 8192,
        step: 512,
        requiresRestart: true,
      },
      {
        key: 'OLLAMA_NUM_PARALLEL',
        label: 'Parallel Requests',
        description:
          'How many inference requests Ollama handles simultaneously. 1 is safest on CPU-only; increase if you have headroom.',
        type: 'number',
        value: Number(current.OLLAMA_NUM_PARALLEL) || 1,
        min: 1,
        max: 4,
        step: 1,
        requiresRestart: true,
      },
      {
        key: 'OLLAMA_MAX_LOADED_MODELS',
        label: 'Max Models in Memory',
        description:
          'How many models stay loaded simultaneously. Keep at 1 on CPU to avoid OOM — models swap on demand.',
        type: 'number',
        value: Number(current.OLLAMA_MAX_LOADED_MODELS) || 1,
        min: 1,
        max: 3,
        step: 1,
        requiresRestart: true,
      },
      {
        key: 'OLLAMA_KEEP_ALIVE',
        label: 'Keep Alive Duration',
        description:
          'How long a model stays loaded after last use. Use "-1" to keep forever (fastest), "5m" for default, "0" to unload immediately.',
        type: 'text',
        value: current.OLLAMA_KEEP_ALIVE || '-1',
        options: ['-1', '0', '5m', '10m', '30m', '1h'],
        requiresRestart: false,
      },
      {
        key: 'SUMMARY_TEMPERATURE',
        label: 'Summary Temperature',
        description:
          'How inventive Ollama is when writing profile summaries. Keep at 0.0-0.2 to prevent invented details. Takes effect immediately. Also set SUMMARY_TEMPERATURE in Doppler to persist across restarts.',
        type: 'number',
        value: parseFloat(process.env.SUMMARY_TEMPERATURE ?? '0.1'),
        min: 0,
        max: 1,
        step: 0.1,
        requiresRestart: false,
      },
    ],
    liveStatus,
    composePath: COMPOSE_PATH,
  });
});

/**
 * POST /api/ai-settings/ollama
 * Save Ollama settings. Compose vars written to docker-compose.yml.
 * SUMMARY_TEMPERATURE mutated in process.env (takes effect immediately).
 *
 * SECURITY: Superadmin only - modifies host docker-compose and container config
 *
 * NOTE: Ollama settings are container-global (not tenant-specific), but this route
 * is mounted behind validateTenantAccess middleware via server.js. Superadmins must
 * select a tenant to access these endpoints, even though the settings apply globally.
 * Frontend should include tenant_id in request body/query to satisfy middleware.
 */
router.post('/ollama', requireSuperAdminRole, async (req, res) => {
  const { settings: updates, restart = false } = req.body;

  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ success: false, error: 'settings object required' });
  }

  const composeUpdates = {};
  for (const key of OLLAMA_ENV_KEYS) {
    if (updates[key] !== undefined) composeUpdates[key] = String(updates[key]);
  }

  try {
    if (Object.keys(composeUpdates).length > 0) {
      writeOllamaEnvToCompose(composeUpdates);
      logger.info('[ollama-settings] Wrote to compose:', composeUpdates);
    }

    if (updates.SUMMARY_TEMPERATURE !== undefined) {
      const val = String(updates.SUMMARY_TEMPERATURE);
      process.env.SUMMARY_TEMPERATURE = val;
      logger.info('[ollama-settings] Set process.env.SUMMARY_TEMPERATURE =', val);
    }

    const allUpdated = {
      ...composeUpdates,
      ...(updates.SUMMARY_TEMPERATURE !== undefined
        ? { SUMMARY_TEMPERATURE: updates.SUMMARY_TEMPERATURE }
        : {}),
    };

    let restartResult = null;
    if (restart) {
      try {
        const composeDir = resolve(COMPOSE_PATH, '..');
        // WARNING: This requires Docker CLI in container + socket mount
        // Current backend Dockerfile doesn't include Docker tooling
        // This will fail with ENOENT unless docker is installed in the container
        execSync('docker compose up -d --force-recreate ollama', {
          cwd: composeDir,
          timeout: 60000,
          stdio: 'pipe',
        });
        restartResult = { success: true, message: 'Ollama container restarted' };
        logger.info('[ollama-settings] Restarted ollama container');
      } catch (restartErr) {
        restartResult = { success: false, message: restartErr.message };
        logger.warn('[ollama-settings] Restart failed:', restartErr.message);
      }
    }

    res.json({
      success: true,
      updated: allUpdated,
      restart: restartResult,
      message: restart
        ? 'Settings saved and Ollama restarted'
        : 'Settings saved — restart Ollama to apply compose changes',
    });
  } catch (err) {
    logger.error('[ollama-settings] Write error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ai-settings/ollama/restart
 */
router.post('/ollama/restart', async (_req, res) => {
  try {
    const composeDir = resolve(COMPOSE_PATH, '..');
    execSync('docker compose up -d --force-recreate ollama', {
      cwd: composeDir,
      timeout: 60000,
      stdio: 'pipe',
    });
    res.json({ success: true, message: 'Ollama container restarted successfully' });
  } catch (err) {
    logger.error('[ollama-settings] Restart error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
