/**
 * Testing Routes
 * Test utilities and mocks
 */

import express from 'express';

export default function createTestingRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/testing/ping - Simple ping test
  router.get('/ping', async (req, res) => {
    try {
      res.json({
        status: 'success',
        data: { message: 'pong', timestamp: new Date().toISOString() },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/testing/suites - Get available test suites
  router.get('/suites', async (req, res) => {
    try {
      res.json({
        status: 'success',
        data: {
          suites: [
            { id: 'crud', name: 'CRUD Operations', description: 'Test create/read/update/delete operations' },
            { id: 'auth', name: 'Authentication Tests', description: 'Test user authentication flows' },
            { id: 'api', name: 'API Integration', description: 'Test external API integrations' },
            { id: 'validation', name: 'Data Validation', description: 'Test input validation and constraints' },
            { id: 'permissions', name: 'Permissions', description: 'Test role-based access control' },
            { id: 'performance', name: 'Performance Tests', description: 'Test response times and load handling' },
            { id: 'database', name: 'Database Operations', description: 'Test database queries and transactions' }
          ]
        }
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/testing/mock-data - Generate mock data
  router.post('/mock-data', async (req, res) => {
    try {
      const { entity_type, count = 10 } = req.body;

      res.json({
        status: 'success',
        message: 'Mock data generation not yet implemented',
        data: { entity_type, count },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/testing/run-playwright - Trigger GitHub Actions workflow to run E2E tests
  // Body: {
  //   suite: 'metrics' | 'rls' | 'rate-limit' | 'notifications' | 'tenant' | 'crud' | 'all',
  //   ref?: 'main',
  //   backend_url?: 'https://public-backend.example.com',  // Optional: override for public/Tailscale URLs
  //   frontend_url?: 'https://public-frontend.example.com' // Optional: override for public/Tailscale URLs
  // }
  router.post('/run-playwright', async (req, res) => {
    try {
      const {
        GITHUB_TOKEN,
        GITHUB_REPO_OWNER = process.env.GITHUB_REPOSITORY_OWNER || 'andreibyf',
        GITHUB_REPO_NAME = process.env.GITHUB_REPOSITORY_NAME || 'aishacrm-2',
        GITHUB_WORKFLOW_FILE = process.env.GITHUB_WORKFLOW_FILE || 'e2e.yml',
      } = process.env;

      if (!GITHUB_TOKEN) {
        return res.status(400).json({
          status: 'error',
          message: 'GITHUB_TOKEN is not configured in backend environment',
        });
      }

      const { suite = 'metrics', ref = 'main', backend_url, frontend_url } = req.body || {};

      // Normalize suite names coming from UI to workflow-expected ids
      const suiteMap = {
        'rls-enforcement': 'rls',
        'tenant-switching': 'tenant',
      };
      const normalizedSuite = suiteMap[suite] || suite;

      const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`;

      // Build workflow inputs - only include URL overrides if provided
  const inputs = { suite: normalizedSuite };
      if (backend_url) inputs.backend_url = String(backend_url);
      if (frontend_url) inputs.frontend_url = String(frontend_url);

      const ghRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref, inputs }),
      });

      if (!ghRes.ok) {
        const text = await ghRes.text().catch(() => '');
        return res.status(ghRes.status).json({
          status: 'error',
          message: `GitHub dispatch failed: ${ghRes.status} ${ghRes.statusText}`,
          details: text,
        });
      }

      const htmlUrl = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/workflows/${GITHUB_WORKFLOW_FILE}`;
      res.json({
        status: 'success',
        data: {
          suite: normalizedSuite,
          workflow: GITHUB_WORKFLOW_FILE,
          repo: `${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
          ref,
          inputs, // Include all inputs sent to workflow (suite, backend_url, frontend_url if present)
          html_url: htmlUrl,
          dispatched_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/testing/workflow-status - Get recent workflow runs with status
  // Query params: ref=main, per_page=5, created_after=ISO8601
  router.get('/workflow-status', async (req, res) => {
    try {
      const {
        GITHUB_TOKEN,
        GITHUB_REPO_OWNER = process.env.GITHUB_REPOSITORY_OWNER || 'andreibyf',
        GITHUB_REPO_NAME = process.env.GITHUB_REPOSITORY_NAME || 'aishacrm-2',
        GITHUB_WORKFLOW_FILE = process.env.GITHUB_WORKFLOW_FILE || 'e2e.yml',
      } = process.env;

      if (!GITHUB_TOKEN) {
        return res.status(400).json({ status: 'error', message: 'GITHUB_TOKEN is not configured in backend environment' });
      }

      const ref = req.query.ref || 'main';
      const perPage = Math.min(parseInt(req.query.per_page || '5', 10) || 5, 20);
      const createdAfter = req.query.created_after ? new Date(String(req.query.created_after)) : null;

      const listUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/workflows/${GITHUB_WORKFLOW_FILE}/runs?branch=${encodeURIComponent(ref)}&event=workflow_dispatch&per_page=${perPage}`;

      const ghRes = await fetch(listUrl, {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        }
      });

      if (!ghRes.ok) {
        const text = await ghRes.text().catch(() => '');
        return res.status(ghRes.status).json({ status: 'error', message: `GitHub runs fetch failed: ${ghRes.status} ${ghRes.statusText}`, details: text });
      }

      const data = await ghRes.json();
      let runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];

      if (createdAfter && !isNaN(createdAfter.getTime())) {
        runs = runs.filter(r => {
          const createdAt = new Date(r.created_at);
          return !isNaN(createdAt.getTime()) && createdAt >= createdAfter;
        });
      }

      // Sort by created_at descending (newest first)
      runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Map to consistent shape
      const mappedRuns = runs.map(run => ({
        id: run.id,
        status: run.status, // queued | in_progress | completed
        conclusion: run.conclusion, // success | failure | cancelled | null
        html_url: run.html_url,
        created_at: run.created_at,
        updated_at: run.updated_at,
        head_branch: run.head_branch,
        head_sha: run.head_sha,
        run_number: run.run_number,
      }));

      return res.json({
        status: 'success',
        data: {
          runs: mappedRuns,
          total: mappedRuns.length,
          latest: mappedRuns[0] || null,
        },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/testing/cleanup-test-data - Delete all records with is_test_data = true
  // Optional: also delete recent unflagged test data like example.com emails (contacts/leads)
  // Body: {
  //   tenant_id?: 'local-tenant-001',             // Optional: clean only specific tenant
  //   confirm?: true,                              // Required: safety confirmation
  //   unflagged_cleanup?: {                        // Optional: additional cleanup for legacy/unflagged data
  //     enabled?: boolean,                         // If true, will run extra passes
  //     window_days?: number                       // Only delete items created within this window (default 3)
  //   }
  // }
  router.post('/cleanup-test-data', async (req, res) => {
    try {
      const { tenant_id, confirm, unflagged_cleanup } = req.body || {};

      if (!confirm) {
        return res.status(400).json({
          status: 'error',
          message: 'Cleanup requires explicit confirmation',
          hint: 'Send { "confirm": true } in request body'
        });
      }

      // Tables that have is_test_data flag in metadata
      const tables = [
        'activities',
        'contacts',
        'leads',
        'accounts',
        'opportunities',
        'system_logs'
      ];

  const results = {};
  let totalDeleted = 0;

      for (const table of tables) {
        try {
          // Build DELETE query with metadata check
          let query = `
            DELETE FROM ${table}
            WHERE (metadata->>'is_test_data')::boolean = true
          `;
          const params = [];

          // Add tenant filter if specified
          if (tenant_id) {
            query += ` AND tenant_id = $1`;
            params.push(tenant_id);
          }

          query += ` RETURNING id`;

          const result = await _pgPool.query(query, params);
          const count = result.rowCount || 0;
          
          results[table] = {
            deleted: count,
            success: true
          };
          
          totalDeleted += count;
        } catch (error) {
          console.error(`Error cleaning ${table}:`, error);
          results[table] = {
            deleted: 0,
            success: false,
            error: error.message
          };
        }
      }

      // Optional follow-up: remove recent unflagged test data (example.com emails) for safety
      if (unflagged_cleanup?.enabled) {
        try {
          const windowDays = Math.max(1, Math.min(parseInt(unflagged_cleanup.window_days || '3', 10) || 3, 90));
          const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

          const { getSupabaseClient } = await import('../lib/supabase-db.js');
          const supabase = getSupabaseClient();

          // Contacts and leads typically have email columns; clean those by domain pattern
          const emailTables = ['contacts', 'leads'];
          for (const table of emailTables) {
            try {
              let q = supabase.from(table)
                .delete()
                .ilike('email', '%@example.com')
                .gte('created_at', cutoff)
                .select();
              if (tenant_id) q = q.eq('tenant_id', tenant_id);

              const { data, error } = await q;
              if (error) throw error;
              const count = Array.isArray(data) ? data.length : 0;
              results[`${table}_unflagged`] = { deleted: count, success: true, window_days: windowDays };
              totalDeleted += count;
            } catch (unflaggedErr) {
              console.error(`Unflagged cleanup error for ${table}:`, unflaggedErr);
              results[`${table}_unflagged`] = { deleted: 0, success: false, error: unflaggedErr.message };
            }
          }
        } catch (unflaggedBlockErr) {
          console.error('Unflagged cleanup block error:', unflaggedBlockErr);
          results['unflagged_cleanup'] = { success: false, error: unflaggedBlockErr.message };
        }
      }

      res.json({
        status: 'success',
        data: {
          total_deleted: totalDeleted,
          tenant_id: tenant_id || 'all',
          results,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Cleanup test data error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/testing/full-scan - Run comprehensive endpoint availability scan
  // Query params:
  //   tenant_id=<uuid or test placeholder>
  //   base_url=internal|http://override   (internal maps to docker service hostname backend:3001)
  //   expected_statuses=200,201,204        (comma-separated list; default OK statuses)
  // Returns: { status: 'success', data: { summary: { total, passed, failed, warn, avg_latency_ms, max_latency_ms }, results: [...] } }
  router.get('/full-scan', async (req, res) => {
    try {
      const tenantId = req.query.tenant_id || 'test-tenant-001';
      const explicitBase = req.query.base_url;
      let baseUrl = explicitBase || process.env.INTERNAL_BASE_URL || 'http://localhost:4001';
      if (baseUrl === 'internal') baseUrl = 'http://backend:3001';
      if (/localhost:4001$/i.test(baseUrl)) baseUrl = 'http://backend:3001';
      if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `http://${baseUrl}`;

      // Expected OK statuses (classification PASS); allow query override
      // Default: treat all 2xx as success
      const expectedStatusesParam = req.query.expected_statuses;
      let expectedStatuses = [];
      if (expectedStatusesParam) {
        expectedStatuses = String(expectedStatusesParam)
          .split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n));
      } else {
        // Default: all 2xx codes are PASS
        for (let i = 200; i < 300; i++) expectedStatuses.push(i);
      }

      // Optional health probe to validate reachability
      let probeOk = false;
      try {
        const probeResp = await fetch(`${baseUrl}/api/testing/ping`, { method: 'GET' });
        probeOk = probeResp.ok;
      } catch {
        // Leave probeOk false; will record as network failures later
      }

      // Define endpoints (method + path); {TENANT_ID} placeholder replaced
      const endpoints = [
        // Core health/system
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/health' },
        { method: 'GET', path: '/api/status' },
        { method: 'GET', path: '/api/system/status' },
        { method: 'GET', path: '/api/system/runtime' },
        { method: 'GET', path: `/api/system/logs?tenant_id={TENANT_ID}` },
        
        // Reports & Analytics
        { method: 'GET', path: `/api/reports/dashboard-stats?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/metrics/performance?tenant_id={TENANT_ID}` },
        
        // Core CRM Entities
        { method: 'GET', path: `/api/accounts?tenant_id={TENANT_ID}` },
        { method: 'POST', path: '/api/accounts', body: { tenant_id: tenantId, name: `Scan Account ${Date.now()}` } },
        { method: 'GET', path: `/api/contacts?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/leads?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/opportunities?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/activities?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/notes?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/clients?tenant_id={TENANT_ID}` },
        
        // Users & Employees
        { method: 'GET', path: `/api/users?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/employees?tenant_id={TENANT_ID}` },
        { method: 'GET', path: '/api/tenants' },
        
        // AI Features
        { method: 'GET', path: `/api/ai/assistants?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/aicampaigns?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/memory/search?tenant_id={TENANT_ID}&query=test` },
        
        // Workflows & Automation
        { method: 'GET', path: `/api/workflows?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/workflowexecutions?tenant_id={TENANT_ID}` },
        
        // Business Development
        { method: 'GET', path: `/api/bizdev?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/bizdevsources?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/cashflow?tenant_id={TENANT_ID}` },
        
        // Settings & Configuration
        { method: 'GET', path: `/api/permissions?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/modulesettings?tenant_id={TENANT_ID}` },
        { method: 'GET', path: '/api/systembrandings' },
        { method: 'GET', path: '/api/system-settings' },
        
        // Integrations
        { method: 'GET', path: `/api/integrations?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/tenantintegrations?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/synchealths?tenant_id={TENANT_ID}` },
        
        // Telephony
        { method: 'GET', path: `/api/telephony/status?tenant_id={TENANT_ID}` },
        { method: 'POST', path: '/api/telephony/test-webhook', body: { tenant_id: tenantId, test: true } },
        
        // Logging & Audit
        { method: 'GET', path: `/api/system-logs?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/audit-logs?tenant_id={TENANT_ID}` },
        
        // Storage & Documents
        { method: 'GET', path: '/api/storage/bucket' },
        { method: 'GET', path: `/api/documents?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/documentationfiles?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/documentation?tenant_id={TENANT_ID}` },
        
        // Notifications & Announcements
        { method: 'GET', path: `/api/notifications?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/announcements?tenant_id={TENANT_ID}` },
        
        // Security & Auth
        { method: 'GET', path: `/api/apikeys?tenant_id={TENANT_ID}` },
        { method: 'POST', path: '/api/auth/verify-token', body: { token: 'test' } },
        { method: 'GET', path: '/api/security/policies' },
        
        // Utilities & Tools
        { method: 'GET', path: '/api/testing/ping' },
        { method: 'GET', path: '/api/utils/health' },
        { method: 'GET', path: `/api/webhooks?tenant_id={TENANT_ID}` },
        { method: 'GET', path: '/api/cron/jobs' },
        { method: 'GET', path: `/api/validation/check-duplicate?tenant_id={TENANT_ID}&type=account&name=test` },
        
        // Billing (if enabled)
        { method: 'GET', path: `/api/billing/usage?tenant_id={TENANT_ID}` },
      ];

      const results = [];
      let passed = 0; let failed = 0; let warn = 0;
      let networkFailures = 0;
      let totalLatency = 0; let maxLatency = 0;

      // Throttle requests to prevent connection pool exhaustion
      // Process endpoints in batches with delay between batches
      const BATCH_SIZE = 5;
      const BATCH_DELAY_MS = 100; // 100ms delay between batches

      for (let i = 0; i < endpoints.length; i += BATCH_SIZE) {
        const batch = endpoints.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (ep) => {
          const fullPath = ep.path.replace('{TENANT_ID}', tenantId);
          const url = `${baseUrl}${fullPath}`;
          let statusCode = 0;
          const start = performance.now ? performance.now() : Date.now();
          try {
            const fetchOpts = { 
              method: ep.method, 
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(5000) // 5s timeout per request
            };
            if (ep.body) fetchOpts.body = JSON.stringify(ep.body);
            const resp = await fetch(url, fetchOpts);
            statusCode = resp.status;
          } catch (err) {
            // Check if timeout or network error
            statusCode = 0;
            if (err.name === 'AbortError' || err.name === 'TimeoutError') {
              console.warn(`[Full Scan] Timeout on ${ep.method} ${fullPath}`);
            }
          }
          const end = performance.now ? performance.now() : Date.now();
          const latencyMs = Math.round(end - start);

          let classification = 'FAIL';
          if (statusCode === 0) {
            classification = 'FAIL';
            networkFailures++;
            failed++;
          } else if (expectedStatuses.includes(statusCode)) {
            classification = 'PASS';
            passed++;
          } else if (statusCode >= 200 && statusCode < 600) {
            // Responsive but unexpected status (e.g., 404, 400, 500)
            classification = 'WARN';
            warn++;
          } else {
            classification = 'FAIL';
            failed++;
          }

          return {
            method: ep.method,
            path: fullPath,
            status: statusCode,
            classification,
            latency_ms: latencyMs,
            expected: expectedStatuses.includes(statusCode),
            network_failure: statusCode === 0
          };
        });

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Update latency stats
        for (const r of batchResults) {
          totalLatency += r.latency_ms;
          if (r.latency_ms > maxLatency) maxLatency = r.latency_ms;
        }

        // Delay before next batch (except for last batch)
        if (i + BATCH_SIZE < endpoints.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      res.json({
        status: 'success',
        data: {
          summary: {
            total: results.length,
            passed,
            warn,
            failed,
            network_failures: networkFailures,
            probe_ok: probeOk,
            avg_latency_ms: results.length ? Math.round(totalLatency / results.length) : 0,
            max_latency_ms: maxLatency,
            expected_statuses: expectedStatuses
          },
          tenant_id: tenantId,
          base_url: baseUrl,
          results,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Full scan error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
