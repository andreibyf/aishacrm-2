// @ts-check
/**
 * Signing Templates routes (4VD-43).
 *
 * In-house signing-template engine. Templates are stored in:
 *   - public.signing_templates row (tenant-scoped, RLS-enforced)
 *   - tenant-assets/<tenant_id>/templates/<template_id>.pdf (Supabase Storage)
 *
 * Field placement metadata lives in the `fields` jsonb column. The shape is
 * the SigningField[] format produced by buildSigningFieldsPayload from
 * src/lib/signingFieldCoords.js.
 *
 * Tenant isolation: every route requires req.tenant.id from the existing
 * tenant middleware. Backend writes use service_role (bypasses RLS) but
 * always stamp tenant_id from the request context, never from client input.
 *
 * Mounted at /api/templates in server.js.
 */

import express from 'express';
import crypto from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { getSupabaseAdmin, getBucketName } from '../lib/supabaseFactory.js';
import logger from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIELD_TYPES = ['name', 'email', 'signature', 'date', 'text', 'checkbox'];
const MAX_NAME_LENGTH = 200;
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB ceiling

// ---------------------------------------------------------------------------
// Validation helpers (pure — exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Validate the inbound `fields` array. Each entry must be a BuilderField with
 * { name, type, required?, role?, areas: [{page, x, y, w, h}] }. Throws on
 * any malformed entry; returns the normalised array on success.
 *
 * @param {unknown} fields
 * @returns {Array<object>}
 */
export function validateSigningFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    const err = new Error('fields must be a non-empty array');
    err.code = 'invalid_fields';
    throw err;
  }
  const seenNames = new Set();
  return fields.map((f, i) => {
    if (!f || typeof f !== 'object') {
      const err = new Error(`fields[${i}] must be an object`);
      err.code = 'invalid_fields';
      throw err;
    }
    if (typeof f.name !== 'string' || f.name.trim().length === 0) {
      const err = new Error(`fields[${i}].name must be a non-empty string`);
      err.code = 'invalid_fields';
      throw err;
    }
    if (!FIELD_TYPES.includes(f.type)) {
      const err = new Error(
        `fields[${i}].type must be one of: ${FIELD_TYPES.join(', ')}`,
      );
      err.code = 'invalid_fields';
      throw err;
    }
    const name = f.name.trim();
    if (seenNames.has(name)) {
      const err = new Error(`duplicate field name: ${name}`);
      err.code = 'invalid_fields';
      throw err;
    }
    seenNames.add(name);
    if (!Array.isArray(f.areas) || f.areas.length === 0) {
      const err = new Error(`fields[${i}].areas must be a non-empty array`);
      err.code = 'invalid_fields';
      throw err;
    }
    for (let j = 0; j < f.areas.length; j += 1) {
      const a = f.areas[j];
      if (!a || typeof a !== 'object') {
        const err = new Error(`fields[${i}].areas[${j}] must be an object`);
        err.code = 'invalid_fields';
        throw err;
      }
      for (const k of ['page', 'x', 'y', 'w', 'h']) {
        if (typeof a[k] !== 'number' || !Number.isFinite(a[k])) {
          const err = new Error(
            `fields[${i}].areas[${j}].${k} must be a finite number`,
          );
          err.code = 'invalid_fields';
          throw err;
        }
      }
      if (!Number.isInteger(a.page) || a.page < 0) {
        const err = new Error(
          `fields[${i}].areas[${j}].page must be a non-negative integer`,
        );
        err.code = 'invalid_fields';
        throw err;
      }
      for (const k of ['x', 'y', 'w', 'h']) {
        if (a[k] < 0 || a[k] > 1) {
          const err = new Error(
            `fields[${i}].areas[${j}].${k} must be in [0,1]`,
          );
          err.code = 'invalid_fields';
          throw err;
        }
      }
    }
    return {
      name,
      type: f.type,
      required: typeof f.required === 'boolean' ? f.required : f.type === 'signature',
      role: typeof f.role === 'string' && f.role.length > 0 ? f.role : 'First Party',
      areas: f.areas,
    };
  });
}

