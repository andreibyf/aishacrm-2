/**
 * Storage Routes
 * File upload/download backed by Supabase Storage (with optional tenant scoping)
 * R2 artifact storage for large AI-generated payloads (chat transcripts, agent traces, etc.)
 */

import express from 'express';
import multer from 'multer';
import { getSupabaseAdmin, getBucketName } from '../lib/supabaseFactory.js';
import { checkR2Access, buildTenantKey, putObject, getObject } from '../lib/r2.js';
import logger from '../lib/logger.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { setCorsHeaders, isAllowedOrigin } from '../lib/cors.js';

// Multer memory storage to forward buffer to Supabase
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Fetch with timeout wrapper
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds (default: 5000)
 */
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

// Build a tenant-aware storage key
function buildObjectKey({ tenantId, originalName }) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const safeName = (originalName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const scope = tenantId || 'global';
  return `uploads/${scope}/${yyyy}/${mm}/${ts}_${rand}_${safeName}`;
}

export default function createStorageRoutes(_pgPool) {
  const router = express.Router();

  /**
   * @openapi
   * /api/storage/upload:
   *   post:
   *     summary: Upload a file to storage
   *     description: Uploads a file to Supabase Storage, returning a public or signed URL.
   *     tags: [storage]
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *     responses:
   *       200:
   *         description: File uploaded successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: No file provided
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // POST /api/storage/upload - Upload file to Supabase Storage
  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'No file provided',
        });
      }

      // Try to infer tenant_id from header, query, or body
      const tenantId =
        req.headers['x-tenant-id']?.toString() ||
        req.query.tenant_id?.toString() ||
        req.body?.tenant_id?.toString() ||
        null;

      logger.debug('[storage.upload] Upload request:', {
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        tenantId,
        headers: req.headers['x-tenant-id'],
      });

      const supabase = getSupabaseAdmin();
      const bucket = getBucketName();
      const objectKey = buildObjectKey({
        tenantId,
        originalName: req.file.originalname,
      });

      logger.debug('[storage.upload] Uploading to:', {
        bucket,
        objectKey,
        tenantId,
      });

      // Upload buffer to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(objectKey, req.file.buffer, {
          contentType: req.file.mimetype || 'application/octet-stream',
          upsert: true,
        });

      if (uploadError) {
        logger.error('[storage.upload] Supabase upload error:', uploadError);
        throw uploadError;
      }

      logger.debug('[storage.upload] Upload successful:', objectKey);

      // Prefer public URL (bucket should be public). If not accessible, fall back to a signed URL.
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(objectKey);
      let fileUrl = publicUrlData?.publicUrl || null;

      // Validate public URL accessibility with a lightweight HEAD request.
      // Some Supabase projects may have a private bucket with a computed public URL that 403s.
      let isPublicAccessible = false;
      if (fileUrl) {
        try {
          logger.debug('[storage.upload] Validating public URL accessibility:', fileUrl);
          const resp = await fetchWithTimeout(fileUrl, { method: 'HEAD' }, 5000);
          isPublicAccessible = resp.ok;
          logger.debug('[storage.upload] Public URL validation result:', {
            status: resp.status,
            ok: resp.ok,
          });
        } catch (err) {
          logger.warn('[storage.upload] Public URL validation failed:', {
            error: err.message,
            fileUrl,
          });
          isPublicAccessible = false;
        }
      }

      if (!fileUrl || !isPublicAccessible) {
        logger.debug('[storage.upload] Falling back to signed URL', {
          hasFileUrl: !!fileUrl,
          isPublicAccessible,
        });
        // Fallback: generate a signed URL. Use the maximum allowed duration (7 days).
        // Note: The frontend should avoid appending cache-busting params to signed URLs.
        const expiresIn = 60 * 60 * 24 * 7; // 7 days
        const { data: signed, error: signErr } = await supabase.storage
          .from(bucket)
          .createSignedUrl(objectKey, expiresIn);
        if (signErr) throw signErr;
        fileUrl = signed?.signedUrl;
      }

      return res.json({
        status: 'success',
        message: 'File uploaded',
        data: {
          file_url: fileUrl,
          filename: objectKey,
          bucket,
          tenant_id: tenantId,
        },
      });
    } catch (error) {
      logger.error('[storage.upload] Error:', error);
      // Ensure CORS headers are present in error responses (using secure origin whitelist)
      if (!res.getHeader('Access-Control-Allow-Origin') && isAllowedOrigin(req.headers.origin)) {
        setCorsHeaders(req.headers.origin, res, true);
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Upload failed',
      });
    }
  });

  /**
   * @openapi
   * /api/storage/signed-url:
   *   post:
   *     summary: Generate a signed URL
   *     description: Returns a signed URL for a storage object when public access is unavailable.
   *     tags: [storage]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               file_uri:
   *                 type: string
   *                 description: Object key/path in the bucket
   *               filepath:
   *                 type: string
   *                 description: Alias for file_uri
   *     responses:
   *       200:
   *         description: Signed URL returned
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: Missing file identifier
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // POST /api/storage/signed-url - Generate signed URL for a file
  router.post('/signed-url', async (req, res) => {
    try {
      const { file_uri, filepath } = req.body;
      const objectKey = file_uri || filepath;

      if (!objectKey) {
        return res.status(400).json({
          status: 'error',
          message: 'file_uri or filepath is required',
        });
      }

      const supabase = getSupabaseAdmin();
      const bucket = getBucketName();
      const expiresIn = 60 * 60 * 24 * 7; // 7 days

      // First try to get public URL
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(objectKey);

      let fileUrl = publicUrlData?.publicUrl || null;
      let isPublicAccessible = false;

      // Check if public URL is accessible
      if (fileUrl) {
        try {
          logger.debug('[storage.signed-url] Validating public URL accessibility:', fileUrl);
          const resp = await fetchWithTimeout(fileUrl, { method: 'HEAD' }, 5000);
          isPublicAccessible = resp.ok;
          logger.debug('[storage.signed-url] Public URL validation result:', {
            status: resp.status,
            ok: resp.ok,
          });
        } catch (err) {
          logger.warn('[storage.signed-url] Public URL validation failed:', {
            error: err.message,
            fileUrl,
          });
          isPublicAccessible = false;
        }
      }

      // If not publicly accessible, create signed URL
      if (!fileUrl || !isPublicAccessible) {
        const { data: signed, error: signErr } = await supabase.storage
          .from(bucket)
          .createSignedUrl(objectKey, expiresIn);

        if (signErr) {
          logger.error('[storage.signed-url] Error creating signed URL:', signErr);
          throw signErr;
        }

        fileUrl = signed?.signedUrl;
      }

      if (!fileUrl) {
        return res.status(404).json({
          status: 'error',
          message: 'Could not generate URL for file',
        });
      }

      return res.json({
        status: 'success',
        data: {
          signed_url: fileUrl,
          expires_in: expiresIn,
        },
      });
    } catch (error) {
      logger.error('[storage.signed-url] Error:', error);
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to generate signed URL',
      });
    }
  });

  /**
   * @openapi
   * /api/storage/download/{fileId}:
   *   get:
   *     summary: Download file placeholder
   *     description: Placeholder endpoint; actual downloads use public or signed URLs.
   *     tags: [storage]
   *     parameters:
   *       - in: path
   *         name: fileId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Placeholder response
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // GET /api/storage/download/:fileId - Placeholder for future use
  router.get('/download/:fileId', async (req, res) => {
    try {
      const { fileId } = req.params;
      res.json({
        status: 'success',
        message: 'Download handler not implemented (use public/signed URLs)',
        data: { fileId },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/storage/bucket:
   *   get:
   *     summary: Get bucket info
   *     description: Returns storage bucket details and whether it is public.
   *     tags: [storage]
   *     responses:
   *       200:
   *         description: Bucket information
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       404:
   *         description: Bucket not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/storage/bucket - Return current bucket info and public status
  router.get('/bucket', async (req, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const bucket = getBucketName();
      let info = null;
      try {
        const { data, error } = await supabase.storage.getBucket(bucket);
        if (!error && data) info = data;
      } catch {
        // ignore, fall back to listBuckets below
      }
      if (!info) {
        try {
          const { data: list } = await supabase.storage.listBuckets();
          info = Array.isArray(list) ? list.find((b) => b.name === bucket) : null;
        } catch {
          // ignore
        }
      }
      if (!info) {
        return res.status(404).json({
          status: 'error',
          message: `Bucket '${bucket}' not found`,
        });
      }
      /**
       * @openapi
       * /api/storage/{fileId}:
       *   delete:
       *     summary: Delete a file from storage
       *     description: Deletes a file by object key from the configured Supabase bucket.
       *     tags: [storage]
       *     parameters:
       *       - in: path
       *         name: fileId
       *         required: true
       *         schema:
       *           type: string
       *     responses:
       *       200:
       *         description: File deleted
       *         content:
       *           application/json:
       *             schema:
       *               $ref: '#/components/schemas/Success'
       */
      return res.json({
        status: 'success',
        data: {
          name: info.name,
          public: info.public === true,
          created_at: info.created_at || null,
          file_size_limit: info.file_size_limit || null,
        },
      });
    } catch (error) {
      logger.error('[storage.bucket] Error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/storage/:fileId - Delete from Supabase Storage
  router.delete('/:fileId', async (req, res) => {
    try {
      const { fileId } = req.params;
      const supabase = getSupabaseAdmin();
      const bucket = getBucketName();

      const { error: delErr } = await supabase.storage.from(bucket).remove([fileId]);
      if (delErr) throw delErr;

      res.json({
        status: 'success',
        message: 'File deleted',
        data: { fileId },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * GET /api/storage/r2/check
   * Quick sanity check for R2 connectivity and env completeness.
   */
  router.get('/r2/check', async (req, res) => {
    try {
      const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
      const env = Object.fromEntries(required.map((k) => [k, Boolean(process.env[k])]));
      const missing = required.filter((k) => !process.env[k]);

      if (missing.length) {
        return res.status(200).json({
          status: 'ok',
          r2: { ok: false, reason: 'missing_env', missing, env },
          env, // Include env at top level for consistency
        });
      }

      const check = await checkR2Access();
      return res.status(200).json({
        status: 'ok',
        r2: check,
        env,
      });
    } catch (err) {
      logger.error('[storage.r2.check] error:', err);
      return res.status(500).json({
        status: 'error',
        message: err?.message || 'R2 check failed',
      });
    }
  });

  /**
   * GET /api/storage/artifacts
   * List artifact_refs for a tenant with optional filters.
   *
   * Query params:
   *   tenant_id (required via header or query)
   *   kind - filter by kind (e.g., 'tool_context_results')
   *   entity_type - filter by entity_type
   *   entity_id - filter by entity_id
   *   limit - max rows (default 50, max 200)
   *   offset - pagination offset
   */
  router.get('/artifacts', async (req, res) => {
    try {
      const tenantId =
        req.tenant?.id?.toString() ||
        req.headers['x-tenant-id']?.toString() ||
        req.query?.tenant_id?.toString() ||
        null;

      if (!tenantId) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required (x-tenant-id header preferred)',
        });
      }

      const kind = req.query?.kind?.toString() || null;
      const entityType = req.query?.entity_type?.toString() || null;
      const entityId = req.query?.entity_id?.toString() || null;
      const limit = Math.min(parseInt(req.query?.limit) || 50, 200);
      const offset = parseInt(req.query?.offset) || 0;

      // Use Supabase client directly for artifact_refs queries
      const supabase = getSupabaseClient();
      let query = supabase
        .from('artifact_refs')
        .select(
          'id, tenant_id, kind, entity_type, entity_id, r2_key, content_type, size_bytes, sha256, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (kind) {
        query = query.eq('kind', kind);
      }
      if (entityType) {
        query = query.eq('entity_type', entityType);
      }
      if (entityId) {
        query = query.eq('entity_id', entityId);
      }

      const { data: rows, error } = await query;
      if (error) {
        logger.error('[storage.artifacts.list] Supabase error:', error.message);
        throw error;
      }

      return res.status(200).json({
        status: 'ok',
        count: rows.length,
        limit,
        offset,
        artifacts: rows,
      });
    } catch (err) {
      logger.error('[storage.artifacts.list] error:', err);
      return res
        .status(500)
        .json({ status: 'error', message: err?.message || 'Failed to list artifacts' });
    }
  });

  /**
   * POST /api/storage/artifacts
   * Stores a JSON artifact in R2 and registers a pointer in Postgres (artifact_refs).
   *
   * Body:
   *   { tenant_id?, kind, entity_type?, entity_id?, payload, content_type? }
   *
   * Notes:
   * - tenant_id is inferred from x-tenant-id header first (req.tenant.id from middleware).
   * - payload can be any JSON-serializable object (will be stored as application/json).
   */
  router.post('/artifacts', async (req, res) => {
    try {
      // Use tenant from middleware if available (validateTenantAccess sets req.tenant)
      const tenantId =
        req.tenant?.id?.toString() ||
        req.headers['x-tenant-id']?.toString() ||
        req.body?.tenant_id?.toString() ||
        req.query?.tenant_id?.toString() ||
        null;

      const kind = req.body?.kind?.toString();
      const entityType = req.body?.entity_type?.toString() || null;
      const entityId = req.body?.entity_id?.toString() || null;
      const payload = req.body?.payload;

      if (!tenantId) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required (x-tenant-id header preferred)',
        });
      }
      if (!kind) {
        return res.status(400).json({ status: 'error', message: 'kind is required' });
      }
      if (payload === undefined) {
        return res.status(400).json({ status: 'error', message: 'payload is required' });
      }

      const contentType = (req.body?.content_type?.toString() || 'application/json').trim();
      const body = Buffer.from(JSON.stringify(payload), 'utf-8');
      const r2Key = buildTenantKey({ tenantId, kind, ext: 'json' });

      const uploaded = await putObject({ key: r2Key, body, contentType });

      // Register pointer in DB (artifact_refs) using Supabase client
      const supabase = getSupabaseClient();
      const { data: row, error } = await supabase
        .from('artifact_refs')
        .insert({
          tenant_id: tenantId,
          kind,
          entity_type: entityType,
          entity_id: entityId,
          r2_key: uploaded.key,
          content_type: uploaded.contentType,
          size_bytes: uploaded.sizeBytes,
          sha256: uploaded.sha256,
        })
        .select(
          'id, tenant_id, kind, entity_type, entity_id, r2_key, content_type, size_bytes, sha256, created_at',
        )
        .single();

      if (error) {
        logger.error('[storage.artifacts.post] Supabase error:', error.message);
        throw error;
      }

      return res.status(201).json({
        status: 'ok',
        artifact: row,
      });
    } catch (err) {
      logger.error('[storage.artifacts] error:', err);
      return res
        .status(500)
        .json({ status: 'error', message: err?.message || 'Failed to store artifact' });
    }
  });

  /**
   * GET /api/storage/artifacts/:id
   * Loads artifact pointer from Postgres then fetches payload from R2.
   * Query: raw=1 to return raw bytes; otherwise attempts to JSON-parse.
   */
  router.get('/artifacts/:id', async (req, res) => {
    try {
      // Use tenant from middleware if available
      const tenantId =
        req.tenant?.id?.toString() ||
        req.headers['x-tenant-id']?.toString() ||
        req.query?.tenant_id?.toString() ||
        null;

      const id = req.params.id?.toString();
      if (!tenantId) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required (x-tenant-id header preferred)',
        });
      }
      if (!id) {
        return res.status(400).json({ status: 'error', message: 'id is required' });
      }

      // Use Supabase client for artifact_refs lookup
      const supabase = getSupabaseClient();
      const { data: rows, error } = await supabase
        .from('artifact_refs')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .limit(1);

      if (error) {
        logger.error('[storage.artifacts.get] Supabase error:', error.message);
        throw error;
      }
      const ref = rows?.[0];
      if (!ref) {
        return res.status(404).json({ status: 'error', message: 'Artifact not found' });
      }

      const obj = await getObject({ key: ref.r2_key });

      if (req.query.raw?.toString() === '1') {
        res.setHeader(
          'Content-Type',
          obj.contentType || ref.content_type || 'application/octet-stream',
        );
        return res.status(200).send(obj.body);
      }

      // Default: attempt JSON
      try {
        const parsed = JSON.parse(obj.body.toString('utf-8'));
        return res.status(200).json({ status: 'ok', artifact: ref, payload: parsed });
      } catch {
        // Not JSON - return metadata + base64 payload (safe transport)
        return res.status(200).json({
          status: 'ok',
          artifact: ref,
          payload_base64: obj.body.toString('base64'),
          content_type: obj.contentType || ref.content_type || 'application/octet-stream',
        });
      }
    } catch (err) {
      logger.error('[storage.artifacts.get] error:', err);
      return res
        .status(500)
        .json({ status: 'error', message: err?.message || 'Failed to fetch artifact' });
    }
  });

  return router;
}
