import express from 'express';
import { requireAdminRole } from '../middleware/validateTenant.js';
import logger from '../lib/logger.js';
import { supabase } from '../services/supabaseClient.js';

// UUID format regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve tenant identifier to UUID.
 * Accepts either a UUID (returned as-is) or a text slug (resolved via tenant table).
 * @param {string} tenantIdOrSlug - UUID or text slug
 * @returns {Promise<string|null>} UUID or null if not found
 */
async function resolveTenantUUID(tenantIdOrSlug) {
  if (!tenantIdOrSlug) return null;
  
  // If already a UUID, return as-is
  if (UUID_REGEX.test(tenantIdOrSlug)) {
    return tenantIdOrSlug;
  }
  
  // Otherwise, look up by text slug (tenant.tenant_id)
  try {
    const { data, error } = await supabase
      .from('tenant')
      .select('id')
      .eq('tenant_id', tenantIdOrSlug)
      .limit(1)
      .single();
    
    if (error) {
      logger.error('[entitylabels] Error resolving tenant slug:', error.message);
      return null;
    }
    
    return data?.id || null;
  } catch (err) {
    logger.error('[entitylabels] Error resolving tenant slug:', err.message);
    return null;
  }
}

// Default entity labels - used when no custom labels are set
const DEFAULT_LABELS = {
  leads: { plural: 'Leads', singular: 'Lead' },
  contacts: { plural: 'Contacts', singular: 'Contact' },
  accounts: { plural: 'Accounts', singular: 'Account' },
  opportunities: { plural: 'Opportunities', singular: 'Opportunity' },
  activities: { plural: 'Activities', singular: 'Activity' },
  bizdev_sources: { plural: 'BizDev Sources', singular: 'BizDev Source' },
};

export const ENTITY_KEYS = Object.keys(DEFAULT_LABELS);