/**
 * Validate name + decode the base64 PDF into a Buffer. Throws on any
 * malformed input.
 *
 * @param {{name: unknown, file: unknown}} args
 * @returns {{name: string, pdfBuffer: Buffer}}
 */
export function validateTemplateInput({ name, file }) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    const err = new Error('name must be a non-empty string');
    err.code = 'invalid_name';
    throw err;
  }
  if (name.trim().length > MAX_NAME_LENGTH) {
    const err = new Error(`name must be ≤${MAX_NAME_LENGTH} chars`);
    err.code = 'invalid_name';
    throw err;
  }
  if (typeof file !== 'string' || file.length === 0) {
    const err = new Error('file must be a non-empty base64 string');
    err.code = 'invalid_file';
    throw err;
  }
  let pdfBuffer;
  try {
    pdfBuffer = Buffer.from(file, 'base64');
  } catch (_e) {
    const err = new Error('file is not valid base64');
    err.code = 'invalid_file';
    throw err;
  }
  if (pdfBuffer.length === 0) {
    const err = new Error('file decoded to zero bytes');
    err.code = 'invalid_file';
    throw err;
  }
  if (pdfBuffer.length > MAX_PDF_BYTES) {
    const err = new Error(`file exceeds ${MAX_PDF_BYTES} byte ceiling`);
    err.code = 'invalid_file';
    throw err;
  }
  // Magic-byte sniff: PDF files start with %PDF-
  if (
    pdfBuffer[0] !== 0x25 ||
    pdfBuffer[1] !== 0x50 ||
    pdfBuffer[2] !== 0x44 ||
    pdfBuffer[3] !== 0x46
  ) {
    const err = new Error('file does not appear to be a PDF (missing %PDF- header)');
    err.code = 'invalid_file';
    throw err;
  }
  return { name: name.trim(), pdfBuffer };
}

/**
 * Storage object key for a template's source PDF. Pure — exported so callers
 * (including future migration scripts) can reconstruct the path consistently.
 */
