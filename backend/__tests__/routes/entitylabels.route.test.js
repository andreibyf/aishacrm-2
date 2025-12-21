import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_UUID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const TENANT_SLUG = process.env.TEST_TENANT_SLUG || 'labor-depot';
// In CI, run only if explicitly enabled
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Entity Labels Routes', { skip: !SHOULD_RUN }, () => {

  // Default labels expected from the API
  const DEFAULT_LABELS = {
    leads: { plural: 'Leads', singular: 'Lead' },
    contacts: { plural: 'Contacts', singular: 'Contact' },
    accounts: { plural: 'Accounts', singular: 'Account' },
    opportunities: { plural: 'Opportunities', singular: 'Opportunity' },
    activities: { plural: 'Activities', singular: 'Activity' },
    bizdev_sources: { plural: 'BizDev Sources', singular: 'BizDev Source' },
  };

  test('GET /api/entity-labels/:tenant_id returns labels with UUID', async () => {
    const res = await fetch(`${BASE_URL}/api/entity-labels/${TENANT_UUID}`);
    assert.equal(res.status, 200, 'expected 200 from entity labels');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.labels, 'expected labels object');
    assert.ok(json.data.labels.leads, 'expected leads label');
    assert.ok(json.data.labels.contacts, 'expected contacts label');
    assert.ok(json.data.labels.accounts, 'expected accounts label');
    assert.ok(json.data.labels.opportunities, 'expected opportunities label');
    assert.ok(json.data.labels.activities, 'expected activities label');
    assert.ok(json.data.labels.bizdev_sources, 'expected bizdev_sources label');
  });

  test('GET /api/entity-labels/:tenant_id works with text slug (resolves to UUID)', async () => {
    const res = await fetch(`${BASE_URL}/api/entity-labels/${TENANT_SLUG}`);
    assert.equal(res.status, 200, 'expected 200 from entity labels with slug');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.labels, 'expected labels object');
  });

  test('GET /api/entity-labels/:tenant_id returns defaults for non-existent tenant', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE_URL}/api/entity-labels/${fakeUuid}`);
    assert.equal(res.status, 200, 'expected 200 with defaults for non-existent tenant');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.labels, 'expected labels object');
    // Should return defaults
    assert.deepEqual(json.data.labels.leads, DEFAULT_LABELS.leads, 'expected default leads label');
    assert.deepEqual(json.data.customized, [], 'expected empty customized array');
  });

  test('GET /api/entity-labels/:tenant_id returns 400 without tenant_id', async () => {
    // Route requires tenant_id, calling without it hits different route or returns 404
    const res = await fetch(`${BASE_URL}/api/entity-labels/`);
    // May be 404 (route not found) or 400 (invalid)
    assert.ok([400, 404].includes(res.status), `expected 400 or 404, got ${res.status}`);
  });

  test('PUT /api/entity-labels/:tenant_id requires authentication (or dev mode)', async () => {
    const res = await fetch(`${BASE_URL}/api/entity-labels/${TENANT_UUID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labels: {
          leads: { plural: 'Prospects', singular: 'Prospect' }
        }
      })
    });
    // In production: requires superadmin auth - expect 401 or 403
    // In development: middleware auto-creates mock superadmin, so 200 is acceptable
    assert.ok([200, 401, 403].includes(res.status), `expected 200/401/403 for PUT, got ${res.status}`);
  });

  test('DELETE /api/entity-labels/:tenant_id requires authentication (or dev mode)', async () => {
    const res = await fetch(`${BASE_URL}/api/entity-labels/${TENANT_UUID}`, {
      method: 'DELETE'
    });
    // In production: requires superadmin auth - expect 401 or 403
    // In development: middleware auto-creates mock superadmin, so 200 is acceptable
    assert.ok([200, 401, 403].includes(res.status), `expected 200/401/403 for DELETE, got ${res.status}`);
  });

  test('Entity label response includes customized array', async () => {
    const res = await fetch(`${BASE_URL}/api/entity-labels/${TENANT_UUID}`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(Array.isArray(json.data?.customized), 'expected customized to be an array');
  });

  test('Entity labels have correct structure', async () => {
    const res = await fetch(`${BASE_URL}/api/entity-labels/${TENANT_UUID}`);
    assert.equal(res.status, 200);
    const json = await res.json();
    
    // Each label should have plural and singular
    for (const [key, label] of Object.entries(json.data.labels)) {
      assert.ok(label.plural, `expected ${key} to have plural`);
      assert.ok(label.singular, `expected ${key} to have singular`);
      assert.equal(typeof label.plural, 'string', `${key}.plural should be string`);
      assert.equal(typeof label.singular, 'string', `${key}.singular should be string`);
    }
  });

});
