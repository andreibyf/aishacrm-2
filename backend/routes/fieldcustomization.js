import express from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import logger from '../lib/logger.js';
import { getSupabaseClient as defaultGetSupabaseClient } from '../lib/supabase-db.js';

/**
 * Field Customization Routes
 * Manage custom fields for CRM entities (Opportunity, Activity, Contact, Lead, Account).
 *
 * Tenant context is read from req.user.tenant_id, which is populated by
 * authenticateRequest middleware. req.tenant is only set when
 * validateTenantAccess middleware runs — this router does NOT mount it,
 * so reading req.tenant.id would always be undefined and silently insert
 * NULL into tenant_id (historical bug — see migration 106).
 */

/**
 * Resolve the tenant UUID for the authenticated user, or send a 400.
 * Returns the tenant UUID string, or null if a response was already sent.
 */
function resolveTenantId(req, res) {
  const tenantId = req.user?.tenant_id || req.user?.tenant_uuid || null;
  if (!tenantId) {
    res.status(400).json({
      status: 'error',
      message: 'No tenant context on authenticated user',
    });
    return null;
  }
  return tenantId;
}

/**
 * API-boundary shape normalization.
 *
 * The frontend uses { entity_name, field_type, placeholder, help_text,
 * display_order, validation_rules } as top-level properties. The DB stores
 * entity_type as its own column and the rest under a metadata jsonb blob.
 * These helpers are the single place those shapes are reconciled so that
 * the DB schema and frontend contract can evolve independently.
 */

// Keys the frontend sends at the top level that actually live under metadata in the DB.
const METADATA_KEYS = [
  'field_type',
  'placeholder',
  'help_text',
  'display_order',
  'validation_rules',
];

/** Convert a frontend request body to a DB row shape. */
function toDbShape(body, { preserveMetadata = null } = {}) {
  const { entity_name, ...rest } = body || {};
  const row = {};

  if (entity_name !== undefined) row.entity_type = entity_name;

  // Pass-through columns that live directly on the table.
  for (const key of ['field_name', 'label', 'is_visible', 'is_required', 'options']) {
    if (rest[key] !== undefined) row[key] = rest[key];
  }

  // Fold frontend-flat-but-DB-nested keys into metadata.
  const nestedFromBody = {};
  for (const key of METADATA_KEYS) {
    if (rest[key] !== undefined) nestedFromBody[key] = rest[key];
  }
  const hasNested = Object.keys(nestedFromBody).length > 0;
  const bodyMetadata = rest.metadata || {};

  if (hasNested || Object.keys(bodyMetadata).length > 0 || preserveMetadata) {
    row.metadata = {
      ...(preserveMetadata || {}),
      ...bodyMetadata,
      ...nestedFromBody,
      is_custom: true,
    };
  }

  return row;
}

/** Convert a DB row to a frontend response shape. */
function toApiShape(row) {
  if (!row) return row;
  const { entity_type, metadata, ...rest } = row;
  const meta = metadata || {};
  return {
    ...rest,
    entity_name: entity_type,
    field_type: meta.field_type || 'text',
    placeholder: meta.placeholder ?? '',
    help_text: meta.help_text ?? '',
    display_order: meta.display_order ?? 0,
    validation_rules: meta.validation_rules ?? {},
    metadata: meta, // keep the raw blob too (frontend reads metadata.is_custom)
  };
}

