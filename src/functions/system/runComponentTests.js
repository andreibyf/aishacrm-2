/**
 * runComponentTests
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

function msBucket(ms) {
  if (ms < 1200) return 'success';
  if (ms < 2000) return 'warning';
  return 'error';
}

Deno.serve(async (req) => {
  const started = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let payload = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const testNames = Array.isArray(payload?.testNames) ? payload.testNames : [];

    const reports = [];
    const nowIso = new Date().toISOString();

    // Helper to push an error for unknown tests (keeps UI informative)
    const pushUnknown = (name) => {
      reports.push({
        component_name: name,
        status: 'error',
        summary: 'The requested test does not exist or was not included in the available suites.',
        report_data: [{
          check: 'Test Runner',
          status: 'error',
          details: 'The requested test does not exist or was not included in the available suites.'
        }],
        test_date: nowIso
      });
    };

    // Implement: performanceSmoke
    const runPerformanceSmoke = async () => {
      const checks = [];
      const entities = ['Contact', 'Account', 'Lead', 'Opportunity', 'Activity'];

      for (const ent of entities) {
        const t0 = Date.now();
        let status = 'success';
        let details = '';
        try {
          // List a small, recent slice to avoid heavy loads
          // Note: not all SDKs accept limit; if not, it’s fine—it’ll still work.
          // Prefer list('-updated_date', 10) when supported.
          const result = await base44.entities[ent].list('-updated_date', 10);
          const took = Date.now() - t0;
          status = msBucket(took);
          details = `${ent}.list() returned ${Array.isArray(result) ? result.length : 0} in ${took}ms`;
          checks.push({ check: `${ent} list`, status, details });
        } catch (e) {
          const took = Date.now() - t0;
          status = 'error';
          details = `${ent}.list() failed after ${took}ms: ${e.message || String(e)}`;
          checks.push({ check: `${ent} list`, status, details });
        }
      }

      const overall =
        checks.every(c => c.status === 'success') ? 'success' :
        checks.some(c => c.status === 'error') ? 'error' : 'warning';

      reports.push({
        component_name: 'performanceSmoke',
        status: overall,
        summary: 'Timed core entity API latency and availability.',
        report_data: checks,
        test_date: nowIso
      });
    };

    // Implement: entitiesHealth (CRUD/RLS sanity: read-only)
    const runEntitiesHealth = async () => {
      const checks = [];
      const entities = ['Contact', 'Account', 'Lead', 'Opportunity', 'Activity'];

      for (const ent of entities) {
        try {
          const t0 = Date.now();
          const sample = await base44.entities[ent].list('-updated_date', 1);
          const took = Date.now() - t0;
          const ok = Array.isArray(sample);
          checks.push({
            check: `${ent} basic read`,
            status: ok ? 'success' : 'error',
            details: ok
              ? `${ent}.list() succeeded in ${took}ms`
              : `${ent}.list() did not return an array`
          });
        } catch (e) {
          checks.push({
            check: `${ent} basic read`,
            status: 'error',
            details: `${ent}.list() failed: ${e.message || String(e)}`
          });
        }
      }

      const overall = checks.some(c => c.status === 'error') ? 'error' : 'success';

      reports.push({
        component_name: 'entitiesHealth',
        status: overall,
        summary: 'Verified read access to core entities.',
        report_data: checks,
        test_date: nowIso
      });
    };

    // Supported tests
    const handlers = {
      performanceSmoke: runPerformanceSmoke,
      entitiesHealth: runEntitiesHealth
    };

    if (testNames.length === 0) {
      return Response.json({
        reports: [{
          component_name: 'Test Runner',
          status: 'error',
          summary: 'No test suites selected.',
          report_data: [{ check: 'Selection', status: 'error', details: 'Please select at least one test suite.' }],
          test_date: nowIso
        }],
        meta: { duration_ms: Date.now() - started }
      });
    }

    for (const name of testNames) {
      const fn = handlers[name];
      if (typeof fn === 'function') {
        await fn();
      } else {
        pushUnknown(name);
      }
    }

    return Response.json({ reports, meta: { duration_ms: Date.now() - started } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

----------------------------

export default runComponentTests;
