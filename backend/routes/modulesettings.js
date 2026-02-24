import express from 'express';
import { requireAdminRole } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { cacheList, invalidateCache } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';

export default function createModuleSettingsRoutes(_pool) {
  const router = express.Router();
  const supabase = getSupabaseClient();

  // ⚠️ PROTECTION: Only superadmin and admin can access settings
  // This blocks Manager and Employee roles from modifying settings
  router.use(requireAdminRole);

  // GET /api/modulesettings - List module settings with filters
  /**
   * @openapi
   * /api/modulesettings:
   *   get:
   *     summary: List module settings
   *     description: Returns module settings filtered by tenant and/or module name. Admin access required.
   *     tags: [modulesettings]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: module_name
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of module settings
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/', cacheList('modulesettings', 300), async (req, res) => {
    try {
      const { module_name } = req.query;

      // Enforce tenant isolation
      const tenant_id = req.tenant?.id || req.query.tenant_id;
      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required',
        });
      }

      let query = supabase
        .from('modulesettings')
        .select('*')
        .eq('tenant_id', tenant_id) // Always enforce tenant scoping
        .order('created_at', { ascending: false });

      if (module_name) {
        query = query.eq('module_name', module_name);
      }

      const { data, error } = await query;

      if (error) throw error;

      res.json({ status: 'success', data: { modulesettings: data || [] } });
    } catch (error) {
      logger.error('Error fetching module settings:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/modulesettings/:id - Get single module setting (tenant required)
  /**
   * @openapi
   * /api/modulesettings/{id}:
   *   get:
   *     summary: Get a module setting
   *     description: Returns a single module setting for a tenant. Admin access required.
   *     tags: [modulesettings]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Module setting
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: Missing tenant_id
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // Enforce tenant isolation
      const tenant_id = req.tenant?.id;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { data, error } = await supabase
        .from('modulesettings')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenant_id) // Enforce tenant scoping
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Module setting not found' });
      }

      res.json({ status: 'success', data });
    } catch (error) {
      logger.error('Error fetching module setting:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/modulesettings - Create new module setting
  /**
   * @openapi
   * /api/modulesettings:
   *   post:
   *     summary: Create or upsert module setting
   *     description: Creates a new module setting or updates an existing pair (tenant_id, module_name). Admin required.
   *     tags: [modulesettings]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               module_name:
   *                 type: string
   *               settings:
   *                 type: object
   *               is_enabled:
   *                 type: boolean
   *     responses:
   *       201:
   *         description: Module setting created/updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.post('/', invalidateCache('modulesettings'), async (req, res) => {
    try {
      const { tenant_id, module_name, settings, is_enabled } = req.body;

      const { data, error } = await supabase
        .from('modulesettings')
        .upsert(
          {
            tenant_id,
            module_name,
            settings: settings || {},
            is_enabled: is_enabled !== undefined ? is_enabled : true,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'tenant_id,module_name',
          },
        )
        .select()
        .single();

      if (error) throw error;

      // Invalidate cache for this tenant's module settings
      await invalidateCache(tenant_id, 'modulesettings');

      res.status(201).json({ status: 'success', data });
    } catch (error) {
      logger.error('Error creating module setting:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/modulesettings/:id - Update module setting
  /**
   * @openapi
   * /api/modulesettings/{id}:
   *   put:
   *     summary: Update module setting
   *     description: Updates fields of a module setting by ID. Admin required.
   *     tags: [modulesettings]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               module_name:
   *                 type: string
   *               settings:
   *                 type: object
   *               is_enabled:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Module setting updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: No fields to update
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.put('/:id', invalidateCache('modulesettings'), async (req, res) => {
    try {
      const { id } = req.params;
      // Accept tenant_id from query params OR body (prefer query for security)
      const tenant_id = req.query.tenant_id || req.body.tenant_id;
      const { module_name, settings, is_enabled } = req.body;

      // Tenant ID is required for tenant-scoped updates
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const updates = [];
      const params = [];
      let paramIndex = 1;

      if (module_name !== undefined) {
        params.push(module_name);
        updates.push(`module_name = $${paramIndex++}`);
      }
      if (settings !== undefined) {
        params.push(settings);
        updates.push(`settings = $${paramIndex++}`);
      }
      if (is_enabled !== undefined) {
        params.push(is_enabled);
        updates.push(`is_enabled = $${paramIndex++}`);
      }

      if (updates.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
      }

      updates.push(`updated_at = now()`);

      // CRITICAL: Filter by tenant_id FIRST, then id (tenant isolation)
      params.push(tenant_id);
      const _tenantParamIndex = paramIndex++;
      params.push(id);
      const _idParamIndex = paramIndex++;

      // Build update object from params
      const updateData = {};
      let idx = 0;
      if (module_name !== undefined) updateData.module_name = params[idx++];
      if (settings !== undefined) updateData.settings = params[idx++];
      if (is_enabled !== undefined) updateData.is_enabled = params[idx++];
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('modulesettings')
        .update(updateData)
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .select()
        .single();

      if (error || !data) {
        return res.status(404).json({ status: 'error', message: 'Module setting not found' });
      }

      // Safety check: verify returned row matches tenant
      if (data.tenant_id !== tenant_id) {
        logger.error('[ModuleSettings PUT] Mismatched tenant_id', {
          expected: tenant_id,
          got: data.tenant_id,
        });
        return res.status(404).json({ status: 'error', message: 'Module setting not found' });
      }

      // Invalidate cache for this tenant's module settings
      await invalidateCache(tenant_id, 'modulesettings');

      res.json({ status: 'success', data });
    } catch (error) {
      logger.error('Error updating module setting:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/modulesettings/:id - Delete module setting
  /**
   * @openapi
   * /api/modulesettings/{id}:
   *   delete:
   *     summary: Delete module setting
   *     description: Deletes a module setting by ID. Admin required.
   *     tags: [modulesettings]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Module setting deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       404:
   *         description: Not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.delete('/:id', invalidateCache('modulesettings'), async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      // Tenant ID is required for tenant-scoped deletes
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // CRITICAL: Filter by tenant_id FIRST, then id (tenant isolation)
      const { data, error } = await supabase
        .from('modulesettings')
        .delete()
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .select()
        .single();

      if (error || !data) {
        return res.status(404).json({ status: 'error', message: 'Module setting not found' });
      }

      // Safety check: verify deleted row matched tenant
      if (data.tenant_id !== tenant_id) {
        logger.error('[ModuleSettings DELETE] Mismatched tenant_id', {
          expected: tenant_id,
          got: data.tenant_id,
        });
        return res.status(404).json({ status: 'error', message: 'Module setting not found' });
      }

      // Invalidate cache for this tenant's module settings
      await invalidateCache(tenant_id, 'modulesettings');

      res.json({ status: 'success', data });
    } catch (error) {
      logger.error('Error deleting module setting:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