export default function createFieldCustomizationRoutes(_pgPool, opts = {}) {
  const router = express.Router();
  const getSupabaseClient = opts.getSupabaseClient || defaultGetSupabaseClient;

  // GET /api/fieldcustomizations - List all field customizations for tenant
  /**
   * @openapi
   * /api/fieldcustomizations:
   *   get:
   *     summary: List field customizations
   *     description: Returns all custom fields for the authenticated tenant
   *     tags: [fieldcustomization]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Tenant ID (from auth context)
   *     responses:
   *       200:
   *         description: List of field customizations
   */
  router.get('/', requireAuth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req, res);
      if (!tenantId) return;

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('field_customization')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('entity_type', { ascending: true })
        .order('field_name', { ascending: true });

      if (error) throw error;

      // Return array directly for frontend entity API compatibility
      res.json((data || []).map(toApiShape));
    } catch (error) {
      logger.error('[fieldcustomization] Error listing:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch field customizations',
      });
    }
  });

  // GET /api/fieldcustomizations/:id - Get single field customization
  /**
   * @openapi
   * /api/fieldcustomizations/{id}:
   *   get:
   *     summary: Get field customization by ID
   *     tags: [fieldcustomization]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Field customization details
   */
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const tenantId = resolveTenantId(req, res);
      if (!tenantId) return;

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('field_customization')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'Field customization not found',
        });
      }

      // Return data directly
      res.json(toApiShape(data));
    } catch (error) {
      logger.error('[fieldcustomization] Error fetching:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch field customization',
      });
    }
  });

  // POST /api/fieldcustomizations - Create new field customization
  /**
   * @openapi
   * /api/fieldcustomizations:
   *   post:
   *     summary: Create field customization
   *     tags: [fieldcustomization]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - entity_name
   *               - field_name
   *               - label
   *             properties:
   *               entity_name:
   *                 type: string
   *                 enum: [Opportunity, Activity]
   *               field_name:
   *                 type: string
   *               label:
   *                 type: string
   *               field_type:
   *                 type: string
   *                 enum: [text, number, date, currency]
   *               is_visible:
   *                 type: boolean
   *               is_required:
   *                 type: boolean
   *               options:
   *                 type: array
   *               metadata:
   *                 type: object
   *     responses:
   *       201:
   *         description: Field customization created
   */
  router.post('/', requireAuth, async (req, res) => {
    try {
      const tenantId = resolveTenantId(req, res);
      if (!tenantId) return;

      const { entity_name, field_name, label } = req.body || {};

      if (!entity_name || !field_name || !label) {
        return res.status(400).json({
          status: 'error',
          message: 'entity_name, field_name, and label are required',
        });
      }

      // Ensure field_name has custom_ prefix
      const normalizedFieldName = field_name.startsWith('custom_')
        ? field_name
        : `custom_${field_name}`;

      const insertData = {
        ...toDbShape({ ...req.body, field_name: normalizedFieldName }),
        tenant_id: tenantId,
      };

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('field_customization')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          // Unique constraint violation
          return res.status(409).json({
            status: 'error',
            message: 'A field with this name already exists for this entity',
          });
        }
        throw error;
      }

      // Return created data directly
      res.status(201).json(toApiShape(data));
    } catch (error) {
      logger.error('[fieldcustomization] Error creating:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to create field customization',
      });
    }
  });

  // PUT /api/fieldcustomizations/:id - Update field customization
  /**
   * @openapi
   * /api/fieldcustomizations/{id}:
   *   put:
   *     summary: Update field customization
   *     tags: [fieldcustomization]
   *     parameters:
   *       - in: path
   *         name: id
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
   *     responses:
   *       200:
   *         description: Field customization updated
   */
  router.put('/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const tenantId = resolveTenantId(req, res);
      if (!tenantId) return;

      const supabase = getSupabaseClient();

      // Fetch existing row to preserve metadata keys not present in the update
      // (prevents a partial PUT from clobbering help_text/placeholder/etc).
      const { data: existing, error: fetchError } = await supabase
        .from('field_customization')
        .select('metadata')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
      if (!existing) {
        return res.status(404).json({
          status: 'error',
          message: 'Field customization not found',
        });
      }

      // entity_name and field_name are immutable on PUT (would orphan stored
      // values in entity metadata.custom.*). Strip them defensively.
      const { entity_name: _ignoreEntity, field_name: _ignoreField, ...rest } = req.body || {};

      const updateData = {
        ...toDbShape(rest, { preserveMetadata: existing.metadata || {} }),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('field_customization')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'Field customization not found',
        });
      }

      // Return updated data directly
      res.json(toApiShape(data));
    } catch (error) {
      logger.error('[fieldcustomization] Error updating:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to update field customization',
      });
    }
  });

  // DELETE /api/fieldcustomizations/:id - Delete field customization
  /**
   * @openapi
   * /api/fieldcustomizations/{id}:
   *   delete:
   *     summary: Delete field customization
   *     tags: [fieldcustomization]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Field customization deleted
   */
  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const tenantId = resolveTenantId(req, res);
      if (!tenantId) return;

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('field_customization')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      // Return success message for DELETE
      res.json({ message: 'Field customization deleted successfully' });
    } catch (error) {
      logger.error('[fieldcustomization] Error deleting:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to delete field customization',
      });
    }
  });

  return router;
}
