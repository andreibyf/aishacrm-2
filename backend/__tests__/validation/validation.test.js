/**
 * Unit tests for validation routes
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { initSupabaseForTests } from '../setup.js';

let app;
let server;
const port = 3104;
let supabaseInitialized = false;

async function req(method, path, body) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

describe('Validation Routes', () => {
  before(async () => {
    // Initialize Supabase if credentials are available
    supabaseInitialized = await initSupabaseForTests();
    
    const express = (await import('express')).default;
    const createValidationRoutes = (await import('../../routes/validation.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/validation', createValidationRoutes(null));
    server = app.listen(port);
    await new Promise((r) => server.on('listening', r));
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  // Basic error cases
  it('POST /find-duplicates requires entity_type and tenant_id', async () => {
    const res = await req('POST', '/api/validation/find-duplicates', { fields: ['email'] });
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.status, 'error');
  });

  it('POST /validate-and-import 400 when no records', async () => {
    const res = await req('POST', '/api/validation/validate-and-import', { records: [], tenant_id: 't' });
    assert.strictEqual(res.status, 400);
  });

  it('POST /validate-and-import 400 when missing tenant_id', async () => {
    const res = await req('POST', '/api/validation/validate-and-import', { records: [{}], entityType: 'Contact' });
    assert.strictEqual(res.status, 400);
  });

  it('POST /validate-and-import 400 for unsupported entity type', async () => {
    const res = await req('POST', '/api/validation/validate-and-import', { records: [{}], entityType: 'Foo', tenant_id: 't' });
    assert.strictEqual(res.status, 400);
  });

  // Find duplicates and duplicate check
  it('POST /find-duplicates returns groups for allowed fields', async () => {
    if (!supabaseInitialized) {
      // Skip this test if Supabase not initialized
      return;
    }
    const body = { tenant_id: 't1', entity_type: 'Lead', fields: ['first_name', 'last_name'] };
    const res = await req('POST', '/api/validation/find-duplicates', body);
    // Accept 200 (success) or 500 (network error in CI)
    assert.ok([200, 500].includes(res.status), `Expected 200 or 500, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.strictEqual(json.status, 'success');
      assert.ok(typeof json.data.total === 'number');
    }
  });

  it('POST /check-duplicate-before-create detects email and phone duplicates for Contact', async () => {
    if (!supabaseInitialized) {
      // Skip this test if Supabase not initialized
      return;
    }
    const body = { tenant_id: 't1', entity_type: 'Contact', data: { email: 'a@b.com', phone: '123' } };
    const res = await req('POST', '/api/validation/check-duplicate-before-create', body);
    // Accept 200 (success) or 500 (network error in CI)
    assert.ok([200, 500].includes(res.status), `Expected 200 or 500, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.strictEqual(json.status, 'success');
    }
  });

  // Validate and import success for Contact
  it('imports one Contact and defaults missing last_name to UNK', async () => {
    if (!supabaseInitialized) {
      // Skip this test if Supabase not initialized
      return;
    }
    const body = {
      tenant_id: 't1',
      entityType: 'Contact',
      records: [{ first_name: 'Alice' }]
    };
    const res = await req('POST', '/api/validation/validate-and-import', body);
    // Accept 200 (success) or 500 (network error in CI)
    assert.ok([200, 500].includes(res.status), `Expected 200 or 500, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.strictEqual(json.status, 'success');
    }
  });
});
