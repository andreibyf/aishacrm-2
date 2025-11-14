/**
 * System Routes
 * Health checks, diagnostics, logs, monitoring
 */

import express from 'express';

export default function createSystemRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/system/status - System status check
  router.get('/status', async (req, res) => {
    try {
      let dbStatus = 'disconnected';
      try {
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();
        // Lightweight connectivity check
        const { error } = await supabase
          .from('system_logs')
          .select('id', { count: 'exact', head: true })
          .limit(1);
        if (error) {
          dbStatus = 'error: ' + error.message;
        } else {
          dbStatus = 'connected';
        }
      } catch (err) {
        dbStatus = 'error: ' + err.message;
      }

      res.json({
        status: 'success',
        data: {
          server: 'running',
          database: dbStatus,
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          environment: process.env.NODE_ENV,
          node_version: process.version,
          uptime: process.uptime(),
        },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // GET /api/system/runtime - Runtime diagnostics (non-secret)
  router.get('/runtime', async (req, res) => {
    try {
      const locals = req.app?.locals || {};
      const usingSupabaseProd = process.env.USE_SUPABASE_PROD === 'true';
      const runtime = {
        node: {
          version: process.version,
          env: process.env.NODE_ENV,
          node_options: process.env.NODE_OPTIONS,
        },
        dns: {
          ipv4first_applied: !!locals.ipv4FirstApplied,
        },
        database: {
          configured: true,
          connection_type: 'supabase',
          using_supabase_prod: usingSupabaseProd,
          db_config_path: locals.dbConfigPath || (usingSupabaseProd ? 'supabase_discrete' : (process.env.DATABASE_URL ? 'database_url' : 'none')),
          database_url_present: Boolean(process.env.DATABASE_URL),
          supabase_host_present: Boolean(process.env.SUPABASE_DB_HOST),
          resolved_ipv4: locals.resolvedDbIPv4 || null,
        },
        timestamp: new Date().toISOString(),
      };

      res.json({ status: 'success', data: runtime });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/system/diagnostics - Run full diagnostics
  router.get('/diagnostics', async (req, res) => {
    try {
      const diagnostics = {
        timestamp: new Date().toISOString(),
        database: {
          configured: true,
          connected: false,
        },
        functions: {
          total: 197,
          categories: 26,
        },
        entities: {
          total: 47,
        },
      };
      try {
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();
        const { error } = await supabase
          .from('tenants')
          .select('id', { count: 'exact', head: true })
          .limit(1);
        diagnostics.database.connected = !error;
        if (error) diagnostics.database.error = error.message;
      } catch (err) {
        diagnostics.database.error = err.message;
      }

      res.json({
        status: 'success',
        data: diagnostics,
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // GET /api/system/logs - Get system logs
  router.get('/logs', async (req, res) => {
    try {
      const { tenant_id, limit = 100, level, source } = req.query;

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let query = supabase
        .from('system_logs')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      if (level && level !== 'all') {
        query = query.eq('level', level);
      }
      if (source && source !== 'all') {
        query = query.eq('source', source);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      res.json({ status: 'success', data });
    } catch (error) {
      console.error('Error fetching system logs:', error);
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/system/cleanup-orphans - Remove records with tenant_id IS NULL across entities
  // Safeguards:
  // - Does NOT touch users table (global superadmins/admins may be tenant-less by design)
  // - Deletes from employees and business entities only where tenant_id IS NULL
  // - Returns per-table counts
  router.post('/cleanup-orphans', async (req, res) => {
    try {
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      const tables = [
        'contacts',
        'leads',
        'accounts',
        'opportunities',
        'activities',
        'notes',
        'employees', // employees without tenant assignment are considered orphan records
      ];

      const summary = {};
      let totalDeleted = 0;

      for (const table of tables) {
        try {
          const { data, error } = await supabase
            .from(table)
            .delete()
            .is('tenant_id', null)
            .select('id');
          if (error) {
            summary[table] = { error: error.message };
            continue;
          }
          const count = Array.isArray(data) ? data.length : 0;
          summary[table] = { deleted: count };
          totalDeleted += count;
        } catch (e) {
          summary[table] = { error: e.message };
        }
      }

      return res.json({
        status: 'success',
        data: {
          total_deleted: totalDeleted,
          summary,
        },
        message: `Cleanup complete. Deleted ${totalDeleted} orphan record(s).`,
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
