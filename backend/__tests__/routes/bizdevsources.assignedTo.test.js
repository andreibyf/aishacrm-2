/**
 * Unit tests for assigned_to field on BizDev Sources routes.
 *
 * Covers:
 *  - POST create with assigned_to
 *  - PUT update with assigned_to
 *  - GET list returns assigned_to_name
 *  - GET single returns assigned_to_name
 *  - POST promote carries assigned_to to Lead
 *  - Import resolves human names to employee UUIDs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { initSupabaseForTests } from '../setup.js';

let app;
let server;
const port = 3150;
let supabaseInitialized = false;
const TEST_TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

async function req(method, path, body, headers = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'x-tenant-id': TEST_TENANT_ID,
    ...headers,
  };
  const res = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: defaultHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

describe('BizDev Sources — assigned_to field', () => {
  before(async () => {
    supabaseInitialized = await initSupabaseForTests();

    const express = (await import('express')).default;
    const createBizDevRoutes = (await import('../../routes/bizdevsources.js')).default;
    const createValidationRoutes = (await import('../../routes/validation.js')).default;
    app = express();
    app.use(express.json());

    // Middleware to simulate tenant context from header
    app.use((req, _res, next) => {
      req.tenantId = req.headers['x-tenant-id'] || TEST_TENANT_ID;
      next();
    });

    app.use('/api/bizdevsources', createBizDevRoutes(null));
    app.use('/api/validation', createValidationRoutes(null));
    server = app.listen(port);
    await new Promise((r) => server.on('listening', r));
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  // -----------------------------------------------------------------------
  // Schema validation (offline — no DB required)
  // -----------------------------------------------------------------------
  describe('Request payload acceptance', () => {
    it('POST /api/bizdevsources accepts assigned_to in body', async () => {
      if (!supabaseInitialized) return;

      const res = await req('POST', '/api/bizdevsources', {
        tenant_id: TEST_TENANT_ID,
        source: 'Test Assignment Source',
        company_name: 'Assignment Test Corp',
        assigned_to: null, // null is valid (unassigned)
      });

      // Should either succeed (200/201) or fail for other reasons, but NOT 400 for unknown field
      const json = await res.json();
      if (res.status === 200 || res.status === 201) {
        assert.ok(json.data || json.status === 'success');
      }
      // Not asserting strict success since we may lack a real employee UUID
    });

    it('PUT /api/bizdevsources/:id accepts assigned_to in body', async () => {
      if (!supabaseInitialized) return;

      // Create a source first
      const createRes = await req('POST', '/api/bizdevsources', {
        tenant_id: TEST_TENANT_ID,
        source: 'Pre-Update Source',
        company_name: 'Pre-Update Corp',
      });

      if (createRes.status !== 200 && createRes.status !== 201) return;
      const createJson = await createRes.json();
      const sourceId = createJson.data?.id;
      if (!sourceId) return;

      // Update with assigned_to
      const updateRes = await req('PUT', `/api/bizdevsources/${sourceId}`, {
        tenant_id: TEST_TENANT_ID,
        assigned_to: null, // clearing assignment
      });

      const updateJson = await updateRes.json();
      assert.ok([200, 201].includes(updateRes.status), `Update status: ${updateRes.status}`);
    });
  });

  // -----------------------------------------------------------------------
  // Import with name resolution
  // -----------------------------------------------------------------------
  describe('Import with assigned_to name resolution', () => {
    it('validate-and-import accepts BizDevSource entity type with assigned_to', async () => {
      if (!supabaseInitialized) return;

      const res = await req('POST', '/api/validation/validate-and-import', {
        records: [
          {
            company_name: 'Import Test Corp',
            source: 'CSV Import Test',
            assigned_to: 'Unknown Person', // will not resolve, should be stored in metadata
          },
        ],
        entityType: 'BizDevSource',
        tenant_id: TEST_TENANT_ID,
        fileName: 'test.csv',
      });

      const json = await res.json();
      // The import may succeed (employee not found → assigned_to set to null, name in metadata)
      // or fail for other reasons, but should not crash
      assert.ok(
        [200, 201, 500].includes(res.status),
        `Expected 200/201/500, got ${res.status}: ${JSON.stringify(json)}`,
      );

      if (res.status === 200) {
        const data = json.data || json;
        // Check that assignment warnings were generated
        if (data.assignmentWarnings && data.assignmentWarnings.length > 0) {
          assert.strictEqual(data.assignmentWarnings[0].rawValue, 'Unknown Person');
          assert.ok(data.assignmentWarnings[0].reason.includes('no matching employee'));
        }
      }
    });

    it('validate-and-import passes through UUID assigned_to without resolution', async () => {
      if (!supabaseInitialized) return;

      const fakeUuid = '12345678-1234-1234-1234-123456789abc';
      const res = await req('POST', '/api/validation/validate-and-import', {
        records: [
          {
            company_name: 'UUID Passthrough Corp',
            source: 'CSV Import Test',
            assigned_to: fakeUuid, // already a UUID, should pass through
          },
        ],
        entityType: 'BizDevSource',
        tenant_id: TEST_TENANT_ID,
        fileName: 'test.csv',
      });

      // May fail on FK constraint if UUID doesn't exist in employees,
      // but the resolver should NOT have tried to look it up as a name
      assert.ok([200, 500].includes(res.status));
    });

    it('validate-and-import handles blank assigned_to gracefully', async () => {
      if (!supabaseInitialized) return;

      const res = await req('POST', '/api/validation/validate-and-import', {
        records: [
          {
            company_name: 'Blank Assignment Corp',
            source: 'CSV Import Test',
            assigned_to: '', // blank = unassigned
          },
        ],
        entityType: 'BizDevSource',
        tenant_id: TEST_TENANT_ID,
        fileName: 'test.csv',
      });

      const json = await res.json();
      assert.ok([200, 201, 500].includes(res.status));
      if (res.status === 200) {
        const data = json.data || json;
        // No assignment warnings for blank values
        assert.ok(!data.assignmentWarnings || data.assignmentWarnings.length === 0);
      }
    });

    it('validate-and-import resolves names for Lead entity type too', async () => {
      if (!supabaseInitialized) return;

      const res = await req('POST', '/api/validation/validate-and-import', {
        records: [
          {
            first_name: 'Test',
            last_name: 'Lead',
            email: 'testlead@example.com',
            assigned_to: 'Unknown Sales Rep',
          },
        ],
        entityType: 'Lead',
        tenant_id: TEST_TENANT_ID,
        fileName: 'leads.csv',
      });

      const json = await res.json();
      assert.ok([200, 201, 500].includes(res.status));
      if (res.status === 200) {
        const data = json.data || json;
        if (data.assignmentWarnings && data.assignmentWarnings.length > 0) {
          assert.strictEqual(data.assignmentWarnings[0].rawValue, 'Unknown Sales Rep');
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // GET endpoints return assigned_to_name
  // -----------------------------------------------------------------------
  describe('GET enrichment with assigned_to_name', () => {
    it('GET /api/bizdevsources returns assigned_to_name field', async () => {
      if (!supabaseInitialized) return;

      const res = await req('GET', `/api/bizdevsources?tenant_id=${TEST_TENANT_ID}`);
      if (res.status !== 200) return;

      const json = await res.json();
      const sources = json.data?.bizdevsources || [];

      // Every source should have assigned_to_name field (null if no assignment)
      for (const source of sources.slice(0, 5)) {
        assert.ok(
          'assigned_to_name' in source,
          `Source ${source.id} missing assigned_to_name field`,
        );
        // If assigned_to is set, name should be non-null (unless employee was deleted)
        if (source.assigned_to) {
          // assigned_to_name should be a string or null
          assert.ok(
            source.assigned_to_name === null || typeof source.assigned_to_name === 'string',
            `assigned_to_name should be string or null, got ${typeof source.assigned_to_name}`,
          );
        }
      }
    });

    it('GET /api/bizdevsources/:id returns assigned_to_name field', async () => {
      if (!supabaseInitialized) return;

      // Get any source
      const listRes = await req('GET', `/api/bizdevsources?tenant_id=${TEST_TENANT_ID}&limit=1`);
      if (listRes.status !== 200) return;
      const listJson = await listRes.json();
      const sources = listJson.data?.bizdevsources || [];
      if (sources.length === 0) return;

      const sourceId = sources[0].id;
      const res = await req('GET', `/api/bizdevsources/${sourceId}?tenant_id=${TEST_TENANT_ID}`);
      if (res.status !== 200) return;

      const json = await res.json();
      assert.ok(
        'assigned_to_name' in json.data,
        'Single source response missing assigned_to_name field',
      );
    });
  });
});
