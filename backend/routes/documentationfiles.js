/**
 * Documentation Files Routes
 * CRUD operations for documentation files stored in Supabase Storage (tenant-assets bucket)
 * Tracks file metadata in 'file' table with related_type='documentation'
 */

import express from 'express';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase service client
function getSupabaseAdmin() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase URL or Service Role Key not configured');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function getBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET || 'tenant-assets';
}

export default function createDocumentationFileRoutes(pgPool) {
  const router = express.Router();

  // Apply tenant validation to all routes
  router.use(validateTenantAccess);

  // Helper to normalize file record for documentation files
  function normalizeDocumentFile(row) {
    const metadata = row.metadata || {};
    return {
      ...row,
      // Map fields for frontend compatibility
      file_name: row.filename || metadata.title || 'Untitled',
      file_uri: row.filepath,
      title: metadata.title || row.filename,
      category: metadata.category || 'other',
      tags: metadata.tags || [],
      // Expose all metadata fields at top level
      ...metadata
    };
  }

  // GET /api/documentationfiles - List documentation files
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, category } = req.query;

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      // Query file table for documentation files
      const where = ['tenant_id = $1', "related_type = 'documentation'"];
      const params = [tenant_id];

      if (category && category !== 'all') {
        params.push(category);
        where.push(`metadata->>'category' = $${params.length}`);
      }

      const whereSql = `WHERE ${where.join(' AND ')}`;
      const sql = `SELECT * FROM file ${whereSql} ORDER BY created_at DESC LIMIT 1000`;

      const result = await pgPool.query(sql, params);

      res.json({
        status: 'success',
        data: {
          documentationfiles: result.rows.map(normalizeDocumentFile),
          total: result.rows.length
        }
      });
    } catch (error) {
      console.error('Error fetching documentation files:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /api/documentationfiles/:id - Get single documentation file
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const sql = "SELECT * FROM file WHERE id = $1 AND related_type = 'documentation' LIMIT 1";
      const result = await pgPool.query(sql, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Documentation file not found'
        });
      }

      res.json({
        status: 'success',
        data: normalizeDocumentFile(result.rows[0])
      });
    } catch (error) {
      console.error('Error fetching documentation file:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // POST /api/documentationfiles - Create new documentation file record
  // This should be called AFTER uploading the file to storage via /api/storage/upload
  router.post('/', async (req, res) => {
    try {
      const doc = req.body;

      if (!doc.tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const {
        tenant_id,
        filename,
        filepath,  // This should be the storage path from /api/storage/upload
        file_uri,  // Alternate name for filepath
        filesize,
        mimetype,
        uploaded_by,
        title,
        category,
        tags,
        ...rest
      } = doc || {};

      // Build metadata from extra fields
      const metadata = {
        ...rest,
        title: title || filename || 'Untitled',
        category: category || 'other',
        tags: tags || []
      };

      const query = `
        INSERT INTO file (
          tenant_id, filename, filepath, filesize, mimetype, related_type, uploaded_by, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        ) RETURNING *
      `;

      const values = [
        tenant_id,
        filename || title || 'Untitled',
        filepath || file_uri || '',
        filesize || null,
        mimetype || 'application/octet-stream',
        'documentation',  // Mark this as a documentation file
        uploaded_by || null,
        JSON.stringify(metadata)
      ];

      const result = await pgPool.query(query, values);

      res.status(201).json({
        status: 'success',
        data: normalizeDocumentFile(result.rows[0])
      });
    } catch (error) {
      console.error('Error creating documentation file:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // PUT /api/documentationfiles/:id - Update documentation file metadata
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body || {};

      // Load current record to merge metadata
      const current = await pgPool.query("SELECT * FROM file WHERE id = $1 AND related_type = 'documentation'", [id]);
      if (current.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Documentation file not found'
        });
      }

      const currentMeta = current.rows[0]?.metadata || {};
      const { id: _id, created_at: _ca, updated_at: _ua, tenant_id: _tid, ...extras } = payload;
      const newMeta = { ...currentMeta, ...extras };

      // Build SET clause
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (payload.filename !== undefined) {
        updates.push(`filename = $${paramCount++}`);
        values.push(payload.filename);
      }
      if (payload.filepath !== undefined || payload.file_uri !== undefined) {
        updates.push(`filepath = $${paramCount++}`);
        values.push(payload.filepath || payload.file_uri);
      }
      if (payload.filesize !== undefined) {
        updates.push(`filesize = $${paramCount++}`);
        values.push(payload.filesize);
      }
      if (payload.mimetype !== undefined) {
        updates.push(`mimetype = $${paramCount++}`);
        values.push(payload.mimetype);
      }
      if (payload.uploaded_by !== undefined) {
        updates.push(`uploaded_by = $${paramCount++}`);
        values.push(payload.uploaded_by);
      }

      // Always update metadata
      updates.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(newMeta));

      if (updates.length === 0) {
        return res.json({
          status: 'success',
          data: normalizeDocumentFile(current.rows[0])
        });
      }

      const query = `
        UPDATE file
        SET ${updates.join(', ')}
        WHERE id = $${paramCount} AND related_type = 'documentation'
        RETURNING *
      `;
      values.push(id);

      const result = await pgPool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Documentation file not found'
        });
      }

      res.json({
        status: 'success',
        data: normalizeDocumentFile(result.rows[0])
      });
    } catch (error) {
      console.error('Error updating documentation file:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // DELETE /api/documentationfiles/:id - Delete documentation file
  // This deletes the metadata record; the actual file in storage should be deleted separately if needed
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // Get file info before deleting (to optionally delete from storage)
      const fileResult = await pgPool.query("SELECT * FROM file WHERE id = $1 AND related_type = 'documentation'", [id]);
      
      if (fileResult.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Documentation file not found'
        });
      }

      const fileRecord = fileResult.rows[0];

      // Delete the metadata record
      await pgPool.query("DELETE FROM file WHERE id = $1 AND related_type = 'documentation'", [id]);

      // Optionally delete from Supabase Storage
      try {
        if (fileRecord.filepath) {
          const supabase = getSupabaseAdmin();
          const bucket = getBucketName();
          await supabase.storage.from(bucket).remove([fileRecord.filepath]);
          console.log(`[documentationfiles] Deleted file from storage: ${fileRecord.filepath}`);
        }
      } catch (storageError) {
        console.warn(`[documentationfiles] Failed to delete file from storage:`, storageError);
        // Continue even if storage deletion fails
      }

      res.json({
        status: 'success',
        message: 'Documentation file deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting documentation file:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
