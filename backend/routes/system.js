/**
 * System Routes
 * Health checks, diagnostics, logs, monitoring
 */

import express from 'express';
import { getCacheStats } from '../lib/cacheMiddleware.js';

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
      } catch (_) {
        dbStatus = 'error: ' + _.message;
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

  // GET /api/system/health - Simple health check (lightweight, always fast)
  router.get('/health', (req, res) => {
    res.json({ status: 'success', data: { service: 'backend', healthy: true, timestamp: new Date().toISOString() } });
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
      } catch {
        diagnostics.database.error = 'An unknown error occurred during diagnostics.';
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

  // GET /api/system/containers-status - Report reachability of core docker services
  // NOTE: This does not inspect Docker directly; it performs HTTP probes to service DNS names.
  // For non-HTTP services (redis), uses the initialized memory client for a lightweight ping.
  router.get('/containers-status', async (req, res) => {
    const mcpNodeCandidates = [
      // Prefer Docker network names first (most reliable)
      'http://braid-mcp-node-server:8000/health',
      'http://braid-mcp-1:8000/health',
      'http://braid-mcp:8000/health',
      // Then any explicit override
      process.env.MCP_NODE_HEALTH_URL,
      // Host gateway only for local dev (backend running outside Docker)
      process.env.NODE_ENV === 'development' ? 'http://host.docker.internal:8000/health' : null,
    ].filter(Boolean);
    // Note: localhost:8000 removed to avoid false positives from other services

    const services = [
      // Internal Docker DNS names should target internal container ports
      { name: 'backend', url: 'http://backend:3001/health' },
      { name: 'frontend', url: 'http://frontend:3000/' },
      // Correct MCP server; try multiple candidates for portability
      { name: 'mcp-node', url: mcpNodeCandidates },
      { name: 'n8n', url: 'http://n8n:5678/' },
      { name: 'n8n-proxy', url: 'http://n8n-proxy:5679/' },
      { name: 'redis', url: null, type: 'tcp' }
    ];

    // Optionally include legacy MCP for debugging visibility
    if (process.env.SHOW_LEGACY_MCP === 'true') {
      services.splice(2, 0, { name: 'mcp-legacy', url: 'http://braid-mcp:8000/health' });
    }

    const results = [];
    const memoryClient = req.app?.locals?.memoryClient; // Established during server bootstrap
    for (const svc of services) {
      if (!svc.url) {
        // Implement a lightweight Redis probe using existing memory client if available
        if (svc.name === 'redis' && svc.type === 'tcp') {
          const start = performance.now ? performance.now() : Date.now();
          let reachable = false; let note = 'no_client';
          try {
            if (memoryClient) {
              // Try a PING if library supports it; otherwise rely on ready state
              if (typeof memoryClient.ping === 'function') {
                const pong = await Promise.race([
                  memoryClient.ping(),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 750))
                ]);
                if (pong) {
                  reachable = true;
                  note = 'pong';
                }
              } else if (memoryClient.isReady || memoryClient.status === 'ready') {
                reachable = true;
                note = 'ready_state';
              }
            }
          } catch (err) {
            note = `error:${err.message}`.substring(0,120);
          }
          const latencyMs = Math.round((performance.now ? performance.now() : Date.now()) - start);
          results.push({ name: svc.name, type: 'tcp', reachable, status_code: reachable ? 200 : 0, latency_ms: latencyMs, note });
          continue;
        }
        results.push({ name: svc.name, type: svc.type || 'http', reachable: false, status_code: null, note: 'probe_not_implemented' });
        continue;
      }
      const urls = Array.isArray(svc.url) ? svc.url : [svc.url];
      let usedUrl = urls[0];
      let statusCode = 0; let reachable = false; let latencyMs = 0; let attemptedUrls = [];
      // Probe all candidates in parallel and take the first successful response
      const withTimeout = (p, ms) => Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
      ]);
      const startAll = performance.now ? performance.now() : Date.now();
      try {
        const attempts = urls.map(url => (async () => {
          attemptedUrls.push(url);
          const t0 = performance.now ? performance.now() : Date.now();
          const resp = await withTimeout(fetch(url, { method: 'GET' }), 1500);
          const ok = resp.ok || (resp.status >= 200 && resp.status < 500);
          const dt = Math.round((performance.now ? performance.now() : Date.now()) - t0);
          if (!ok) throw new Error('bad_status_' + resp.status);
          // Additional validation: for MCP health endpoint, check response body
          if (svc.name === 'mcp-node' && url.includes('/health')) {
            try {
              const body = await resp.text();
              const data = JSON.parse(body);
              // MCP health should return status: "ok" or similar
              if (!data.status || (data.status !== 'ok' && data.status !== 'healthy')) {
                throw new Error('invalid_mcp_health_response');
              }
            } catch {
              // If not valid JSON or missing status, treat as unreachable
              throw new Error('mcp_health_parse_error');
            }
          }
          return { url, status: resp.status, dt };
        })());
        const first = await Promise.any(attempts);
        usedUrl = first.url;
        statusCode = first.status;
        latencyMs = first.dt;
        reachable = true;
      } catch {
        // All failed
        statusCode = 0;
        latencyMs = Math.round((performance.now ? performance.now() : Date.now()) - startAll);
        reachable = false;
      }
      results.push({ name: svc.name, url: usedUrl, reachable, status_code: statusCode, latency_ms: latencyMs, attempted: attemptedUrls.length });
    }

    res.json({ status: 'success', data: { services: results, timestamp: new Date().toISOString() } });
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
        } catch (err) {
          summary[table] = { error: err.message };
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

  // GET /api/system/cache-stats - Redis cache statistics
  router.get('/cache-stats', async (req, res) => {
    try {
      const stats = await getCacheStats();
      
      if (!stats) {
        return res.status(503).json({
          status: 'error',
          message: 'Cache unavailable'
        });
      }

      return res.status(200).json({
        status: 'success',
        data: stats
      });
    } catch (err) {
      console.error('[System] Cache stats error:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}

