/**
 * AI Tools Routes
 * Tool execution and Braid integration endpoints
 */

import express from 'express';
import logger from '../../lib/logger.js';
import { executeBraidTool, generateToolSchemas } from '../../lib/braidIntegration-v2.js';
import { resolveCanonicalTenant } from '../../lib/tenantCanonicalResolver.js';
import { getTenantIdFromRequest } from '../../lib/aiEngine/index.js';
import { getSupabaseClient } from '../../lib/supabase-db.js';
import { runTask } from '../../lib/aiBrain.js';

export default function createToolsRoutes(_pgPool) {
  const router = express.Router();

  // AI Brain test endpoint
  router.post('/brain-test', async (req, res) => {
    const startedAt = Date.now();
    try {
      const expectedKey = process.env.INTERNAL_AI_TEST_KEY;
      if (!expectedKey) {
        logger.error('[AI Brain Test] INTERNAL_AI_TEST_KEY is not configured');
        return res.status(500).json({
          status: 'error',
          message: 'INTERNAL_AI_TEST_KEY is not configured on server',
        });
      }

      const providedKey = req.get('X-Internal-AI-Key');
      if (providedKey !== expectedKey) {
        logger.warn('[AI Brain Test] Invalid or missing X-Internal-AI-Key header');
        return res.status(401).json({
          status: 'error',
          message: 'Valid X-Internal-AI-Key header is required',
        });
      }

      const { tenant_id, user_id, task_type, context, mode } = req.body;
      
      if (!tenant_id || !task_type) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id and task_type are required',
        });
      }

      const result = await runTask({
        tenantId: tenant_id,
        userId: user_id || 'brain-test-user',
        taskType: task_type,
        context: context || {},
        mode: mode || 'read_only'
      });

      res.json({
        status: 'success',
        result,
        durationMs: Date.now() - startedAt
      });

    } catch (error) {
      logger.error('[AI Brain Test] Error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Brain test execution failed',
        durationMs: Date.now() - startedAt
      });
    }
  });

  // Snapshot endpoint for AI context
  router.get('/snapshot-internal', async (req, res) => {
    try {
      const tenantIdentifier = getTenantIdFromRequest(req) || req.query.tenant_id;
      
      if (!tenantIdentifier) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const tenantRecord = await resolveCanonicalTenant(tenantIdentifier);
      if (!tenantRecord?.found) {
        return res.status(404).json({
          status: 'error',
          message: 'Tenant not found'
        });
      }

      const supa = getSupabaseClient();
      
      // Get basic CRM data snapshot
      const [leadsResult, contactsResult, accountsResult, opportunitiesResult] = await Promise.all([
        supa.from('leads').select('id, name, status, created_date').eq('tenant_id', tenantRecord.uuid).limit(10),
        supa.from('contacts').select('id, name, email, created_date').eq('tenant_id', tenantRecord.uuid).limit(10),
        supa.from('accounts').select('id, name, industry, created_date').eq('tenant_id', tenantRecord.uuid).limit(10),
        supa.from('opportunities').select('id, title, stage, value, created_date').eq('tenant_id', tenantRecord.uuid).limit(10)
      ]);

      res.json({
        status: 'success',
        data: {
          tenant: {
            id: tenantRecord.uuid,
            slug: tenantRecord.slug,
            name: tenantRecord.name
          },
          leads: leadsResult.data || [],
          contacts: contactsResult.data || [],
          accounts: accountsResult.data || [],
          opportunities: opportunitiesResult.data || [],
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('[AI Snapshot] Error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to generate snapshot'
      });
    }
  });

  // Realtime tools execution
  router.post('/realtime-tools/execute', async (req, res) => {
    try {
      const { tool_name, arguments: toolArgs, tenant_id } = req.body;
      
      // Block destructive operations in realtime mode
      const BLOCKED_REALTIME_TOOLS = [
        'delete_account', 'delete_lead', 'delete_contact', 'delete_opportunity',
        'delete_activity', 'delete_note', 'delete_task', 'delete_document',
        'bulk_delete', 'archive_all', 'reset_data', 'drop_table', 'truncate',
        'execute_sql', 'run_migration', 'delete_tenant', 'delete_user'
      ];
      
      if (BLOCKED_REALTIME_TOOLS.some(blocked => tool_name.toLowerCase().includes(blocked))) {
        return res.status(403).json({
          status: 'error',
          message: 'Destructive operations are not allowed in realtime mode',
          blocked_tool: tool_name
        });
      }

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const tenantRecord = await resolveCanonicalTenant(tenant_id);
      if (!tenantRecord?.found) {
        return res.status(404).json({
          status: 'error',
          message: 'Tenant not found'
        });
      }

      const result = await executeBraidTool(
        tool_name,
        toolArgs || {},
        tenantRecord,
        req.user?.id || 'realtime-user'
      );

      res.json({
        status: 'success',
        tool_name,
        result
      });

    } catch (error) {
      logger.error('[AI Realtime Tools] Error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Tool execution failed'
      });
    }
  });

  return router;
}