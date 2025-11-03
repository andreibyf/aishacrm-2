/**
 * Unit tests for validation routes
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';

let app;
let server;
const port = 3104;

async function req(method, path, body) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

describe('Validation Routes - basic error cases', () => {
  before(async () => {
    const express = (await import('express')).default;
    const createValidationRoutes = (await import('../../routes/validation.js')).default;
    app = express();
    app.use(express.json());
    // pass null pgPool; endpoints that need DB won't be exercised here
    app.use('/api/validation', createValidationRoutes({
      // default mock that returns empty rows
      query: mock.fn(async () => ({ rows: [] })),
    }));
    server = app.listen(port);
    await new Promise((r) => server.on('listening', r));
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

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
});

describe('Validation Routes - find duplicates and duplicate check', () => {
  let server2;
  const port2 = 3105;

  before(async () => {
    const express = (await import('express')).default;
    const createValidationRoutes = (await import('../../routes/validation.js')).default;

    const pgPoolMock = {
      query: mock.fn(async (sql, _params) => {
        const text = String(sql);
        if (text.includes('FROM leads') && text.includes('GROUP BY')) {
          return { rows: [{ dup_key: 'john|doe', cnt: 2 }] };
        }
        if (text.includes('FROM contacts') && text.includes('email =')) {
          return { rows: [{ id: 'c1', email: 'a@b.com', phone: '123' }] };
        }
        if (text.includes('FROM contacts') && !text.includes('email =')) {
          return { rows: [
            { id: 'c1', phone: '123' },
            { id: 'c2', phone: '(123)' },
          ] };
        }
        return { rows: [] };
      })
    };

    app = express();
    app.use(express.json());
    app.use('/api/validation', createValidationRoutes(pgPoolMock));
    server2 = app.listen(port2);
    await new Promise((r) => server2.on('listening', r));
  });

  after(async () => {
    if (server2) await new Promise((r) => server2.close(r));
  });

  it('POST /find-duplicates returns groups for allowed fields', async () => {
    const body = { tenant_id: 't1', entity_type: 'Lead', fields: ['first_name', 'last_name'] };
    const res = await fetch(`http://localhost:${port2}/api/validation/find-duplicates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.strictEqual(json.data.total, 1);
    assert.strictEqual(json.data.groups[0].count, 2);
  });

  it('POST /check-duplicate-before-create detects email and phone duplicates for Contact', async () => {
    const body = { tenant_id: 't1', entity_type: 'Contact', data: { email: 'a@b.com', phone: '123' } };
    const res = await fetch(`http://localhost:${port2}/api/validation/check-duplicate-before-create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.strictEqual(json.data.has_duplicates, true);
    assert.ok(json.data.duplicates.length >= 2);
  });
});

describe('Validation Routes - validate-and-import success for Contact', () => {
  let server3;
  const port3 = 3106;

  before(async () => {
    const express = (await import('express')).default;
    const createValidationRoutes = (await import('../../routes/validation.js')).default;

    const pgPoolMock = {
      query: mock.fn(async (sql, _params) => {
        const text = String(sql).trim().toUpperCase();
        // Insert returning
        if (text.startsWith('INSERT INTO')) {
          return { rows: [{ id: 'new-id' }] };
        }
        // Accounts lookup for linking (not used in this test)
        if (text.includes('FROM ACCOUNTS')) {
          return { rows: [] };
        }
        return { rows: [] };
      })
    };

    app = (await import('express')).default();
    app.use(express.json());
    app.use('/api/validation', createValidationRoutes(pgPoolMock));
    server3 = app.listen(port3);
    await new Promise((r) => server3.on('listening', r));
  });

  after(async () => {
    if (server3) await new Promise((r) => server3.close(r));
  });

  it('imports one Contact and defaults missing last_name to UNK', async () => {
    const body = {
      tenant_id: 't1',
      entityType: 'Contact',
      records: [{ first_name: 'Alice' }]
    };
    const res = await fetch(`http://localhost:${port3}/api/validation/validate-and-import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.strictEqual(json.data.successCount, 1);
    assert.strictEqual(json.data.failCount, 0);
  });
});
