/**
 * Tenant Routes
 * CRUD operations for tenants
 */

import express from 'express';

export default function createTenantRoutes(pgPool) {
  const router = express.Router();

  // GET /api/tenants - List tenants
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0, status } = req.query;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      let query = 'SELECT * FROM tenant WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (tenant_id) {
        query += ` AND tenant_id = $${paramCount}`;
        params.push(tenant_id);
        paramCount++;
      }

      if (status) {
        query += ` AND status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await pgPool.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM tenant WHERE 1=1';
      const countParams = [];
      let countParamCount = 1;

      if (tenant_id) {
        countQuery += ` AND tenant_id = $${countParamCount}`;
        countParams.push(tenant_id);
        countParamCount++;
      }

      if (status) {
        countQuery += ` AND status = $${countParamCount}`;
        countParams.push(status);
      }

      const countResult = await pgPool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      // Normalize tenant rows to expose common branding fields from branding_settings/metadata
      const tenants = result.rows.map(r => ({
        ...r,
        logo_url: r.branding_settings?.logo_url || r.metadata?.logo_url || null,
        primary_color: r.branding_settings?.primary_color || r.metadata?.primary_color || null,
        accent_color: r.branding_settings?.accent_color || r.metadata?.accent_color || null,
        settings: r.branding_settings || {}, // For backward compatibility
        // Extract metadata fields to top-level for UI
        country: r.metadata?.country || '',
        major_city: r.metadata?.major_city || '',
        industry: r.metadata?.industry || 'other',
        business_model: r.metadata?.business_model || 'b2b',
        geographic_focus: r.metadata?.geographic_focus || 'north_america',
        elevenlabs_agent_id: r.metadata?.elevenlabs_agent_id || '',
        display_order: r.metadata?.display_order ?? 0,
        domain: r.metadata?.domain || ''
      }));

      res.json({
        status: 'success',
        data: { 
          tenants, 
          total, 
          limit: parseInt(limit), 
          offset: parseInt(offset) 
        },
      });
    } catch (error) {
      console.error('Error listing tenants:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/tenants - Create tenant
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, name, branding_settings, status, metadata } = req.body;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      if (!tenant_id) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'tenant_id is required' 
        });
      }

      const query = `
        INSERT INTO tenant (tenant_id, name, branding_settings, status, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const result = await pgPool.query(query, [
        tenant_id,
        name || null,
        branding_settings || {},
        status || 'active',
        metadata || {}
      ]);

      res.json({
        status: 'success',
        message: 'Tenant created',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error creating tenant:', error);
      
      // Handle unique constraint violation
      if (error.code === '23505') {
        return res.status(409).json({ 
          status: 'error', 
          message: 'Tenant with this tenant_id already exists' 
        });
      }
      
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/tenants/:id - Get single tenant (by tenant_id, not UUID)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      // Check if id is a UUID format (for backward compatibility) or tenant_id string
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const query = isUUID 
        ? 'SELECT * FROM tenant WHERE id = $1'
        : 'SELECT * FROM tenant WHERE tenant_id = $1';
      
      const result = await pgPool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Tenant not found',
        });
      }

      const row = result.rows[0];
      const normalized = {
        ...row,
        logo_url: row.branding_settings?.logo_url || row.metadata?.logo_url || null,
        primary_color: row.branding_settings?.primary_color || row.metadata?.primary_color || null,
        accent_color: row.branding_settings?.accent_color || row.metadata?.accent_color || null,
        settings: row.branding_settings || {}, // For backward compatibility
        // Extract metadata fields to top-level for UI
        country: row.metadata?.country || '',
        major_city: row.metadata?.major_city || '',
        industry: row.metadata?.industry || 'other',
        business_model: row.metadata?.business_model || 'b2b',
        geographic_focus: row.metadata?.geographic_focus || 'north_america',
        elevenlabs_agent_id: row.metadata?.elevenlabs_agent_id || '',
        display_order: row.metadata?.display_order ?? 0,
        domain: row.metadata?.domain || ''
      };

      res.json({
        status: 'success',
        data: normalized,
      });
    } catch (error) {
      console.error('Error getting tenant:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/tenants/:id - Update tenant
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        name, settings, status, metadata, 
        logo_url, primary_color, accent_color, branding_settings,
        // Additional metadata fields
        country, major_city, industry, business_model, geographic_focus, 
        elevenlabs_agent_id, display_order, domain
      } = req.body;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      const updates = [];
      const params = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount}`);
        params.push(name);
        paramCount++;
      }

      if (status !== undefined) {
        updates.push(`status = $${paramCount}`);
        params.push(status);
        paramCount++;
      }

      // Handle metadata - merge with existing and add new fields
      const shouldUpdateMetadata = metadata !== undefined || country !== undefined || 
        major_city !== undefined || industry !== undefined || business_model !== undefined ||
        geographic_focus !== undefined || elevenlabs_agent_id !== undefined || 
        display_order !== undefined || domain !== undefined || settings !== undefined;
      
      if (shouldUpdateMetadata) {
        // Fetch existing metadata to merge
        const cur = await pgPool.query('SELECT metadata FROM tenant WHERE id = $1', [id]);
        const existingMetadata = cur.rows[0]?.metadata || {};
        
        // Merge all metadata fields
        const mergedMetadata = {
          ...existingMetadata,
          ...metadata,
          ...(settings || {}), // Legacy settings field
          ...(country !== undefined ? { country } : {}),
          ...(major_city !== undefined ? { major_city } : {}),
          ...(industry !== undefined ? { industry } : {}),
          ...(business_model !== undefined ? { business_model } : {}),
          ...(geographic_focus !== undefined ? { geographic_focus } : {}),
          ...(elevenlabs_agent_id !== undefined ? { elevenlabs_agent_id } : {}),
          ...(display_order !== undefined ? { display_order } : {}),
          ...(domain !== undefined ? { domain } : {})
        };
        
        updates.push(`metadata = $${paramCount}`);
        params.push(mergedMetadata);
        paramCount++;
      }

      // Handle settings/branding - merge branding fields if provided
      const hasBrandingFields = (logo_url !== undefined) || (primary_color !== undefined) || (accent_color !== undefined) || (branding_settings !== undefined);
      
      if (settings !== undefined || hasBrandingFields) {
        // Fetch existing tenant branding_settings to merge
        const cur = await pgPool.query('SELECT branding_settings FROM tenant WHERE id = $1', [id]);
        const existingBranding = cur.rows[0]?.branding_settings || {};
        
        // Merge into branding_settings
        const mergedBranding = {
          ...existingBranding,
          ...(settings?.branding_settings || branding_settings || {}),
          ...(logo_url !== undefined ? { logo_url } : {}),
          ...(primary_color !== undefined ? { primary_color } : {}),
          ...(accent_color !== undefined ? { accent_color } : {})
        };
        
        updates.push(`branding_settings = $${paramCount}`);
        params.push(mergedBranding);
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No fields to update',
        });
      }

      params.push(id);
      const query = `
        UPDATE tenant 
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await pgPool.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Tenant not found',
        });
      }

      const row = result.rows[0];
      const normalized = {
        ...row,
        logo_url: row.branding_settings?.logo_url || row.metadata?.logo_url || null,
        primary_color: row.branding_settings?.primary_color || row.metadata?.primary_color || null,
        accent_color: row.branding_settings?.accent_color || row.metadata?.accent_color || null,
        settings: row.branding_settings || {}, // For backward compatibility
        // Extract metadata fields to top-level for UI
        country: row.metadata?.country || '',
        major_city: row.metadata?.major_city || '',
        industry: row.metadata?.industry || 'other',
        business_model: row.metadata?.business_model || 'b2b',
        geographic_focus: row.metadata?.geographic_focus || 'north_america',
        elevenlabs_agent_id: row.metadata?.elevenlabs_agent_id || '',
        display_order: row.metadata?.display_order ?? 0,
        domain: row.metadata?.domain || ''
      };

      // Create audit log entry
      try {
        const auditLog = {
          tenant_id: row.tenant_id,
          user_email: req.user?.email || 'system',
          action: 'update',
          entity_type: 'Tenant',
          entity_id: id,
          changes: { 
            name, status, logo_url, primary_color, accent_color, metadata, branding_settings,
            country, major_city, industry, business_model, geographic_focus, 
            elevenlabs_agent_id, display_order, domain
          },
          ip_address: req.ip,
          user_agent: req.get('user-agent')
        };
        
        await pgPool.query(`
          INSERT INTO audit_log (
            tenant_id, user_email, action, entity_type, entity_id,
            changes, ip_address, user_agent, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `, [
          auditLog.tenant_id,
          auditLog.user_email,
          auditLog.action,
          auditLog.entity_type,
          auditLog.entity_id,
          JSON.stringify(auditLog.changes),
          auditLog.ip_address,
          auditLog.user_agent
        ]);
        
        console.log('[AUDIT] Tenant updated:', id, 'by', auditLog.user_email);
      } catch (auditError) {
        console.error('[AUDIT] Failed to create audit log:', auditError.message);
        // Don't fail the request if audit logging fails
      }

      res.json({
        status: 'success',
        message: 'Tenant updated',
        data: normalized,
      });
    } catch (error) {
      console.error('[ERROR] Error updating tenant:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/tenants/:id - Delete tenant
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!pgPool) {
        return res.status(503).json({ 
          status: 'error', 
          message: 'Database not configured' 
        });
      }

      const query = 'DELETE FROM tenant WHERE id = $1 RETURNING *';
      const result = await pgPool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Tenant not found',
        });
      }

      res.json({
        status: 'success',
        message: 'Tenant deleted',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error deleting tenant:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
