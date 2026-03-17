/**
 * Email Templates API Routes (V2)
 *
 * CRUD for reusable AI email templates with {{variable}} placeholders.
 * Templates combine structured prompts with live CRM context at generation time.
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';

const ALLOWED_CATEGORIES = [
  'general',
  'follow_up',
  'introduction',
  'proposal',
  'outreach',
  'thank_you',
  'update',
];

function validateTemplatePayload(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    errors.push('name is required');
  }
  if (!body.subject_template || typeof body.subject_template !== 'string' || !body.subject_template.trim()) {
    errors.push('subject_template is required');
  }
  if (!body.body_prompt || typeof body.body_prompt !== 'string' || !body.body_prompt.trim()) {
    errors.push('body_prompt is required');
  }
  if (body.category && !ALLOWED_CATEGORIES.includes(body.category)) {
    errors.push(`category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`);
  }
  if (body.variables !== undefined) {
    if (!Array.isArray(body.variables)) {
      errors.push('variables must be an array');
    } else {
      for (const v of body.variables) {
        if (!v.name || typeof v.name !== 'string') {
          errors.push('each variable must have a name string');
          break;
        }
      }
    }
  }
  if (body.entity_types !== undefined && body.entity_types !== null) {
    if (!Array.isArray(body.entity_types)) {
      errors.push('entity_types must be an array or null');
    }
  }
  return errors;
}

export default function createEmailTemplateRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/v2/email-templates — List templates
  router.get('/', async (req, res) => {
    try {
      const tenantId = req.tenant?.id;
      if (!tenantId) return res.status(400).json({ status: 'error', message: 'Tenant required' });

      const { category, entity_type, is_active = 'true' } = req.query;
      const supabase = getSupabaseClient();

      let query = supabase
        .from('email_template')
        .select('id, name, description, category, subject_template, body_prompt, entity_types, variables, is_system, is_active, usage_count, created_at, updated_at')
        .or(`tenant_id.eq.${tenantId},is_system.eq.true`)
        .order('is_system', { ascending: false })
        .order('usage_count', { ascending: false })
        .order('name', { ascending: true });

      if (is_active !== 'all') {
        query = query.eq('is_active', is_active === 'true');
      }
      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      let templates = data || [];

      // Filter by entity_type if provided (client-side since it's an array column)
      if (entity_type) {
        templates = templates.filter(
          (t) => !t.entity_types || t.entity_types.includes(entity_type),
        );
      }

      return res.json({
        status: 'success',
        data: templates,
        meta: {
          total: templates.length,
          categories: [...new Set(templates.map((t) => t.category))],
        },
      });
    } catch (error) {
      logger.error('[email-templates] GET / error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/v2/email-templates/:id — Get single template
  router.get('/:id', async (req, res) => {
    try {
      const tenantId = req.tenant?.id;
      if (!tenantId) return res.status(400).json({ status: 'error', message: 'Tenant required' });

      const { id } = req.params;
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('email_template')
        .select('*')
        .or(`tenant_id.eq.${tenantId},is_system.eq.true`)
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return res.status(404).json({ status: 'error', message: 'Template not found' });

      return res.json({ status: 'success', data });
    } catch (error) {
      logger.error('[email-templates] GET /:id error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/v2/email-templates — Create tenant template
  router.post('/', async (req, res) => {
    try {
      const tenantId = req.tenant?.id;
      if (!tenantId) return res.status(400).json({ status: 'error', message: 'Tenant required' });

      const errors = validateTemplatePayload(req.body);
      if (errors.length > 0) {
        return res.status(400).json({ status: 'error', message: errors.join('; ') });
      }

      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('email_template')
        .insert({
          tenant_id: tenantId,
          name: req.body.name.trim(),
          description: req.body.description?.trim() || null,
          category: req.body.category || 'general',
          subject_template: req.body.subject_template.trim(),
          body_prompt: req.body.body_prompt.trim(),
          entity_types: req.body.entity_types || null,
          variables: req.body.variables || [],
          is_system: false,
          is_active: true,
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);

      logger.info({ tenantId, templateId: data.id }, '[email-templates] Template created');
      return res.status(201).json({ status: 'success', data });
    } catch (error) {
      logger.error('[email-templates] POST / error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/v2/email-templates/:id — Update tenant template
  router.put('/:id', async (req, res) => {
    try {
      const tenantId = req.tenant?.id;
      if (!tenantId) return res.status(400).json({ status: 'error', message: 'Tenant required' });

      const { id } = req.params;
      const supabase = getSupabaseClient();

      // Verify it's a tenant-owned template (not system)
      const { data: existing, error: lookupError } = await supabase
        .from('email_template')
        .select('id, is_system, tenant_id')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (lookupError) throw new Error(lookupError.message);
      if (!existing) return res.status(404).json({ status: 'error', message: 'Template not found or not editable' });
      if (existing.is_system) return res.status(403).json({ status: 'error', message: 'System templates cannot be edited' });

      const updateFields = {};
      if (req.body.name !== undefined) updateFields.name = req.body.name.trim();
      if (req.body.description !== undefined) updateFields.description = req.body.description?.trim() || null;
      if (req.body.category !== undefined) {
        if (!ALLOWED_CATEGORIES.includes(req.body.category)) {
          return res.status(400).json({ status: 'error', message: `category must be one of: ${ALLOWED_CATEGORIES.join(', ')}` });
        }
        updateFields.category = req.body.category;
      }
      if (req.body.subject_template !== undefined) updateFields.subject_template = req.body.subject_template.trim();
      if (req.body.body_prompt !== undefined) updateFields.body_prompt = req.body.body_prompt.trim();
      if (req.body.entity_types !== undefined) updateFields.entity_types = req.body.entity_types;
      if (req.body.variables !== undefined) updateFields.variables = req.body.variables;
      if (req.body.is_active !== undefined) updateFields.is_active = req.body.is_active;
      updateFields.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('email_template')
        .update(updateFields)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('*')
        .single();

      if (error) throw new Error(error.message);

      logger.info({ tenantId, templateId: id }, '[email-templates] Template updated');
      return res.json({ status: 'success', data });
    } catch (error) {
      logger.error('[email-templates] PUT /:id error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/v2/email-templates/:id — Delete tenant template
  router.delete('/:id', async (req, res) => {
    try {
      const tenantId = req.tenant?.id;
      if (!tenantId) return res.status(400).json({ status: 'error', message: 'Tenant required' });

      const { id } = req.params;
      const supabase = getSupabaseClient();

      // Verify ownership and not system
      const { data: existing, error: lookupError } = await supabase
        .from('email_template')
        .select('id, is_system')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (lookupError) throw new Error(lookupError.message);
      if (!existing) return res.status(404).json({ status: 'error', message: 'Template not found' });
      if (existing.is_system) return res.status(403).json({ status: 'error', message: 'System templates cannot be deleted' });

      const { error } = await supabase
        .from('email_template')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw new Error(error.message);

      logger.info({ tenantId, templateId: id }, '[email-templates] Template deleted');
      return res.json({ status: 'success', message: 'Template deleted' });
    } catch (error) {
      logger.error('[email-templates] DELETE /:id error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
