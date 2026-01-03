import express from 'express';
import { requireAdminRole } from '../middleware/validateTenant.js';
import logger from '../lib/logger.js';

// UUID format regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve tenant identifier to UUID.
 * Accepts either a UUID (returned as-is) or a text slug (resolved via tenant table).
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
  
  // Otherwise, look up by text slug (tenant.tenant_id)
  try {
    const result = await pool.query(
      'SELECT id FROM tenant WHERE tenant_id = $1 LIMIT 1',
      [tenantIdOrSlug]
    );
    return result.rows[0]?.id || null;
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

export default function createEntityLabelsRoutes(pool) {
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
      const tenantUUID = await resolveTenantUUID(pool, tenant_id);
      
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
      const result = await pool.query(
        `SELECT entity_key, custom_label, custom_label_singular 
         FROM entity_labels 
         WHERE tenant_id = $1::uuid`,
        [tenantUUID]
      );

      // Build response: merge defaults with custom labels
      const labels = { ...DEFAULT_LABELS };
      
      for (const row of result.rows) {
        labels[row.entity_key] = {
          plural: row.custom_label || DEFAULT_LABELS[row.entity_key]?.plural,
          singular: row.custom_label_singular || DEFAULT_LABELS[row.entity_key]?.singular,
        };
      }

      res.json({ 
        status: 'success', 
        data: { 
          labels,
          customized: result.rows.map(r => r.entity_key)
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
      const tenantUUID = await resolveTenantUUID(pool, tenant_id);
      
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
            pool.query(
              `DELETE FROM entity_labels WHERE tenant_id = $1::uuid AND entity_key = $2`,
              [tenantUUID, entityKey]
            )
          );
        } else {
          // Upsert custom label
          upsertPromises.push(
            pool.query(
              `INSERT INTO entity_labels (tenant_id, entity_key, custom_label, custom_label_singular, updated_at)
               VALUES ($1::uuid, $2, $3, $4, NOW())
               ON CONFLICT (tenant_id, entity_key) 
               DO UPDATE SET 
                 custom_label = EXCLUDED.custom_label,
                 custom_label_singular = EXCLUDED.custom_label_singular,
                 updated_at = NOW()`,
              [tenantUUID, entityKey, plural, singular]
            )
          );
        }
      }

      await Promise.all(upsertPromises);

      // Return updated labels
      const result = await pool.query(
        `SELECT entity_key, custom_label, custom_label_singular 
         FROM entity_labels 
         WHERE tenant_id = $1::uuid`,
        [tenantUUID]
      );

      const updatedLabels = { ...DEFAULT_LABELS };
      for (const row of result.rows) {
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
          customized: result.rows.map(r => r.entity_key)
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
      const tenantUUID = await resolveTenantUUID(pool, tenant_id);
      
      if (!tenantUUID) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Tenant not found' 
        });
      }

      await pool.query(
        `DELETE FROM entity_labels WHERE tenant_id = $1::uuid`,
        [tenantUUID]
      );

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
