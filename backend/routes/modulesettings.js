import express from 'express';
import { requireAdminRole } from '../middleware/validateTenant.js';

export default function createModuleSettingsRoutes(pool) {
  const router = express.Router();

  // ⚠️ PROTECTION: Only superadmin and admin can access settings
  // This blocks Manager and Employee roles from modifying settings
  router.use(requireAdminRole);

  // GET /api/modulesettings - List module settings with filters
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

// GET /api/modulesettings/:id - Get single module setting
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM modulesettings WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Module setting not found' });
    }
    
    res.json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching module setting:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/modulesettings - Create new module setting
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
