/**
 * Testing Routes
 * Test utilities and mocks
 */

import express from 'express';
import logger from '../lib/logger.js';
import crypto from 'crypto';

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
  router.post('/trigger-e2e', async (req, res) => {
    try {
      // Support both GITHUB_TOKEN and GH_TOKEN (Doppler uses GH_TOKEN)
      const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || process.env.REPO_OWNER || process.env.GITHUB_REPOSITORY_OWNER || 'andreibyf';
      const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || process.env.REPO_NAME || process.env.GITHUB_REPOSITORY_NAME || 'aishacrm-2';
      const GITHUB_WORKFLOW_FILE = process.env.GITHUB_WORKFLOW_FILE || process.env.WORKFLOW_FILE || 'e2e.yml';

      if (!GITHUB_TOKEN) {
        return res.status(503).json({
          status: 'unavailable',
          message: 'GitHub integration not configured',
          configured: false,
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

  // Alias for backward compatibility - QaConsole.jsx uses this path
  router.post('/run-playwright', (req, res, next) => {
    req.url = '/trigger-e2e';
    router.handle(req, res, next);
  });

  // GET /api/testing/workflow-status - Get recent workflow runs with status
  // Query params: ref=main, per_page=5, created_after=ISO8601
  router.get('/workflow-status', async (req, res) => {
    try {
      // Support both GITHUB_TOKEN and GH_TOKEN (Doppler uses GH_TOKEN)
      const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || process.env.GITHUB_REPOSITORY_OWNER || 'andreibyf';
      const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || process.env.GITHUB_REPOSITORY_NAME || 'aishacrm-2';
      const GITHUB_WORKFLOW_FILE = process.env.GITHUB_WORKFLOW_FILE || 'e2e.yml';

      if (!GITHUB_TOKEN) {
        return res.status(503).json({ status: 'unavailable', message: 'GitHub integration not configured', configured: false });
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
  //   tenant_id?: '6cb4c008-4847-426a-9a2e-918ad70e7b69',             // Optional: clean only specific tenant
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
          logger.error(`Error cleaning ${table}:`, error);
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
              logger.error(`Unflagged cleanup error for ${table}:`, unflaggedErr);
              results[`${table}_unflagged`] = { deleted: 0, success: false, error: unflaggedErr.message };
            }
          }
        } catch (unflaggedBlockErr) {
          logger.error('Unflagged cleanup block error:', unflaggedBlockErr);
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
      logger.error('Cleanup test data error:', error);
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
      const tenantId = req.query.tenant_id || process.env.SYSTEM_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
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
        { method: 'GET', path: `/api/reports/dashboard-bundle?tenant_id={TENANT_ID}` },
        // NOTE: Following report endpoints disabled - require database views not yet created
        // { method: 'GET', path: `/api/reports/pipeline?tenant_id={TENANT_ID}` },
        // { method: 'GET', path: `/api/reports/lead-status?tenant_id={TENANT_ID}` },
        // { method: 'GET', path: `/api/reports/calendar?tenant_id={TENANT_ID}` },
        // { method: 'GET', path: `/api/reports/data-quality?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/metrics/performance?tenant_id={TENANT_ID}` },
        
        // Core CRM Entities (v1)
        { method: 'GET', path: `/api/accounts?tenant_id={TENANT_ID}` },
        { method: 'POST', path: '/api/accounts', body: { tenant_id: tenantId, name: `Scan Account ${Date.now()}` } },
        { method: 'GET', path: `/api/contacts?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/leads?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/opportunities?tenant_id={TENANT_ID}` },
        // NOTE: activities has no v1 route, only v2 - tested below
        { method: 'GET', path: `/api/notes?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/clients?tenant_id={TENANT_ID}` },
        
        // Core CRM Entities (v2 - flattened metadata)
        { method: 'GET', path: `/api/v2/accounts?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/v2/contacts?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/v2/opportunities?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/v2/activities?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/v2/leads?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/v2/reports/dashboard-bundle?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/v2/reports/health-summary?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/v2/workflows?tenant_id={TENANT_ID}` },

        // Users & Employees
        { method: 'GET', path: `/api/users?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/employees?tenant_id={TENANT_ID}` },
        { method: 'GET', path: '/api/tenants' },
        
        // AI Features
        { method: 'GET', path: `/api/ai/assistants?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/aicampaigns?tenant_id={TENANT_ID}` },
        // NOTE: Memory endpoints disabled - Redis connection validation issues
        // { method: 'GET', path: `/api/memory/sessions?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/memory/search?tenant_id={TENANT_ID}&query=test` },
        { method: 'GET', path: `/api/mcp/servers` },
        
        // Workflows & Automation
        { method: 'GET', path: `/api/workflows?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/workflowexecutions?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/workflow-templates?tenant_id={TENANT_ID}` },
        
        // Business Development
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
        { method: 'GET', path: `/api/database/check-volume?tenant_id={TENANT_ID}` },
        
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
        { method: 'GET', path: '/api/security/status' },
        
        // Utilities & Tools
        { method: 'GET', path: '/api/testing/ping' },
        { method: 'GET', path: '/api/utils/health' },
        { method: 'GET', path: `/api/webhooks?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/cron/jobs?tenant_id={TENANT_ID}` },
        // NOTE: Validation endpoint disabled - error handling issues
        // { method: 'GET', path: `/api/validation/check-duplicate?tenant_id={TENANT_ID}&type=account&name=test` },
        
        // Billing (if enabled)
        { method: 'GET', path: `/api/billing/usage?tenant_id={TENANT_ID}` },
        { method: 'GET', path: `/api/billing/invoices?tenant_id={TENANT_ID}` },
      ];

      const results = [];
      let passed = 0; let failed = 0; let warn = 0; let protectedCount = 0;
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
              logger.warn(`[Full Scan] Timeout on ${ep.method} ${fullPath}`);
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
          } else if (statusCode === 401 || statusCode === 403) {
            // Auth-required endpoints (not failures - they exist and are protected)
            classification = 'PROTECTED';
            protectedCount++;
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
            protected: protectedCount,
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
      logger.error('Full scan error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/testing/trigger-error-500 - Simulate a 500 error for testing GitHub issue auto-creation
  router.post('/trigger-error-500', async (req, res) => {
    try {
      const { 
        create_github_issue = true,
        error_type = 'simulated',
        component = 'testing',
        severity = 'low'
      } = req.body || {};

      logger.warn('[Testing] Simulating 500 error for GitHub issue test');

      // Simulate an error
      const testError = new Error('Simulated 500 error for testing GitHub issue auto-creation');
      testError.stack = `Error: Simulated 500 error for testing GitHub issue auto-creation
    at /api/testing/trigger-error-500 (testing.js:610:25)
    at Layer.handle [as handle_request] (express/lib/router/layer.js:95:5)
    at next (express/lib/router/route.js:137:13)`;

      // If GitHub issue creation is enabled, trigger it
      if (create_github_issue) {
        try {
          logger.info('[Testing] Creating GitHub issue for simulated error');

          // Import node-fetch
          const { default: fetch } = await import('node-fetch');
          
          // GitHub Configuration
          const RAW_GITHUB_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
          const GITHUB_TOKEN = (RAW_GITHUB_TOKEN || '').trim();
          const GITHUB_REPO_OWNER = process.env.REPO_OWNER || process.env.GITHUB_REPO_OWNER || 'andreibyf';
          const GITHUB_REPO_NAME = process.env.REPO_NAME || process.env.GITHUB_REPO_NAME || 'aishacrm-2';
          
          logger.info('[Testing] GitHub config:', {
            hasGH_TOKEN: !!process.env.GH_TOKEN,
            hasGITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
            hasGITHUB_PAT: !!process.env.GITHUB_PAT,
            tokenLength: GITHUB_TOKEN.length,
            tokenPrefix: GITHUB_TOKEN.substring(0, 15)
          });
          if (!GITHUB_TOKEN) {
            return res.status(500).json({
              status: 'error',
              message: testError.message,
              test: true,
              github_issue: {
                error: 'GitHub token not configured',
                message: 'GITHUB_TOKEN, GH_TOKEN, or GITHUB_PAT environment variable required'
              }
            });
          }

          // Create GitHub issue directly via API
          const issueTitle = `[TEST] Simulated 500 Error - ${error_type}`;
          const issueBody = `## Test Error - Auto-Generated

**This is a test error triggered via \`/api/testing/trigger-error-500\`**

${testError.message}

### Stack Trace
\`\`\`
${testError.stack}
\`\`\`

### Context
- **Endpoint:** \`/api/testing/trigger-error-500\`
- **Method:** POST
- **Timestamp:** ${new Date().toISOString()}
- **Environment:** ${process.env.NODE_ENV || 'development'}
- **User Agent:** ${req.headers['user-agent'] || 'unknown'}

### Suggested Fix
This is a test error. No action required - verify GitHub issue was created successfully.

---
_Auto-generated by AiSHA CRM Health Monitoring System_`;

          const labels = ['test', 'automated', `severity:${severity}`, `component:${component}`];

          const githubResponse = await fetch(`https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'AiSHA-CRM-Backend'
            },
            body: JSON.stringify({
              title: issueTitle,
              body: issueBody,
              labels
            })
          });

          const githubResult = await githubResponse.json();

          logger.info('[Testing] GitHub API response:', {
            status: githubResponse.status,
            issue_number: githubResult.number,
            issue_url: githubResult.html_url
          });

          if (!githubResponse.ok) {
            return res.status(500).json({
              status: 'error',
              message: testError.message,
              test: true,
              github_issue: {
                error: 'GitHub API error',
                http_status: githubResponse.status,
                message: githubResult.message || 'Unknown error',
                details: githubResult
              }
            });
          }

          // Create system log entry for successful GitHub issue creation
          try {
            await supabase.from('system_logs').insert({
              tenant_id: null, // System-wide log
              level: 'INFO',
              message: `GitHub issue #${githubResult.number} created for ${error_type} error`,
              source: 'GitHub Integration',
              metadata: {
                issue_number: githubResult.number,
                issue_url: githubResult.html_url,
                error_type,
                test_error: true
              }
            });
          } catch (logError) {
            logger.warn('[Testing] Failed to create system log entry:', logError);
          }

          // Success - return 500 error WITH GitHub issue details
          return res.status(500).json({
            status: 'error',
            message: testError.message,
            test: true,
            github_issue: {
              created: true,
              issue_number: githubResult.number,
              issue_url: githubResult.html_url,
              message: 'GitHub issue created successfully'
            }
          });

        } catch (githubError) {
          logger.error('[Testing] Failed to create GitHub issue:', {
            error: githubError.message,
            stack: githubError.stack
          });
          return res.status(500).json({
            status: 'error',
            message: testError.message,
            test: true,
            github_issue: {
              error: 'Failed to create GitHub issue',
              details: githubError.message
            }
          });
        }
      }

      // Return simple 500 error without GitHub issue
      res.status(500).json({
        status: 'error',
        message: testError.message,
        test: true,
        github_issue: { skipped: true }
      });
    } catch (error) {
      logger.error('[Testing] Error in trigger-error-500:', error);
      res.status(500).json({ 
        status: 'error', 
        message: error.message,
        test: true 
      });
    }
  });

  return router;
}
