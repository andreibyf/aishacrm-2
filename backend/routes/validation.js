/**
 * Validation Routes
 * Data quality, duplicates, validation
 */

import express from 'express';

// Helper: dynamic duplicate finder for a given entity and fields (Postgres only)
async function findDuplicatesInDb(pgPool, entityTable, tenantId, fields = []) {
  if (!pgPool || !entityTable || !tenantId || fields.length === 0) {
    return { total: 0, groups: [] };
  }

  // Whitelist of allowed columns per entity table
  const allowedColumnsMap = {
    contacts: ['first_name', 'last_name', 'email', 'phone'],
    accounts: ['name', 'industry', 'website'],
    leads: ['first_name', 'last_name', 'email', 'company'],
    opportunities: ['name', 'stage', 'amount'],
    activities: ['type', 'subject', 'date'],
  };
  const allowedColumns = allowedColumnsMap[entityTable] || [];

  // Validate fields against whitelist
  const safeFields = fields.filter((f) => allowedColumns.includes(f));
  if (safeFields.length === 0) {
    return { total: 0, groups: [] };
  }

  // Build GROUP BY key: coalesce each field to empty string to avoid null grouping issues
  const keyExpr = safeFields
    .map((f) => `COALESCE(${f}::text, '')`)
    .join(` || '|' || `);

  const sql = `
    SELECT ${keyExpr} AS dup_key, COUNT(*) AS cnt
    FROM ${entityTable}
    WHERE tenant_id = $1
    GROUP BY ${keyExpr}
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 200
  `;

  try {
    const result = await pgPool.query(sql, [tenantId]);
    const groups = (result.rows || []).map((r) => ({ key: r.dup_key, count: Number(r.cnt) }));
    return { total: groups.length, groups };
  } catch {
    // Table might not exist yet — return empty result
    return { total: 0, groups: [] };
  }
}

export default function createValidationRoutes(pgPool) {
  const router = express.Router();

  // POST /api/validation/find-duplicates - Find duplicate records
  router.post('/find-duplicates', async (req, res) => {
    try {
      const { tenant_id, entity_type, fields = [] } = req.body || {};

      if (!entity_type || !tenant_id) {
        return res.status(400).json({ status: 'error', message: 'entity_type and tenant_id are required' });
      }

      // Map entity type to table name (simple pluralization; adjust as needed)
      const tableMap = {
        Contact: 'contacts',
        Account: 'accounts',
        Lead: 'leads',
        Opportunity: 'opportunities',
        Activity: 'activities',
      };
      const table = tableMap[entity_type] || entity_type.toLowerCase();

      const result = await findDuplicatesInDb(pgPool, table, tenant_id, fields);
      res.json({ status: 'success', data: { ...result, fields, tenant_id, entity_type } });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/validation/analyze-data-quality - Analyze data quality
  router.post('/analyze-data-quality', async (req, res) => {
    try {
      const { tenant_id, entity_type } = req.body || {};

      const analysis = {
        completeness: 0,
        accuracy: 0,
        consistency: 0,
        issues: [],
        recommendations: [],
      };

      res.json({ status: 'success', data: analysis, tenant_id, entity_type });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/validation/validate-record - Validate single record
  router.post('/validate-record', async (req, res) => {
    try {
      const { tenant_id, entity_type, record: _record } = req.body || {};

      const validation = {
        valid: true,
        errors: [],
        warnings: [],
      };

      res.json({ status: 'success', data: validation, tenant_id, entity_type });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  return router;
}
