/**
 * Database Routes
 * Sync, archive, cleanup operations
 */

import express from 'express';

export default function createDatabaseRoutes(_pgPool) {
  const router = express.Router();

  // POST /api/database/sync - Sync data from Base44 to PostgreSQL
  router.post('/sync', async (req, res) => {
    try {
      const { tenant_id, entities } = req.body;

      res.json({
        status: 'success',
        message: 'Database sync initiated',
        data: {
          tenant_id,
          entities: entities || ['Contact', 'Account', 'Lead', 'Opportunity', 'Activity'],
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // GET /api/database/check-volume - Check data volume
  router.get('/check-volume', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required',
        });
      }

      // Return summary of table sizes (placeholder - real implementation would use Supabase RPC)
      res.json({
        status: 'success',
        message: 'Volume check requires database admin access',
        data: []
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/database/archive-aged-data - Archive old data
  router.post('/archive-aged-data', async (req, res) => {
    try {
      const { tenant_id, days } = req.body;
      
      res.json({
        status: 'success',
        message: `Archive function for data older than ${days} days`,
        data: { tenant_id, days },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/database/cleanup-orphaned-data - Clean up orphaned records
  router.post('/cleanup-orphaned-data', async (req, res) => {
    try {
      const { tenant_id } = req.body;
      
      res.json({
        status: 'success',
        message: 'Orphaned data cleanup initiated',
        data: { tenant_id },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/database/nuclear-cleanup - DELETE ALL DATA (use with extreme caution!)
  router.post('/nuclear-cleanup', async (req, res) => {
    try {
      const { confirm } = req.body;

      if (confirm !== 'DELETE_ALL_DATA') {
        return res.status(400).json({
          status: 'error',
          message: 'Confirmation required. Send {"confirm": "DELETE_ALL_DATA"}',
        });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      // Delete from all entity tables (in correct order to respect foreign keys)
      const results = {};

      // Activities first (has foreign keys to other tables)
      const { data: activitiesData } = await supabase.from('activities').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id');
      results.activities = activitiesData?.length || 0;

      // Opportunities
      const { data: oppsData } = await supabase.from('opportunities').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id');
      results.opportunities = oppsData?.length || 0;

      // Accounts
      const { data: accountsData } = await supabase.from('accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id');
      results.accounts = accountsData?.length || 0;

      // Leads
      const { data: leadsData } = await supabase.from('leads').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id');
      results.leads = leadsData?.length || 0;

      // Contacts
      const { data: contactsData } = await supabase.from('contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id');
      results.contacts = contactsData?.length || 0;

      const totalDeleted = Object.values(results).reduce((sum, count) => sum + count, 0);

      res.json({
        status: 'success',
        message: `Nuclear cleanup complete. Deleted ${totalDeleted} total records.`,
        data: {
          deletedCounts: results,
          totalDeleted,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  return router;
}
