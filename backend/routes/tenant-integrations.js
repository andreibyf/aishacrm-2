import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';
import logger from '../lib/logger.js';
import { supabase } from '../services/supabaseClient.js';

export default function createTenantIntegrationRoutes() {
  const router = express.Router();

  // GET /api/tenantintegrations - List tenant integrations with filters
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, integration_type, is_active } = req.query;
      
      let query = supabase
        .from('tenant_integrations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (tenant_id) {
        query = query.eq('tenant_id', tenant_id);
      }
      
      if (integration_type) {
        query = query.eq('integration_type', integration_type);
      }
      
      if (is_active !== undefined) {
        query = query.eq('is_active', is_active === 'true');
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      res.json({ status: 'success', data: { tenantintegrations: data || [] } });
    } catch (error) {
      logger.error('Error fetching tenant integrations:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/tenantintegrations/:id - Get single tenant integration (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { data, error } = await supabase
        .from('tenant_integrations')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .limit(1)
        .single();
      
      if (error || !data) {
        return res.status(404).json({ status: 'error', message: 'Integration not found' });
      }
      
      // Safety check
      if (data.tenant_id !== tenant_id) {
        return res.status(404).json({ status: 'error', message: 'Integration not found' });
      }

      res.json({ status: 'success', data });
    } catch (error) {
      logger.error('Error fetching tenant integration:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/tenantintegrations - Create new tenant integration
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, integration_type, integration_name, is_active, api_credentials, config, metadata } = req.body;
      
      const { data, error } = await supabase
        .from('tenant_integrations')
        .insert({
          tenant_id,
          integration_type,
          integration_name: integration_name || null,
          is_active: is_active !== undefined ? is_active : true,
          api_credentials: api_credentials || {},
          config: config || {},
          metadata: metadata || {}
        })
        .select()
        .single();
      
      if (error) throw error;
      
      res.status(201).json({ status: 'success', data });
    } catch (error) {
      logger.error('Error creating tenant integration:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/tenantintegrations/:id - Update tenant integration (tenant scoped)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;
      const { integration_type, integration_name, is_active, api_credentials, config, metadata } = req.body;

      if (!validateTenantScopedId(id, tenant_id, res)) return;
      
      const updateData = {};
      
      if (integration_type !== undefined) updateData.integration_type = integration_type;
      if (integration_name !== undefined) updateData.integration_name = integration_name;
      if (is_active !== undefined) updateData.is_active = is_active;
      if (api_credentials !== undefined) updateData.api_credentials = api_credentials;
      if (config !== undefined) updateData.config = config;
      if (metadata !== undefined) updateData.metadata = metadata;
      
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
      }
      
      updateData.updated_at = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('tenant_integrations')
        .update(updateData)
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .select()
        .single();
      
      if (error || !data) {
        return res.status(404).json({ status: 'error', message: 'Integration not found' });
      }
      
      res.json({ status: 'success', data });
    } catch (error) {
      logger.error('Error updating tenant integration:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/tenantintegrations/:id - Delete tenant integration (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { data, error } = await supabase
        .from('tenant_integrations')
        .delete()
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .select()
        .single();
      
      if (error || !data) {
        return res.status(404).json({ status: 'error', message: 'Integration not found for DELETE' });
      }
      
      res.json({ status: 'success', data });
    } catch (error) {
      logger.error('Error deleting tenant integration:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
