import express from 'express';

export default function createOpportunityRoutes(pgPool) {
  const router = express.Router();

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
      
      res.json({
        status: 'success',
        data: {
          opportunities: result.rows,
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
      
      res.json({
        status: 'success',
        data: result.rows[0]
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
      const opp = req.body;
      
      if (!opp.tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const query = `
        INSERT INTO opportunities (
          tenant_id, name, account_id, contact_id, amount, stage, 
          probability, close_date, metadata, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
        ) RETURNING *
      `;
      
      const values = [
        opp.tenant_id,
        opp.name,
        opp.account_id || null,
        opp.contact_id || null,
        opp.amount || 0,
        opp.stage || 'prospecting',
        opp.probability || 0,
        opp.close_date || null,
        opp.metadata || {}
      ];
      
      const result = await pgPool.query(query, values);
      
      res.status(201).json({
        status: 'success',
        data: result.rows[0]
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
      const opp = req.body;
      
      const query = `
        UPDATE opportunities SET
          name = COALESCE($1, name),
          account_id = COALESCE($2, account_id),
          amount = COALESCE($3, amount),
          stage = COALESCE($4, stage),
          probability = COALESCE($5, probability),
          close_date = COALESCE($6, close_date),
          description = COALESCE($7, description),
          assigned_to = COALESCE($8, assigned_to),
          updated_date = NOW()
        WHERE id = $9
        RETURNING *
      `;
      
      const values = [
        opp.name,
        opp.account_id,
        opp.amount,
        opp.stage,
        opp.probability,
        opp.close_date,
        opp.description,
        opp.assigned_to,
        id
      ];
      
      const result = await pgPool.query(query, values);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found'
        });
      }
      
      res.json({
        status: 'success',
        data: result.rows[0]
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