export function buildTemplateStorageKey({ tenantId, templateId }) {
  return `${tenantId}/templates/${templateId}.pdf`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export default function createTemplatesRoutes(_pgPool) {
  const router = express.Router();

  // --- POST /api/templates -------------------------------------------------
  // Body: { name, file (base64), fields[] }
  // Stamps tenant_id from req.tenant.id (never trusts client input).
  router.post('/', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_context_missing' });
    }

    const { name, file, fields } = req.body || {};

    let validated;
    try {
      const inp = validateTemplateInput({ name, file });
      const validFields = validateSigningFields(fields);
      validated = { name: inp.name, pdfBuffer: inp.pdfBuffer, fields: validFields };
    } catch (err) {
      return res.status(400).json({
        error: err.code || 'invalid_body',
        message: err.message,
      });
    }

    // Pre-generate the template id so we can use it in the storage path
    const templateId = crypto.randomUUID();
    const storagePath = buildTemplateStorageKey({ tenantId, templateId });

    // Upload PDF first; if storage fails we never insert the row (no orphan rows).
    const storageAdmin = getSupabaseAdmin();
    const bucket = getBucketName();
    const { error: uploadErr } = await storageAdmin.storage
      .from(bucket)
      .upload(storagePath, validated.pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (uploadErr) {
      logger.error('[Templates] Storage upload failed', {
        tenantId,
        templateId,
        message: uploadErr.message,
      });
      return res.status(503).json({
        error: 'storage_upload_failed',
        message: uploadErr.message,
      });
    }

    // Insert the row with the pre-generated id.
    const supabase = getSupabaseClient();
    const { data, error: insertErr } = await supabase
      .from('signing_templates')
      .insert({
        id: templateId,
        tenant_id: tenantId,
        name: validated.name,
        pdf_storage_path: storagePath,
        fields: validated.fields,
      })
      .select('id, tenant_id, name, pdf_storage_path, fields, created_at, updated_at, archived_at')
      .single();

    if (insertErr) {
      logger.error('[Templates] DB insert failed; cleaning up storage object', {
        tenantId,
        templateId,
        message: insertErr.message,
      });
      // Compensating action: delete the orphan storage object.
      await storageAdmin.storage
        .from(bucket)
        .remove([storagePath])
        .catch((err) =>
          logger.warn('[Templates] Cleanup of orphan storage object failed', {
            tenantId,
            templateId,
            message: err?.message,
          }),
        );
      return res.status(500).json({
        error: 'db_insert_failed',
        message: insertErr.message,
      });
    }

    return res.status(201).json({ data });
  });

  // --- GET /api/templates --------------------------------------------------
  // Lists active templates for the current tenant (newest first).
  router.get('/', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_context_missing' });
    }
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('signing_templates')
      .select('id, name, fields, pdf_storage_path, created_at, updated_at, archived_at')
      .eq('tenant_id', tenantId)
      .is('archived_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('[Templates] List failed', { tenantId, message: error.message });
      return res.status(500).json({ error: 'list_failed', message: error.message });
    }
    return res.json({ data: data || [] });
  });

  // --- GET /api/templates/:id ----------------------------------------------
  router.get('/:id', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_context_missing' });
    }
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('signing_templates')
      .select('id, name, fields, pdf_storage_path, created_at, updated_at, archived_at')
      .eq('tenant_id', tenantId)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) {
      logger.error('[Templates] Read failed', {
        tenantId,
        id: req.params.id,
        message: error.message,
      });
      return res.status(500).json({ error: 'read_failed', message: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: 'not_found' });
    }
    return res.json({ data });
  });

  // --- PUT /api/templates/:id ----------------------------------------------
  // Update name and/or fields. PDF is immutable post-create (re-upload by
  // creating a new template; intent: avoid breaking signing_sessions that
  // reference the same template_id).
  router.put('/:id', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_context_missing' });
    }
    const { name, fields } = req.body || {};
    const update = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > MAX_NAME_LENGTH) {
        return res.status(400).json({
          error: 'invalid_name',
          message: `name must be a non-empty string ≤${MAX_NAME_LENGTH} chars`,
        });
      }
      update.name = name.trim();
    }
    if (fields !== undefined) {
      try {
        update.fields = validateSigningFields(fields);
      } catch (err) {
        return res.status(400).json({ error: err.code || 'invalid_fields', message: err.message });
      }
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'nothing_to_update' });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('signing_templates')
      .update(update)
      .eq('tenant_id', tenantId)
      .eq('id', req.params.id)
      .is('archived_at', null)
      .select('id, name, fields, pdf_storage_path, created_at, updated_at, archived_at')
      .maybeSingle();
    if (error) {
      logger.error('[Templates] Update failed', {
        tenantId,
        id: req.params.id,
        message: error.message,
      });
      return res.status(500).json({ error: 'update_failed', message: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: 'not_found' });
    }
    return res.json({ data });
  });

  // --- DELETE /api/templates/:id ------------------------------------------
  // Soft delete via archived_at. Existing signing_sessions referencing the
  // template continue to work because we don't physically remove the row.
  router.delete('/:id', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_context_missing' });
    }
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('signing_templates')
      .update({ archived_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', req.params.id)
      .is('archived_at', null)
      .select('id, archived_at')
      .maybeSingle();
    if (error) {
      logger.error('[Templates] Archive failed', {
        tenantId,
        id: req.params.id,
        message: error.message,
      });
      return res.status(500).json({ error: 'archive_failed', message: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: 'not_found' });
    }
    return res.json({ data });
  });

  return router;
}
