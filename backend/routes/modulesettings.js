import express from 'express';
import { requireAdminRole } from '../middleware/validateTenant.js';

export default function createModuleSettingsRoutes(pool) {
  const router = express.Router();

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
  router.get('/', async (req, res) => {
  try {
    const { tenant_id, module_name } = req.query;
    
    let query = 'SELECT * FROM modulesettings WHERE 1=1';
    const params = [];
    
    if (tenant_id) {
      params.push(tenant_id);
      query += ` AND tenant_id = $${params.length}`;
    }
    
    if (module_name) {
      params.push(module_name);
      query += ` AND module_name = $${params.length}`;
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    res.json({ status: 'success', data: { modulesettings: result.rows } });
  } catch (error) {
    console.error('Error fetching module settings:', error);
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
    const { tenant_id } = req.query || {};

    if (!tenant_id) {
      return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
    }

    const result = await pool.query('SELECT * FROM modulesettings WHERE tenant_id = $1 AND id = $2 LIMIT 1', [tenant_id, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Module setting not found' });
    }

    const row = result.rows[0];
    if (row.id !== id || row.tenant_id !== tenant_id) {
      console.error('[ModuleSettings GET /:id] Mismatched row returned', { expected: { id, tenant_id }, got: { id: row.id, tenant_id: row.tenant_id } });
      return res.status(404).json({ status: 'error', message: 'Module setting not found' });
    }
    
    res.json({ status: 'success', data: row });
  } catch (error) {
    console.error('Error fetching module setting:', error);
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
router.post('/', async (req, res) => {
  try {
    const { tenant_id, module_name, settings, is_enabled } = req.body;
    
    const result = await pool.query(
      `INSERT INTO modulesettings (tenant_id, module_name, settings, is_enabled) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (tenant_id, module_name) 
       DO UPDATE SET settings = $3, is_enabled = $4, updated_at = now()
       RETURNING *`,
      [tenant_id, module_name, settings || {}, is_enabled !== undefined ? is_enabled : true]
    );
    
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Error creating module setting:', error);
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
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { module_name, settings, is_enabled, tenant_id } = req.body;
    
    const updates = [];
    const params = [];
    let paramIndex = 1;
    
    if (tenant_id !== undefined) {
      params.push(tenant_id);
      updates.push(`tenant_id = $${paramIndex++}`);
    }
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
    params.push(id);
    
    const query = `UPDATE modulesettings SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Module setting not found' });
    }
    
    res.json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Error updating module setting:', error);
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
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('DELETE FROM modulesettings WHERE id = $1 RETURNING *', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Module setting not found' });
      }
      
      res.json({ status: 'success', data: result.rows[0] });
    } catch (error) {
      console.error('Error deleting module setting:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
