import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';

export default function createOpportunityRoutes(_pgPool) {
  const router = express.Router();
  /**
   * @openapi
   * /api/opportunities:
   *   get:
   *     summary: List opportunities
   *     tags: [opportunities]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Opportunities list
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     opportunities:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                           tenant_id:
   *                             type: string
   *                             format: uuid
   *                           name:
   *                             type: string
   *                           account_id:
   *                             type: string
   *                             nullable: true
   *                           contact_id:
   *                             type: string
   *                             nullable: true
   *                           stage:
   *                             type: string
   *                             example: prospecting
   *                           amount:
   *                             type: number
   *                             format: float
   *                           probability:
   *                             type: integer
   *                             minimum: 0
   *                             maximum: 100
   *                           close_date:
   *                             type: string
   *                             format: date
   *                           created_at:
   *                             type: string
   *                             format: date-time
   *   post:
   *     summary: Create opportunity
   *     tags: [opportunities]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id]
   *           example:
   *             tenant_id: "550e8400-e29b-41d4-a716-446655440000"
   *             name: "Enterprise Software License"
   *             account_id: "acc_12345"
   *             stage: "prospecting"
   *             amount: 50000
   *             probability: 25
   *             close_date: "2025-12-31"
   *     responses:
   *       201:
   *         description: Opportunity created
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                     tenant_id:
   *                       type: string
   *                       format: uuid
   *                     name:
   *                       type: string
   *                     account_id:
   *                       type: string
   *                     stage:
   *                       type: string
   *                     amount:
   *                       type: number
   *                     probability:
   *                       type: integer
   *                     close_date:
   *                       type: string
   *                       format: date
   *                     created_at:
   *                       type: string
   *                       format: date-time
   */

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
      let { tenant_id } = req.query;
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error, count } = await supabase
        .from('opportunities')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .order('created_date', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);
      
      const opportunities = (data || []).map(expandMetadata);
      
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
          total: count || 0,
          limit,
          offset
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
  /**
   * @openapi
   * /api/opportunities/{id}:
   *   get:
   *     summary: Get opportunity by ID
   *     tags: [opportunities]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Opportunity details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   put:
   *     summary: Update opportunity
   *     tags: [opportunities]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Opportunity updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   delete:
   *     summary: Delete opportunity
   *     tags: [opportunities]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Opportunity deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let { tenant_id } = req.query || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found'
        });
      }
      if (error) throw new Error(error.message);

      // Disable caching for single record as well
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      const opportunity = expandMetadata(data);
      
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

      const combinedMetadata = {
        ...(metadata || {}),
        ...otherFields
      };

      const nowIso = new Date().toISOString();
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('opportunities')
        .insert([{
          tenant_id,
          name,
          account_id: account_id || null,
          contact_id: contact_id || null,
          amount: amount || 0,
          stage: stage || 'prospecting',
          probability: probability || 0,
          close_date: close_date || null,
          metadata: combinedMetadata,
          created_at: nowIso,
        }])
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      
      const opportunity = expandMetadata(data);
      
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
      let requestedTenantId = req.body?.tenant_id || req.query?.tenant_id || null;

      if (!requestedTenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required for update' });
      }
      
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data: before, error: fetchErr } = await supabase
        .from('opportunities')
        .select('id, tenant_id, stage, metadata')
        .eq('id', id)
        .eq('tenant_id', requestedTenantId)
        .single();
      if (fetchErr?.code === 'PGRST116') {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found'
        });
      }
      if (fetchErr) throw new Error(fetchErr.message);

      const currentMetadata = before?.metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...otherFields,
      };
      const normalizedStage = typeof stage === 'string' ? stage.toLowerCase() : null;
      
      const payload = { metadata: updatedMetadata, updated_at: new Date().toISOString() };
      if (name !== undefined) payload.name = name;
      if (account_id !== undefined) payload.account_id = account_id;
      if (contact_id !== undefined) payload.contact_id = contact_id;
      if (amount !== undefined) payload.amount = amount;
      if (normalizedStage !== null) payload.stage = normalizedStage;
      if (probability !== undefined) payload.probability = probability;
      if (close_date !== undefined) payload.close_date = close_date;

      const { data, error } = await supabase
        .from('opportunities')
        .update(payload)
        .eq('id', id)
        .eq('tenant_id', requestedTenantId)
        .select('*')
        .single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({
          status: 'error',
          message: 'Opportunity not found for tenant'
        });
      }
      if (error) throw new Error(error.message);

      if (normalizedStage !== null && data.stage !== normalizedStage) {
        console.warn('[Opportunities PUT] ⚠️  Stage mismatch', {
          expected: normalizedStage,
          persisted: data.stage,
          id: data.id
        });
      }

      const updatedOpportunity = expandMetadata(data);
      
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
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('opportunities')
        .delete()
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
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
