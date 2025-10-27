import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';

export default function createOpportunityRoutes(pgPool) {
  const router = express.Router();

  // Apply tenant validation and employee data scope to all routes
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

// Helper function to expand metadata fields to top-level properties
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      ...rest,
      ...metadata,
      metadata,
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

  // GET /api/opportunities/:id - Get single opportunity
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pgPool.query('SELECT * FROM opportunities WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found'
        });
      }
      
      const opportunity = expandMetadata(result.rows[0]);
      
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
      
      // Fetch current metadata
      const currentOpp = await pgPool.query('SELECT metadata FROM opportunities WHERE id = $1', [id]);
      
      if (currentOpp.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found'
        });
      }

      // Merge metadata
      const currentMetadata = currentOpp.rows[0].metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...otherFields,
      };
      
      const query = `
        UPDATE opportunities SET
          name = COALESCE($1, name),
          account_id = COALESCE($2, account_id),
          contact_id = COALESCE($3, contact_id),
          amount = COALESCE($4, amount),
          stage = COALESCE($5, stage),
          probability = COALESCE($6, probability),
          close_date = COALESCE($7, close_date),
          metadata = $8,
          updated_at = NOW()
        WHERE id = $9
        RETURNING *
      `;
      
      const values = [
        name,
        account_id,
        contact_id,
        amount,
        stage,
        probability,
        close_date,
        updatedMetadata,
        id
      ];
      
      const result = await pgPool.query(query, values);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found'
        });
      }
      
      const updatedOpportunity = expandMetadata(result.rows[0]);
      
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
