import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';

export default function createActivityRoutes(pgPool) {
  const router = express.Router();

  // Apply tenant validation and employee data scope to all routes
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

// Helper function to expand metadata fields to top-level properties
  const _expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      ...rest,
      ...metadata,
      metadata,
    };
  };

  // Helper to merge metadata and expose UI-friendly fields
  function normalizeActivity(row) {
    let meta = {};
    if (row.metadata) {
      if (typeof row.metadata === 'object') {
        meta = row.metadata;
      } else if (typeof row.metadata === 'string') {
        try { meta = JSON.parse(row.metadata); } catch { meta = {}; }
      }
    }
    // Map body -> description for the UI and spread metadata back to top-level (non-destructive)
    return {
      ...row,
      description: row.body ?? meta.description ?? null,
      ...meta,
    };
  }

  // GET /api/activities - List activities with filtering
  router.get('/', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      // Parse limit/offset if provided; default to generous limits for local dev
      const limit = req.query.limit ? parseInt(req.query.limit) : 1000;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;

      // Helper: try JSON.parse for values that may be JSON-encoded
      const parseMaybeJson = (val) => {
        if (val == null) return val;
        if (typeof val !== 'string') return val;
        const s = val.trim();
        if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
          try { return JSON.parse(s); } catch { return val; }
        }
        return val;
      };

      // Build dynamic WHERE clause safely
      const where = ['tenant_id = $1'];
      const params = [tenant_id];

      // Map simple equals filters on top-level columns
      const simpleEq = [
        { key: 'status', column: 'status' },
        { key: 'type', column: 'type' },
      ];
      for (const { key, column } of simpleEq) {
        if (req.query[key]) {
          params.push(req.query[key]);
          where.push(`${column} = $${params.length}`);
        }
      }

      // assigned_to lives in metadata
      if (req.query.assigned_to) {
        const v = parseMaybeJson(req.query.assigned_to);
        if (typeof v === 'string') {
          params.push(v);
          where.push(`metadata->>'assigned_to' = $${params.length}`);
        }
      }

      // is_test_data filter (support {$ne: true})
      if (req.query.is_test_data) {
        const v = parseMaybeJson(req.query.is_test_data);
        if (v && typeof v === 'object' && v.$ne === true) {
          // keep rows where is_test_data is not true
          where.push(`COALESCE((metadata->>'is_test_data')::boolean, false) = false`);
        } else if (v === true || v === 'true') {
          where.push(`COALESCE((metadata->>'is_test_data')::boolean, false) = true`);
        }
      }

      // Tags: support { $all: [..] }
      if (req.query.tags) {
        const v = parseMaybeJson(req.query.tags);
        if (v && typeof v === 'object' && Array.isArray(v.$all)) {
          params.push(JSON.stringify(v.$all));
          where.push(`(metadata->'tags')::jsonb @> $${params.length}::jsonb`);
        }
      }

      // Due date range: due_date stored in metadata as YYYY-MM-DD
      if (req.query.due_date) {
        const v = parseMaybeJson(req.query.due_date);
        if (v && typeof v === 'object') {
          if (v.$gte) {
            params.push(v.$gte);
            where.push(`to_date(metadata->>'due_date','YYYY-MM-DD') >= to_date($${params.length},'YYYY-MM-DD')`);
          }
          if (v.$lte) {
            params.push(v.$lte);
            where.push(`to_date(metadata->>'due_date','YYYY-MM-DD') <= to_date($${params.length},'YYYY-MM-DD')`);
          }
        }
      }

      // Global $or: e.g. subject/description/related_name regex, unassigned filter, etc.
      if (req.query['$or']) {
        const v = parseMaybeJson(req.query['$or']);
        if (Array.isArray(v) && v.length > 0) {
          const orClauses = [];
          for (const cond of v) {
            const [field, expr] = Object.entries(cond)[0] || [];
            if (!field) continue;
            if (field === 'subject' && expr && typeof expr === 'object' && expr.$regex) {
              params.push(`%${expr.$regex}%`);
              orClauses.push(`subject ILIKE $${params.length}`);
            } else if (field === 'description' && expr && typeof expr === 'object' && expr.$regex) {
              params.push(`%${expr.$regex}%`);
              // description maps to body or metadata.description
              orClauses.push(`(COALESCE(body, metadata->>'description')) ILIKE $${params.length}`);
            } else if (field === 'related_name' && expr && typeof expr === 'object' && expr.$regex) {
              params.push(`%${expr.$regex}%`);
              orClauses.push(`(metadata->>'related_name') ILIKE $${params.length}`);
            } else if (field === 'assigned_to') {
              if (expr === null) {
                orClauses.push(`(metadata->>'assigned_to') IS NULL`);
              } else if (expr === '') {
                orClauses.push(`(metadata->>'assigned_to') = ''`);
              } else if (typeof expr === 'string') {
                params.push(expr);
                orClauses.push(`(metadata->>'assigned_to') = $${params.length}`);
              }
            }
          }
          if (orClauses.length > 0) {
            where.push(`(${orClauses.join(' OR ')})`);
          }
        }
      }

      // Build final SQL
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const sql = `SELECT * FROM activities ${whereSql} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      const countSql = `SELECT COUNT(*) FROM activities ${whereSql}`;

      const result = await pgPool.query(sql, [...params, limit, offset]);
      const countResult = await pgPool.query(countSql, params);

      res.json({
        status: 'success',
        data: {
          activities: result.rows.map(normalizeActivity),
          total: parseInt(countResult.rows[0].count),
          limit,
          offset,
        }
      });
    } catch (error) {
      console.error('Error fetching activities:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /api/activities/:id - Get single activity
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
  const result = await pgPool.query('SELECT * FROM activities WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Activity not found'
        });
      }
      
      res.json({
        status: 'success',
        data: normalizeActivity(result.rows[0])
      });
    } catch (error) {
      console.error('Error fetching activity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // POST /api/activities - Create new activity
  router.post('/', async (req, res) => {
    try {
      const activity = req.body;
      
      if (!activity.tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      // Map to schema + keep remaining fields in metadata for forward compatibility
      const bodyText = activity.description ?? activity.body ?? null;
      const {
        tenant_id,
        type,
        subject,
        related_id,
        // everything else to metadata
        ...rest
      } = activity || {};

      const meta = { ...rest, description: bodyText };

      // Insert only columns that exist in initial schema; put extras into metadata
      const query = `
        INSERT INTO activities (
          tenant_id, type, subject, body, related_id, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6
        ) RETURNING *
      `;

      const values = [
        tenant_id,
        (type || 'task'),
        subject || null,
        bodyText,
        related_id || null,
        JSON.stringify(meta)
      ];
      
      const result = await pgPool.query(query, values);
      
      res.status(201).json({
        status: 'success',
        data: normalizeActivity(result.rows[0])
      });
    } catch (error) {
      console.error('Error creating activity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // PUT /api/activities/:id - Update activity
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
  const payload = req.body || {};

      // Separate known columns and extra metadata
      const bodyText = payload.description ?? payload.body ?? null;
      const known = {
        type: payload.type,
        subject: payload.subject,
        body: bodyText,
        related_id: payload.related_id ?? null,
      };
      const { type, subject, body, related_id } = known;

      // Merge metadata: load current row's metadata and shallow-merge with incoming extras
      const current = await pgPool.query('SELECT metadata FROM activities WHERE id = $1', [id]);
      const currentMeta = current.rows[0]?.metadata && typeof current.rows[0].metadata === 'object' ? current.rows[0].metadata : {};
      const { tenant_id: _t, description: _d, body: _b, ...extras } = payload; // do not allow tenant change; description/body handled explicitly
      const newMeta = { ...currentMeta, ...extras, description: bodyText };

      const query = `
        UPDATE activities SET
          type = COALESCE($1, type),
          subject = COALESCE($2, subject),
          body = COALESCE($3, body),
          related_id = COALESCE($4, related_id),
          metadata = COALESCE($5, metadata)
        WHERE id = $6
        RETURNING *
      `;

      const values = [
        type,
        subject,
        body,
        related_id,
        JSON.stringify(newMeta),
        id
      ];
      
      const result = await pgPool.query(query, values);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Activity not found'
        });
      }
      
      res.json({
        status: 'success',
        data: normalizeActivity(result.rows[0])
      });
    } catch (error) {
      console.error('Error updating activity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // DELETE /api/activities/:id - Delete activity
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pgPool.query('DELETE FROM activities WHERE id = $1 RETURNING *', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Activity not found'
        });
      }
      
      res.json({
        status: 'success',
        message: 'Activity deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting activity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
