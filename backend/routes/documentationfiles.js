/**
 * Documentation Files Routes
 * CRUD operations for documentation files stored in Supabase Storage (tenant-assets bucket)
 * Tracks file metadata in 'file' table with related_type='documentation'
 */

import express from 'express';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import { getSupabaseAdmin, getBucketName } from '../lib/supabaseFactory.js';
import logger from '../lib/logger.js';

export default function createDocumentationFileRoutes(_pgPool) {
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
      file_type: row.mimetype || 'unknown',
      title: metadata.title || row.filename,
      category: metadata.category || 'other',
      tags: metadata.tags || [],
      created_at: row.created_at, // Expose created_at for sorting and display
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
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      let query = supabase
        .from('file')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('related_type', 'documentation')
        .order('created_at', { ascending: false })
        .limit(1000);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      let filtered = data || [];
      if (category && category !== 'all') {
        filtered = filtered.filter(row => row.metadata?.category === category);
      }

      res.json({
        status: 'success',
        data: {
          documentationfiles: filtered.map(normalizeDocumentFile),
          total: filtered.length
        }
      });
    } catch (error) {
      logger.error('Error fetching documentation files:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /api/documentationfiles/deletion-history - Get deletion audit trail
  // IMPORTANT: This route MUST be defined BEFORE /:id to avoid matching "deletion-history" as an ID
  router.get('/deletion-history', async (req, res) => {
    try {
      const { tenant_id, limit = 20, offset = 0 } = req.query;
      
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      // Retention policy: Delete logs older than 90 days (runs opportunistically)
      // Only run cleanup occasionally to avoid performance impact
      const shouldCleanup = Math.random() < 0.1; // 10% chance per request
      if (shouldCleanup) {
        try {
          const retentionDays = 90;
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
          
          const { error: cleanupError } = await supabase
            .from('system_logs')
            .delete()
            .eq('source', 'documentationfiles')
            .filter('metadata->>action', 'eq', 'document_delete')
            .lt('created_at', cutoffDate.toISOString());
          
          if (cleanupError) {
            logger.warn('[documentationfiles] Retention cleanup failed:', cleanupError.message);
          } else {
            logger.debug('[documentationfiles] Retention cleanup executed (90 days)');
          }
        } catch (cleanupErr) {
          logger.warn('[documentationfiles] Retention cleanup exception:', cleanupErr.message);
        }
      }
      
      // Query system_logs for document deletions from documentationfiles source
      const { data: logs, error, count } = await supabase
        .from('system_logs')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .eq('source', 'documentationfiles')
        .filter('metadata->>action', 'eq', 'document_delete')
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      
      if (error) throw new Error(error.message);
      
      // Format the response for frontend consumption
      const formattedData = (logs || []).map(log => {
        const metadata = log.metadata || {};
        return {
          id: log.id,
          document_id: metadata.document_id,
          document_name: metadata.document_name || 'Unknown',
          document_type: metadata.document_type || 'unknown',
          deleted_by: {
            user_id: metadata.deleted_by_user_id,
            name: metadata.deleted_by_name || metadata.deleted_by_email || 'Unknown',
            email: metadata.deleted_by_email || 'Unknown',
            role: metadata.deleted_by_role || 'unknown'
          },
          deletion_reason: metadata.reason || 'No reason provided',
          deleted_at: log.created_at,
          ip_address: metadata.ip_address,
          user_agent: metadata.user_agent
        };
      });
      
      res.json({
        status: 'success',
        data: formattedData,
        pagination: {
          total: count || 0,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + formattedData.length) < (count || 0)
        }
      });
    } catch (error) {
      logger.error('[documentationfiles] Error fetching deletion history:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/documentationfiles/:id - Get single documentation file
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .from('file')
        .select('*')
        .eq('id', id)
        .eq('related_type', 'documentation')
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'Documentation file not found'
        });
      }

      res.json({
        status: 'success',
        data: normalizeDocumentFile(data)
      });
    } catch (error) {
      logger.error('Error fetching documentation file:', error);
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
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      const payload = {
        tenant_id,
        filename: filename || title || 'Untitled',
        filepath: filepath || file_uri || '',
        filesize: filesize || null,
        mimetype: mimetype || 'application/octet-stream',
        related_type: 'documentation',
        uploaded_by: uploaded_by || null,
        metadata
      };

      const { data, error } = await supabase
        .from('file')
        .insert([payload])
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      res.status(201).json({
        status: 'success',
        data: normalizeDocumentFile(data)
      });
    } catch (error) {
      logger.error('Error creating documentation file:', error);
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
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      // Load current record to merge metadata
      const { data: current, error: fetchErr } = await supabase
        .from('file')
        .select('*')
        .eq('id', id)
        .eq('related_type', 'documentation')
        .maybeSingle();
      
      if (fetchErr && fetchErr.code !== 'PGRST116') throw new Error(fetchErr.message);
      if (!current) {
        return res.status(404).json({
          status: 'error',
          message: 'Documentation file not found'
        });
      }

      const currentMeta = current.metadata || {};
      const { id: _id, created_at: _ca, updated_at: _ua, tenant_id: _tid, ...extras } = payload;
      const newMeta = { ...currentMeta, ...extras };

      // Build update payload
      const updatePayload = {};
      if (payload.filename !== undefined) updatePayload.filename = payload.filename;
      if (payload.filepath !== undefined || payload.file_uri !== undefined) {
        updatePayload.filepath = payload.filepath || payload.file_uri;
      }
      if (payload.filesize !== undefined) updatePayload.filesize = payload.filesize;
      if (payload.mimetype !== undefined) updatePayload.mimetype = payload.mimetype;
      if (payload.uploaded_by !== undefined) updatePayload.uploaded_by = payload.uploaded_by;
      updatePayload.metadata = newMeta;

      if (Object.keys(updatePayload).length === 1 && updatePayload.metadata) {
        return res.json({
          status: 'success',
          data: normalizeDocumentFile(current)
        });
      }

      const { data, error } = await supabase
        .from('file')
        .update(updatePayload)
        .eq('id', id)
        .eq('related_type', 'documentation')
        .select('*')
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'Documentation file not found'
        });
      }

      res.json({
        status: 'success',
        data: normalizeDocumentFile(data)
      });
    } catch (error) {
      logger.error('Error updating documentation file:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // DELETE /api/documentationfiles/:id - Delete documentation file with audit logging
  // This deletes the metadata record and logs the deletion to system_logs
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, reason } = req.query;
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      // Get file info before deleting (to optionally delete from storage)
      const { data: fileRecord, error: fetchErr } = await supabase
        .from('file')
        .select('*')
        .eq('id', id)
        .eq('related_type', 'documentation')
        .maybeSingle();
      
      if (fetchErr && fetchErr.code !== 'PGRST116') throw new Error(fetchErr.message);
      if (!fileRecord) {
        return res.status(404).json({
          status: 'error',
          message: 'Documentation file not found'
        });
      }

      // Delete the metadata record
      const { error: deleteErr } = await supabase
        .from('file')
        .delete()
        .eq('id', id)
        .eq('related_type', 'documentation');
      if (deleteErr) throw new Error(deleteErr.message);

      // Optionally delete from Supabase Storage
      try {
        if (fileRecord.filepath) {
          const supabaseAdmin = getSupabaseAdmin();
          const bucket = getBucketName();
          await supabaseAdmin.storage.from(bucket).remove([fileRecord.filepath]);
          logger.debug(`[documentationfiles] Deleted file from storage: ${fileRecord.filepath}`);
        }
      } catch (storageError) {
        logger.warn(`[documentationfiles] Failed to delete file from storage:`, storageError);
        // Continue even if storage deletion fails
      }

      // Log deletion to system_logs for audit trail
      let auditLogged = false;
      try {
        // Use name from auth middleware, fallback to email
        const deletedByName = req.user?.name || req.user?.email || 'Unknown';

        const { error: logError } = await supabase.from('system_logs').insert({
          tenant_id: tenant_id || fileRecord.tenant_id,
          source: 'documentationfiles',
          level: 'info',
          message: `Document deleted: ${fileRecord.filename || fileRecord.metadata?.title || 'Unknown'}`,
          metadata: {
            action: 'document_delete',
            document_id: id,
            document_name: fileRecord.filename || fileRecord.metadata?.title || 'Unknown',
            document_type: fileRecord.mimetype || 'unknown',
            file_path: fileRecord.filepath,
            reason: reason || 'No reason provided',
            deleted_by_user_id: req.user?.id || 'unknown',
            deleted_by_name: deletedByName,
            deleted_by_email: req.user?.email || 'unknown',
            deleted_by_role: req.user?.role || 'unknown',
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
          }
        });
        if (!logError) {
          auditLogged = true;
          logger.info(`[documentationfiles] Audit log created for deleted document: ${id}`);
        } else {
          logger.warn(`[documentationfiles] Failed to create audit log:`, logError);
        }
      } catch (logErr) {
        logger.warn(`[documentationfiles] Exception while creating audit log:`, logErr);
      }

      res.json({
        status: 'success',
        message: 'Documentation file deleted successfully',
        audit_logged: auditLogged
      });
    } catch (error) {
      logger.error('Error deleting documentation file:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
