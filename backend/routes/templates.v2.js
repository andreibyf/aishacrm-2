import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';
import { getTemplateById, listTemplatesByType } from '../lib/templates/templateService.js';

const ALLOWED_TYPES = new Set(['email', 'sms', 'call_script']);
const ALLOWED_BLOCK_TYPES = new Set(['text', 'image', 'button', 'divider']);
const VARIABLE_TOKEN_RE = /^\{\{\s*[a-zA-Z0-9_]+\s*\}\}$/;

function isAbsoluteHttpUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isTemplateUrlValue(url) {
  return isAbsoluteHttpUrl(url) || VARIABLE_TOKEN_RE.test(String(url).trim());
}

function validateTemplateBlocks(templateJson) {
  const errors = [];
  const blocks = templateJson?.blocks;

  if (!Array.isArray(blocks)) {
    errors.push('template_json.blocks must be an array');
    return errors;
  }

  if (blocks.length === 0) {
    errors.push('template_json.blocks must include at least one block');
    return errors;
  }

  if (blocks.length > 100) {
    errors.push('template_json.blocks must not exceed 100 blocks');
  }

  blocks.forEach((block, index) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      errors.push(`template_json.blocks[${index}] must be an object`);
      return;
    }

    if (!ALLOWED_BLOCK_TYPES.has(block.type)) {
      errors.push(
        `template_json.blocks[${index}].type must be one of: text, image, button, divider`,
      );
      return;
    }

    if (block.type === 'text') {
      if (typeof block.content !== 'string' || !block.content.trim()) {
        errors.push(`template_json.blocks[${index}].content is required for text blocks`);
      }
    }

    if (block.type === 'image') {
      if (typeof block.url !== 'string' || !block.url.trim()) {
        errors.push(`template_json.blocks[${index}].url is required for image blocks`);
      } else if (!isTemplateUrlValue(block.url)) {
        errors.push(
          `template_json.blocks[${index}].url must be an absolute http(s) URL or a variable token (e.g. {{booking_link}})`,
        );
      }
    }

    if (block.type === 'button') {
      if (typeof block.text !== 'string' || !block.text.trim()) {
        errors.push(`template_json.blocks[${index}].text is required for button blocks`);
      }
      if (typeof block.url !== 'string' || !block.url.trim()) {
        errors.push(`template_json.blocks[${index}].url is required for button blocks`);
      } else if (!isTemplateUrlValue(block.url)) {
        errors.push(
          `template_json.blocks[${index}].url must be an absolute http(s) URL or a variable token (e.g. {{booking_link}})`,
        );
      }
    }
  });

  return errors;
}

function validateTemplatePayload(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      errors.push('name is required');
    }
  }

  if (!partial || body.type !== undefined) {
    if (typeof body.type !== 'string' || !ALLOWED_TYPES.has(body.type)) {
      errors.push('type must be one of: email, sms, call_script');
    }
  }

  if (!partial || body.template_json !== undefined) {
    const templateJson = body.template_json;
    if (!templateJson || typeof templateJson !== 'object' || Array.isArray(templateJson)) {
      errors.push('template_json is required');
    } else {
      errors.push(...validateTemplateBlocks(templateJson));
    }
  }

  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
    errors.push('is_active must be a boolean');
  }

  return errors;
}

export default function createTemplatesV2Routes(_pgPool, deps = {}) {
  const getSupabase = deps.getSupabaseClient || getSupabaseClient;
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const tenantId = req.tenant?.id;
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id required' });
      }

      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      if (type && !ALLOWED_TYPES.has(type)) {
        return res.status(400).json({ status: 'error', message: 'Invalid template type' });
      }

      const includeInactive = req.query.active === 'all' || req.query.include_inactive === 'true';
      const supabase = getSupabase();
      const data = await listTemplatesByType(supabase, tenantId, type, { includeInactive });

      return res.json({
        status: 'success',
        data: {
          templates: data,
          total: data.length,
        },
      });
    } catch (error) {
      logger.error('[templates.v2] GET / error', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const tenantId = req.tenant?.id;
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id required' });
      }

      const includeInactive = req.query.include_inactive === 'true';
      const supabase = getSupabase();
      const data = await getTemplateById(supabase, req.params.id, tenantId, { includeInactive });

      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Template not found' });
      }

      return res.json({ status: 'success', data });
    } catch (error) {
      logger.error('[templates.v2] GET /:id error', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const tenantId = req.tenant?.id;
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id required' });
      }

      const errors = validateTemplatePayload(req.body, { partial: false });
      if (errors.length) {
        return res.status(400).json({ status: 'error', message: errors.join('; ') });
      }

      const supabase = getSupabase();
      const payload = {
        tenant_id: tenantId,
        name: req.body.name.trim(),
        type: req.body.type,
        template_json: req.body.template_json,
        is_active: req.body.is_active ?? true,
      };

      const { data, error } = await supabase.from('templates').insert(payload).select('*').single();
      if (error) throw new Error(error.message);

      return res.status(201).json({ status: 'success', data });
    } catch (error) {
      logger.error('[templates.v2] POST / error', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const tenantId = req.tenant?.id;
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id required' });
      }

      const errors = validateTemplatePayload(req.body, { partial: true });
      if (errors.length) {
        return res.status(400).json({ status: 'error', message: errors.join('; ') });
      }

      const updatePayload = {};
      if (req.body.name !== undefined) updatePayload.name = String(req.body.name).trim();
      if (req.body.type !== undefined) updatePayload.type = req.body.type;
      if (req.body.template_json !== undefined)
        updatePayload.template_json = req.body.template_json;
      if (req.body.is_active !== undefined) updatePayload.is_active = req.body.is_active;

      if (!Object.keys(updatePayload).length) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
      }

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('templates')
        .update(updatePayload)
        .eq('id', req.params.id)
        .eq('tenant_id', tenantId)
        .select('*')
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return res.status(404).json({ status: 'error', message: 'Template not found' });

      return res.json({ status: 'success', data });
    } catch (error) {
      logger.error('[templates.v2] PUT /:id error', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const tenantId = req.tenant?.id;
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id required' });
      }

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('templates')
        .update({ is_active: false })
        .eq('id', req.params.id)
        .eq('tenant_id', tenantId)
        .select('*')
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return res.status(404).json({ status: 'error', message: 'Template not found' });

      return res.json({ status: 'success', data });
    } catch (error) {
      logger.error('[templates.v2] DELETE /:id error', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
