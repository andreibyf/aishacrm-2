/**
 * AI Suggestions Routes - Phase 3 Autonomous Operations
 * 
 * Endpoints for managing AI-generated suggestions:
 * - GET /api/ai/suggestions - List pending suggestions
 * - GET /api/ai/suggestions/:id - Get a specific suggestion
 * - POST /api/ai/suggestions/:id/approve - Approve a suggestion
 * - POST /api/ai/suggestions/:id/reject - Reject a suggestion
 * - POST /api/ai/suggestions/:id/apply - Apply an approved suggestion
 * - POST /api/ai/suggestions/trigger - Manually trigger suggestion generation
 */

import express from 'express';
import { resolveCanonicalTenant } from '../lib/tenantCanonicalResolver.js';
import { triggerForTenant } from '../lib/aiTriggersWorker.js';
import { executeBraidTool } from '../lib/braidIntegration-v2.js';

export default function createSuggestionsRoutes(pgPool) {
  const router = express.Router();

  /**
   * @openapi
   * /api/ai/suggestions:
   *   get:
   *     summary: List pending AI suggestions
   *     tags: [ai]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *         required: true
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [pending, approved, rejected, applied, expired, all]
   *         default: pending
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         default: 50
   *     responses:
   *       200:
   *         description: List of suggestions
   */
  router.get('/', async (req, res) => {
    try {
      const { 
        tenant_id, 
        status = 'pending', 
        trigger_id,
        priority,
        record_type,
        limit = 50,
        offset = 0 
      } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // Resolve tenant UUID
      const resolved = await resolveCanonicalTenant(tenant_id);
      if (!resolved?.found || !resolved?.uuid) {
        return res.status(404).json({ status: 'error', message: 'Tenant not found' });
      }

      // Build simple query without complex CASE expressions
      // The Supabase adapter doesn't support complex SQL like CASE with subqueries
      let query = `
        SELECT *
        FROM ai_suggestions
        WHERE tenant_id = $1
      `;
      const params = [resolved.uuid];
      let paramIndex = 2;

      // Add status filter if not 'all'
      if (status !== 'all') {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      // Add optional filters
      if (trigger_id) {
        query += ` AND trigger_id = $${paramIndex}`;
        params.push(trigger_id);
        paramIndex++;
      }

      if (priority) {
        query += ` AND priority = $${paramIndex}`;
        params.push(priority);
        paramIndex++;
      }

      if (record_type) {
        query += ` AND record_type = $${paramIndex}`;
        params.push(record_type);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit, 10), parseInt(offset, 10));

      const result = await pgPool.query(query, params);

      // Get total count for pagination
      let countQuery = `SELECT COUNT(*) as total FROM ai_suggestions WHERE tenant_id = $1`;
      const countParams = [resolved.uuid];
      if (status !== 'all') {
        countQuery += ` AND status = $2`;
        countParams.push(status);
      }
      const countResult = await pgPool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0]?.total || 0, 10);

      res.json({
        status: 'success',
        data: {
          suggestions: result.rows,
          total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10)
        }
      });
    } catch (error) {
      console.error('[Suggestions] Error listing suggestions:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // ============================================================
  // IMPORTANT: Specific routes (/stats, /trigger, /metrics, /aggregate)
  // MUST be defined BEFORE /:id to avoid being matched by the catch-all
  // ============================================================

  /**
   * @openapi
   * /api/ai/suggestions/stats:
   *   get:
   *     summary: Get suggestion statistics for a tenant
   *     tags: [ai]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Suggestion statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const resolved = await resolveCanonicalTenant(tenant_id);
      if (!resolved?.found || !resolved?.uuid) {
        return res.status(404).json({ status: 'error', message: 'Tenant not found' });
      }

      const query = `
        SELECT 
          status,
          COUNT(*) as count,
          AVG(confidence) as avg_confidence
        FROM ai_suggestions
        WHERE tenant_id = $1
        GROUP BY status
      `;

      const result = await pgPool.query(query, [resolved.uuid]);

      const stats = {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        applied: 0,
        expired: 0,
        avg_confidence: 0,
      };

      for (const row of result.rows) {
        stats[row.status] = parseInt(row.count, 10);
        stats.total += parseInt(row.count, 10);
        if (row.status === 'applied' || row.status === 'approved') {
          stats.avg_confidence = parseFloat(row.avg_confidence || 0);
        }
      }

      res.json({
        status: 'success',
        data: { stats }
      });
    } catch (error) {
      console.error('[Suggestions] Error getting stats:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/ai/suggestions/trigger:
   *   post:
   *     summary: Manually trigger suggestion generation for a tenant
   *     tags: [ai]
   */
  router.post('/trigger', async (req, res) => {
    try {
      const { tenant_id } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const resolved = await resolveCanonicalTenant(tenant_id);
      if (!resolved?.found || !resolved?.uuid) {
        return res.status(404).json({ status: 'error', message: 'Tenant not found' });
      }

      console.log(`[Suggestions] Manual trigger requested for tenant ${resolved.slug}`);

      const result = await triggerForTenant(pgPool, resolved.uuid);

      res.json({
        status: 'success',
        data: result,
        message: `Trigger completed. ${result.triggers_detected} new triggers detected.`,
      });
    } catch (error) {
      console.error('[Suggestions] Error triggering suggestions:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/ai/suggestions/metrics:
   *   get:
   *     summary: Get aggregated suggestion metrics
   *     tags: [ai]
   */
  router.get('/metrics', async (req, res) => {
    try {
      const { tenant_id, bucket_size = 'day', days = 30 } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const resolved = await resolveCanonicalTenant(tenant_id);
      if (!resolved?.found || !resolved?.uuid) {
        return res.status(404).json({ status: 'error', message: 'Tenant not found' });
      }

      // Get historical metrics
      const metricsQuery = `
        SELECT 
          time_bucket,
          trigger_type,
          suggestions_generated,
          suggestions_approved,
          suggestions_rejected,
          suggestions_applied,
          avg_confidence,
          avg_feedback_rating,
          positive_outcomes,
          negative_outcomes,
          avg_review_time_minutes
        FROM ai_suggestion_metrics
        WHERE tenant_id = $1 
          AND bucket_size = $2
          AND time_bucket >= NOW() - ($3 || ' days')::INTERVAL
        ORDER BY time_bucket DESC, trigger_type
      `;

      const metricsResult = await pgPool.query(metricsQuery, [
        resolved.uuid, 
        bucket_size,
        parseInt(days, 10),
      ]);

      // Get summary stats
      const summaryQuery = `
        SELECT 
          trigger_type,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'applied') as applied,
          COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
          AVG(confidence) as avg_confidence,
          AVG(feedback_rating) FILTER (WHERE feedback_rating IS NOT NULL) as avg_rating,
          COUNT(*) FILTER (WHERE outcome_positive = true) as positive_outcomes,
          COUNT(*) FILTER (WHERE outcome_positive = false) as negative_outcomes
        FROM ai_suggestions
        WHERE tenant_id = $1
          AND created_at >= NOW() - ($2 || ' days')::INTERVAL
        GROUP BY trigger_type
      `;

      const summaryResult = await pgPool.query(summaryQuery, [
        resolved.uuid,
        parseInt(days, 10),
      ]);

      res.json({
        status: 'success',
        data: {
          timeseries: metricsResult.rows,
          summary: summaryResult.rows,
          period_days: parseInt(days, 10),
          bucket_size,
        },
      });
    } catch (error) {
      console.error('[Suggestions] Error getting metrics:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/ai/suggestions/aggregate:
   *   post:
   *     summary: Trigger metrics aggregation (internal/cron)
   *     tags: [ai]
   */
  router.post('/aggregate', async (req, res) => {
    try {
      const { tenant_id, bucket_size = 'day' } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const resolved = await resolveCanonicalTenant(tenant_id);
      if (!resolved?.found || !resolved?.uuid) {
        return res.status(404).json({ status: 'error', message: 'Tenant not found' });
      }

      // Call the aggregation function
      const result = await pgPool.query(
        'SELECT aggregate_ai_suggestion_metrics($1, $2) as rows_updated',
        [resolved.uuid, bucket_size]
      );

      console.log(`[Suggestions] Aggregated metrics for tenant ${resolved.slug}: ${result.rows[0].rows_updated} rows`);

      res.json({
        status: 'success',
        data: { rows_updated: result.rows[0].rows_updated },
        message: 'Metrics aggregated',
      });
    } catch (error) {
      console.error('[Suggestions] Error aggregating metrics:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/ai/suggestions/{id}:
   *   get:
   *     summary: Get a specific suggestion
   *     tags: [ai]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Suggestion details
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const resolved = await resolveCanonicalTenant(tenant_id);
      if (!resolved?.found || !resolved?.uuid) {
        return res.status(404).json({ status: 'error', message: 'Tenant not found' });
      }

      // Simple query without complex CASE expressions
      const query = `
        SELECT *
        FROM ai_suggestions
        WHERE id = $1 AND tenant_id = $2
      `;

      const result = await pgPool.query(query, [id, resolved.uuid]);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Suggestion not found' });
      }

      res.json({
        status: 'success',
        data: {
          suggestion: result.rows[0]
        }
      });
    } catch (error) {
      console.error('[Suggestions] Error getting suggestion:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/ai/suggestions/{id}/approve:
   *   post:
   *     summary: Approve a suggestion for application
   *     tags: [ai]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - tenant_id
   *             properties:
   *               tenant_id:
   *                 type: string
   *     responses:
   *       200:
   *         description: Suggestion approved
   */
  router.post('/:id/approve', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.body;
      const userId = req.user?.id || null;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const resolved = await resolveCanonicalTenant(tenant_id);
      if (!resolved?.found || !resolved?.uuid) {
        return res.status(404).json({ status: 'error', message: 'Tenant not found' });
      }

      // First check current status - Supabase wrapper doesn't support IN clause in UPDATE WHERE
      const checkQuery = `
        SELECT id, status FROM ai_suggestions 
        WHERE id = $1 AND tenant_id = $2
      `;
      const checkResult = await pgPool.query(checkQuery, [id, resolved.uuid]);
      
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Suggestion not found' 
        });
      }
      
      const currentStatus = checkResult.rows[0].status;
      if (currentStatus !== 'pending') {
        return res.status(400).json({ 
          status: 'error', 
          message: `Suggestion already processed with status: ${currentStatus}` 
        });
      }

      // Now update - Supabase wrapper only parses $N parameters, not literals
      const query = `
        UPDATE ai_suggestions
        SET status = $3, 
            reviewed_at = NOW(), 
            reviewed_by = $4,
            updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *
      `;

      const result = await pgPool.query(query, [id, resolved.uuid, 'approved', userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Suggestion not found or update failed' 
        });
      }

      console.log(`[Suggestions] Approved suggestion ${id} by user ${userId}`);

      res.json({
        status: 'success',
        data: result.rows[0],
        message: 'Suggestion approved. Use /apply to execute.',
      });
    } catch (error) {
      console.error('[Suggestions] Error approving suggestion:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/ai/suggestions/{id}/reject:
   *   post:
   *     summary: Reject a suggestion
   *     tags: [ai]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - tenant_id
   *             properties:
   *               tenant_id:
   *                 type: string
   *               reason:
   *                 type: string
   *     responses:
   *       200:
   *         description: Suggestion rejected
   */
  router.post('/:id/reject', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, reason } = req.body;
      const userId = req.user?.id || null;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const resolved = await resolveCanonicalTenant(tenant_id);
      if (!resolved?.found || !resolved?.uuid) {
        return res.status(404).json({ status: 'error', message: 'Tenant not found' });
      }

      // First check current status - Supabase wrapper doesn't support IN clause in UPDATE WHERE
      const checkQuery = `
        SELECT id, status FROM ai_suggestions 
        WHERE id = $1 AND tenant_id = $2
      `;
      const checkResult = await pgPool.query(checkQuery, [id, resolved.uuid]);
      
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Suggestion not found' 
        });
      }
      
      const currentStatus = checkResult.rows[0].status;
      if (currentStatus !== 'pending' && currentStatus !== 'approved') {
        return res.status(400).json({ 
          status: 'error', 
          message: `Suggestion already processed with status: ${currentStatus}` 
        });
      }

      // Now update - Supabase wrapper only parses $N parameters, not literals
      // So status must be passed as a parameter, not as 'rejected' literal
      const query = `
        UPDATE ai_suggestions
        SET status = $3, 
            reviewed_at = NOW(), 
            reviewed_by = $4,
            apply_result = $5,
            updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *
      `;

      const result = await pgPool.query(query, [
        id, 
        resolved.uuid, 
        'rejected',  // status as parameter
        userId,
        JSON.stringify({ rejection_reason: reason || 'User rejected' }),
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Suggestion not found or update failed' 
        });
      }

      console.log(`[Suggestions] Rejected suggestion ${id} by user ${userId}`);

      res.json({
        status: 'success',
        data: result.rows[0],
        message: 'Suggestion rejected.',
      })
    } catch (error) {
      console.error('[Suggestions] Error rejecting suggestion:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/ai/suggestions/{id}/apply:
   *   post:
   *     summary: Apply an approved suggestion (Safe Apply Engine)
   *     description: Executes the approved action via Braid tools with full audit logging
   *     tags: [ai]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - tenant_id
   *             properties:
   *               tenant_id:
   *                 type: string
   *     responses:
   *       200:
   *         description: Suggestion applied successfully
   */
  router.post('/:id/apply', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.body;
      const _userId = req.user?.id || null;
      const userEmail = req.user?.email || 'system';

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const resolved = await resolveCanonicalTenant(tenant_id);
      if (!resolved?.found || !resolved?.uuid) {
        return res.status(404).json({ status: 'error', message: 'Tenant not found' });
      }

      // Fetch the suggestion - Supabase wrapper requires $N for WHERE values
      const fetchQuery = `
        SELECT * FROM ai_suggestions
        WHERE id = $1 AND tenant_id = $2 AND status = $3
      `;
      const fetchResult = await pgPool.query(fetchQuery, [id, resolved.uuid, 'approved']);

      if (fetchResult.rows.length === 0) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Suggestion not found or not approved. Approve first before applying.' 
        });
      }

      const suggestion = fetchResult.rows[0];
      const action = suggestion.action;

      if (!action?.tool_name) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Suggestion has no valid action to apply' 
        });
      }

      // Safe Apply Engine - Execute the action via Braid
      console.log(`[Suggestions] Applying suggestion ${id}: ${action.tool_name}`, {
        user: userEmail,
        tenant: resolved.uuid,
        args: action.tool_args,
      });

      const tenantRecord = {
        id: resolved.uuid,
        tenant_id: resolved.slug,
        name: resolved.slug,
      };

      let applyResult;
      let applySuccess = false;

      try {
        applyResult = await executeBraidTool(
          action.tool_name,
          action.tool_args || {},
          tenantRecord,
          userEmail
        );

        // Check if result is an error
        if (applyResult?.tag === 'Err') {
          applySuccess = false;
          applyResult = { error: applyResult.error };
        } else {
          applySuccess = true;
          // Unwrap Ok result
          if (applyResult?.tag === 'Ok') {
            applyResult = applyResult.value;
          }
        }
      } catch (toolError) {
        applyResult = { error: toolError.message };
        applySuccess = false;
      }

      // Update suggestion with result
      const updateQuery = `
        UPDATE ai_suggestions
        SET status = $3,
            applied_at = NOW(),
            apply_result = $4,
            updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *
      `;

      const updateResult = await pgPool.query(updateQuery, [
        id,
        resolved.uuid,
        applySuccess ? 'applied' : 'approved', // Revert to approved if failed
        JSON.stringify({
          success: applySuccess,
          result: applyResult,
          applied_by: userEmail,
          applied_at: new Date().toISOString(),
        }),
      ]);

      if (applySuccess) {
        console.log(`[Suggestions] Successfully applied suggestion ${id}`);
        res.json({
          status: 'success',
          data: updateResult.rows[0],
          result: applyResult,
          message: 'Suggestion applied successfully.',
        });
      } else {
        console.error(`[Suggestions] Failed to apply suggestion ${id}:`, applyResult);
        res.status(500).json({
          status: 'error',
          message: 'Failed to apply suggestion',
          error: applyResult?.error || 'Unknown error',
          data: updateResult.rows[0],
        });
      }
    } catch (error) {
      console.error('[Suggestions] Error applying suggestion:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/ai/suggestions/{id}/feedback:
   *   post:
   *     summary: Submit feedback for a suggestion (telemetry)
   *     tags: [ai]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - tenant_id
   *             properties:
   *               tenant_id:
   *                 type: string
   *               rating:
   *                 type: integer
   *                 minimum: 1
   *                 maximum: 5
   *               comment:
   *                 type: string
   *               outcome_positive:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Feedback recorded
   */
  router.post('/:id/feedback', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, rating, comment, outcome_positive } = req.body;
      const userId = req.user?.id || null;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const resolved = await resolveCanonicalTenant(tenant_id);
      if (!resolved?.found || !resolved?.uuid) {
        return res.status(404).json({ status: 'error', message: 'Tenant not found' });
      }

      // Update the suggestion with feedback
      const updateQuery = `
        UPDATE ai_suggestions
        SET 
          feedback_rating = COALESCE($3, feedback_rating),
          feedback_comment = COALESCE($4, feedback_comment),
          outcome_positive = COALESCE($5, outcome_positive),
          outcome_tracked = TRUE,
          outcome_measured_at = CASE WHEN $5 IS NOT NULL THEN NOW() ELSE outcome_measured_at END,
          updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *
      `;

      const updateResult = await pgPool.query(updateQuery, [
        id, 
        resolved.uuid, 
        rating || null,
        comment || null,
        outcome_positive ?? null,
      ]);

      if (updateResult.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Suggestion not found' });
      }

      // Also insert into feedback events table for detailed tracking
      const feedbackType = rating ? 'rating' : (outcome_positive !== undefined ? 'outcome' : 'comment');
      
      await pgPool.query(`
        INSERT INTO ai_suggestion_feedback 
          (tenant_id, suggestion_id, feedback_type, rating, comment, outcome_positive, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        resolved.uuid,
        id,
        feedbackType,
        rating || null,
        comment || null,
        outcome_positive ?? null,
        userId,
      ]);

      console.log(`[Suggestions] Feedback recorded for ${id}: rating=${rating}, outcome=${outcome_positive}`);

      res.json({
        status: 'success',
        data: updateResult.rows[0],
        message: 'Feedback recorded',
      });
    } catch (error) {
      console.error('[Suggestions] Error recording feedback:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
