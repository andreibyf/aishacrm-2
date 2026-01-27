/**
 * CARE Workflow Config API Routes
 * 
 * Per-tenant CARE workflow configuration management.
 * Allows admins to configure which workflow handles CARE triggers
 * and customize CARE behavior per tenant.
 */

import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { requireSuperAdminRole, validateTenantAccess } from '../middleware/validateTenant.js';
import { invalidateCareConfigCache } from '../lib/care/careTenantConfig.js';
import logger from '../lib/logger.js';

const router = Router();

/**
 * GET /api/care-config
 * Get CARE workflow configuration for current tenant
 */
router.get('/', validateTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({
        status: 'error',
        message: 'tenant_id is required'
      });
    }

    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('care_workflow_config')
      .select(`
        *,
        workflow:workflow_id (
          id,
          name,
          description,
          is_active,
          metadata
        )
      `)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      logger.error('[CareConfig] Error fetching config:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch CARE configuration'
      });
    }

    // If no config exists, return defaults
    if (!data) {
      return res.json({
        status: 'success',
        data: {
          tenant_id: tenantId,
          is_enabled: false,
          state_write_enabled: false,
          shadow_mode: true,
          webhook_timeout_ms: 3000,
          webhook_max_retries: 2,
          workflow: null,
          webhook_url: null,
          _isDefault: true
        }
      });
    }

    // Generate webhook URL from workflow if not custom
    let effectiveWebhookUrl = data.webhook_url;
    if (!effectiveWebhookUrl && data.workflow_id) {
      // CARE webhooks are internal (backend calling itself), use internal port
      const baseUrl = process.env.CARE_WEBHOOK_BASE_URL || 'http://localhost:3001';
      effectiveWebhookUrl = `${baseUrl}/api/workflows/${data.workflow_id}/webhook`;
    }

    res.json({
      status: 'success',
      data: {
        ...data,
        effective_webhook_url: effectiveWebhookUrl
      }
    });
  } catch (err) {
    logger.error('[CareConfig] Unexpected error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * PUT /api/care-config
 * Update CARE workflow configuration for current tenant
 */
router.put('/', validateTenantAccess, requireSuperAdminRole, async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.body.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({
        status: 'error',
        message: 'tenant_id is required'
      });
    }

    const {
      workflow_id,
      webhook_url,
      webhook_secret,
      is_enabled,
      state_write_enabled,
      shadow_mode,
      webhook_timeout_ms,
      webhook_max_retries
    } = req.body;

    const supabase = getSupabaseClient();
    
    // Build upsert payload
    const payload = {
      tenant_id: tenantId,
      updated_at: new Date().toISOString()
    };

    // Only include fields that were explicitly provided
    if (workflow_id !== undefined) payload.workflow_id = workflow_id;
    if (webhook_url !== undefined) payload.webhook_url = webhook_url;
    if (webhook_secret !== undefined) payload.webhook_secret = webhook_secret;
    if (is_enabled !== undefined) payload.is_enabled = is_enabled;
    if (state_write_enabled !== undefined) payload.state_write_enabled = state_write_enabled;
    if (shadow_mode !== undefined) payload.shadow_mode = shadow_mode;
    if (webhook_timeout_ms !== undefined) payload.webhook_timeout_ms = webhook_timeout_ms;
    if (webhook_max_retries !== undefined) payload.webhook_max_retries = webhook_max_retries;

    const { data, error } = await supabase
      .from('care_workflow_config')
      .upsert(payload, {
        onConflict: 'tenant_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      logger.error('[CareConfig] Error updating config:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to update CARE configuration'
      });
    }

    logger.info(`[CareConfig] Updated config for tenant ${tenantId}`, {
      workflow_id: data.workflow_id,
      is_enabled: data.is_enabled,
      state_write_enabled: data.state_write_enabled
    });

    // Invalidate cache so aiTriggersWorker picks up new config immediately
    invalidateCareConfigCache(tenantId);

    res.json({
      status: 'success',
      data,
      message: 'CARE configuration updated successfully'
    });
  } catch (err) {
    logger.error('[CareConfig] Unexpected error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/care-config/workflows
 * List available workflows for CARE trigger selection
 * Only returns workflows with care_trigger node type
 */
router.get('/workflows', validateTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({
        status: 'error',
        message: 'tenant_id is required'
      });
    }

    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('workflow')
      .select('id, name, description, is_active, metadata, created_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      logger.error('[CareConfig] Error fetching workflows:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch workflows'
      });
    }

    // Filter to only workflows that have a care_trigger node
    const careWorkflows = (data || []).filter(workflow => {
      const nodes = workflow.metadata?.nodes || [];
      return nodes.some(node => node.type === 'care_trigger');
    });

    // Add webhook URL for each workflow
    const baseUrl = process.env.CARE_WEBHOOK_BASE_URL || 'http://localhost:3001';
    const workflowsWithUrls = careWorkflows.map(wf => ({
      ...wf,
      webhook_url: `${baseUrl}/api/workflows/${wf.id}/webhook`
    }));

    res.json({
      status: 'success',
      data: {
        workflows: workflowsWithUrls,
        total: workflowsWithUrls.length
      }
    });
  } catch (err) {
    logger.error('[CareConfig] Unexpected error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/care-config
 * Remove CARE workflow configuration for current tenant (reset to defaults)
 */
router.delete('/', validateTenantAccess, requireSuperAdminRole, async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({
        status: 'error',
        message: 'tenant_id is required'
      });
    }

    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('care_workflow_config')
      .delete()
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error('[CareConfig] Error deleting config:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to delete CARE configuration'
      });
    }

    logger.info(`[CareConfig] Deleted config for tenant ${tenantId}`);

    // Invalidate cache so aiTriggersWorker falls back to env defaults
    invalidateCareConfigCache(tenantId);

    res.json({
      status: 'success',
      message: 'CARE configuration reset to defaults'
    });
  } catch (err) {
    logger.error('[CareConfig] Unexpected error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * Export router factory function
 * Matches pattern used by other routes in server.js
 */
export default function createCareConfigRoutes(_pgPool) {
  return router;
}