export default function createEntityLabelsRoutes() {
  const router = express.Router();

  // GET /api/entity-labels/:tenant_id - Get entity labels for a tenant (no auth required for reads)
  /**
   * @openapi
   * /api/entity-labels/{tenant_id}:
   *   get:
   *     summary: Get entity labels for a tenant
   *     description: Returns custom entity labels for a tenant, merged with defaults
   *     tags: [entitylabels]
   *     parameters:
   *       - in: path
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Entity labels
   */
  router.get('/:tenant_id', async (req, res) => {
    try {
      const { tenant_id } = req.params;

      if (!tenant_id) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'tenant_id is required' 
        });
      }

      // Resolve to UUID (handles both UUID and text slug)
      const tenantUUID = await resolveTenantUUID(tenant_id);
      
      if (!tenantUUID) {
        // Return defaults if tenant not found (graceful degradation)
        return res.json({ 
          status: 'success', 
          data: { 
            labels: { ...DEFAULT_LABELS },
            customized: []
          } 
        });
      }

      // Fetch custom labels for this tenant
      const { data: rows, error } = await supabase
        .from('entity_labels')
        .select('entity_key, custom_label, custom_label_singular')
        .eq('tenant_id', tenantUUID);
      
      if (error) throw error;

      // Build response: merge defaults with custom labels
      const labels = { ...DEFAULT_LABELS };
      
      for (const row of (rows || [])) {
        labels[row.entity_key] = {
          plural: row.custom_label || DEFAULT_LABELS[row.entity_key]?.plural,
          singular: row.custom_label_singular || DEFAULT_LABELS[row.entity_key]?.singular,
        };
      }

      res.json({ 
        status: 'success', 
        data: { 
          labels,
          customized: (rows || []).map(r => r.entity_key)
        } 
      });
    } catch (error) {
      logger.error('Error fetching entity labels:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/entity-labels/:tenant_id - Update entity labels for a tenant (admin only)
  /**
   * @openapi
   * /api/entity-labels/{tenant_id}:
   *   put:
   *     summary: Update entity labels for a tenant
   *     description: Sets custom entity labels for a tenant. Admin and superadmin only.
   *     tags: [entitylabels]
   *     parameters:
   *       - in: path
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               labels:
   *                 type: object
   *                 additionalProperties:
   *                   type: object
   *                   properties:
   *                     plural:
   *                       type: string
   *                     singular:
   *                       type: string
   *     responses:
   *       200:
   *         description: Labels updated successfully
   */
  router.put('/:tenant_id', requireAdminRole, async (req, res) => {
    try {
      const { tenant_id } = req.params;
      const { labels } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'tenant_id is required' 
        });
      }

      if (!labels || typeof labels !== 'object') {
        return res.status(400).json({ 
          status: 'error', 
          message: 'labels object is required' 
        });
      }

      // Resolve to UUID (handles both UUID and text slug)
      const tenantUUID = await resolveTenantUUID(tenant_id);
      
      if (!tenantUUID) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Tenant not found' 
        });
      }

      // Upsert each label
      const upsertPromises = [];
      
      for (const [entityKey, labelData] of Object.entries(labels)) {
        if (!ENTITY_KEYS.includes(entityKey)) {
          continue; // Skip unknown entity keys
        }

        const plural = labelData.plural?.trim() || DEFAULT_LABELS[entityKey].plural;
        const singular = labelData.singular?.trim() || DEFAULT_LABELS[entityKey].singular;

        // Check if it matches default - if so, delete the custom entry
        if (plural === DEFAULT_LABELS[entityKey].plural && 
            singular === DEFAULT_LABELS[entityKey].singular) {
          upsertPromises.push(
            supabase
              .from('entity_labels')
              .delete()
              .eq('tenant_id', tenantUUID)
              .eq('entity_key', entityKey)
          );
        } else {
          // Upsert custom label
          upsertPromises.push(
            supabase
              .from('entity_labels')
              .upsert(
                {
                  tenant_id: tenantUUID,
                  entity_key: entityKey,
                  custom_label: plural,
                  custom_label_singular: singular,
                  updated_at: new Date().toISOString()
                },
                { onConflict: 'tenant_id,entity_key' }
              )
          );
        }
      }

      await Promise.all(upsertPromises);

      // Return updated labels
      const { data: updatedRows, error: fetchError } = await supabase
        .from('entity_labels')
        .select('entity_key, custom_label, custom_label_singular')
        .eq('tenant_id', tenantUUID);
      
      if (fetchError) throw fetchError;

      const updatedLabels = { ...DEFAULT_LABELS };
      for (const row of (updatedRows || [])) {
        updatedLabels[row.entity_key] = {
          plural: row.custom_label,
          singular: row.custom_label_singular,
        };
      }

      res.json({ 
        status: 'success', 
        message: 'Entity labels updated',
        data: { 
          labels: updatedLabels,
          customized: (updatedRows || []).map(r => r.entity_key)
        } 
      });
    } catch (error) {
      logger.error('Error updating entity labels:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/entity-labels/:tenant_id - Reset all labels to defaults (admin only)
  /**
   * @openapi
   * /api/entity-labels/{tenant_id}:
   *   delete:
   *     summary: Reset entity labels to defaults
   *     description: Removes all custom labels for a tenant, reverting to defaults. Admin and superadmin only.
   *     tags: [entitylabels]
   */
  router.delete('/:tenant_id', requireAdminRole, async (req, res) => {
    try {
      const { tenant_id } = req.params;

      // Resolve to UUID (handles both UUID and text slug)
      const tenantUUID = await resolveTenantUUID(tenant_id);
      
      if (!tenantUUID) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Tenant not found' 
        });
      }

      const { error } = await supabase
        .from('entity_labels')
        .delete()
        .eq('tenant_id', tenantUUID);
      
      if (error) throw error;

      res.json({ 
        status: 'success', 
        message: 'Entity labels reset to defaults',
        data: { labels: DEFAULT_LABELS, customized: [] }
      });
    } catch (error) {
      logger.error('Error resetting entity labels:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/entity-labels/defaults - Get default labels (public)
  router.get('/defaults', async (req, res) => {
    res.json({ 
      status: 'success', 
      data: { labels: DEFAULT_LABELS } 
    });
  });

  return router;
}
