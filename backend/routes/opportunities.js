import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';

export default function createOpportunityRoutes(pgPool) {
  const router = express.Router();

  // Apply tenant validation and employee data scope to all routes
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

// Helper function to expand metadata fields to top-level properties
// IMPORTANT: Do not let metadata keys override persisted columns (e.g., stage, amount)
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;

    // Remove any keys from metadata that would shadow real columns
    // This prevents stale values (like metadata.stage) from overriding the updated column
    const shadowKeys = [
      'stage',
      'amount',
      'probability',
      'close_date',
      'name',
      'account_id',
      'contact_id',
      'tenant_id',
      'id',
      'created_at',
      'updated_at',
    ];

    const sanitizedMetadata = { ...metadata };
    for (const key of shadowKeys) {
      if (key in sanitizedMetadata) delete sanitizedMetadata[key];
    }

    return {
      ...rest,
      ...sanitizedMetadata,
      metadata: sanitizedMetadata,
    };
  };

  // GET /api/opportunities - List opportunities with filtering
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0 } = req.query;

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const query = `
        SELECT * FROM opportunities 
        WHERE tenant_id = $1 
        ORDER BY created_date DESC 
        LIMIT $2 OFFSET $3
      `;
      
  const result = await pgPool.query(query, [tenant_id, parseInt(limit), parseInt(offset)]);
      
      const countQuery = 'SELECT COUNT(*) FROM opportunities WHERE tenant_id = $1';
      const countResult = await pgPool.query(countQuery, [tenant_id]);
      
      const opportunities = result.rows.map(expandMetadata);
      
      // Disable caching for dynamic list to avoid stale 304 during rapid updates
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.json({
        status: 'success',
        data: {
          opportunities,
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Error fetching opportunities:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /api/opportunities/:id - Get single opportunity (tenant required)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const result = await pgPool.query('SELECT * FROM opportunities WHERE tenant_id = $1 AND id = $2 LIMIT 1', [tenant_id, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found'
        });
      }
      
      const row = result.rows[0];
      if (row.id !== id || row.tenant_id !== tenant_id) {
        console.error('[Opportunities GET /:id] Mismatched row returned', { expected: { id, tenant_id }, got: { id: row.id, tenant_id: row.tenant_id } });
        return res.status(404).json({ status: 'error', message: 'Opportunity not found' });
      }

      // Disable caching for single record as well
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      const opportunity = expandMetadata(row);
      
      res.json({
        status: 'success',
        data: opportunity
      });
    } catch (error) {
      console.error('Error fetching opportunity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // POST /api/opportunities - Create new opportunity
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, name, account_id, contact_id, amount, stage, probability, close_date, metadata, ...otherFields } = req.body;
      
      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      // Merge metadata with unknown fields
      const combinedMetadata = {
        ...(metadata || {}),
        ...otherFields
      };

      const query = `
        INSERT INTO opportunities (
          tenant_id, name, account_id, contact_id, amount, stage, 
          probability, close_date, metadata, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
        ) RETURNING *
      `;
      
      const values = [
        tenant_id,
        name,
        account_id || null,
        contact_id || null,
        amount || 0,
        stage || 'prospecting',
        probability || 0,
        close_date || null,
        combinedMetadata
      ];
      
      const result = await pgPool.query(query, values);
      
      const opportunity = expandMetadata(result.rows[0]);
      
      res.status(201).json({
        status: 'success',
        data: opportunity
      });
    } catch (error) {
      console.error('Error creating opportunity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // PUT /api/opportunities/:id - Update opportunity
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, account_id, contact_id, amount, stage, probability, close_date, metadata, ...otherFields } = req.body;
      const requestedTenantId = req.body?.tenant_id || req.query?.tenant_id || null;

      if (!requestedTenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required for update' });
      }
      
      // Fetch current metadata (strictly tenant-scoped)
      const currentOpp = await pgPool.query(
        'SELECT id, tenant_id, stage, metadata FROM opportunities WHERE id = $1 AND tenant_id = $2',
        [id, requestedTenantId]
      );
      
      if (currentOpp.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found'
        });
      }

      const before = currentOpp.rows[0];
      if (before.id !== id || before.tenant_id !== requestedTenantId) {
        console.warn('[Opportunities PUT] ⚠️  Row mismatch from pre-fetch', {
          expected: { id, tenant_id: requestedTenantId },
          actual: { id: before.id, tenant_id: before.tenant_id },
          action: 'proceeding with WHERE clause enforcement'
        });
      }

      // Merge metadata
      const currentMetadata = currentOpp.rows[0].metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...otherFields,
      };
      // Normalize stage to lowercase (pipeline stages are lowercase in UI)
      const normalizedStage = typeof stage === 'string' ? stage.toLowerCase() : null;
      
      const query = `
        UPDATE opportunities SET
          name = COALESCE($1, name),
          account_id = COALESCE($2, account_id),
          contact_id = COALESCE($3, contact_id),
          amount = COALESCE($4, amount),
          stage = CASE WHEN $5 IS NOT NULL THEN $5 ELSE stage END,
          probability = COALESCE($6, probability),
          close_date = COALESCE($7, close_date),
          metadata = $8,
          updated_at = NOW()
        WHERE id = $9 AND tenant_id = $10
        RETURNING *
      `;
      
      const values = [
        name,
        account_id,
        contact_id,
        amount,
        normalizedStage,
        probability,
        close_date,
        updatedMetadata,
        id,
        requestedTenantId
      ];

      const result = await pgPool.query(query, values);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found for tenant'
        });
      }
      
      const afterRow = result.rows[0];

      if (normalizedStage !== null && afterRow.stage !== normalizedStage) {
        console.warn('[Opportunities PUT] ⚠️  Stage mismatch', {
          expected: normalizedStage,
          persisted: afterRow.stage,
          id: afterRow.id
        });
      }

      const updatedOpportunity = expandMetadata(afterRow);
      
      res.json({
        status: 'success',
        data: updatedOpportunity
      });
    } catch (error) {
      console.error('Error updating opportunity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // DELETE /api/opportunities/:id - Delete opportunity
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pgPool.query('DELETE FROM opportunities WHERE id = $1 RETURNING *', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found'
        });
      }
      
      res.json({
        status: 'success',
        message: 'Opportunity deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting opportunity:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
