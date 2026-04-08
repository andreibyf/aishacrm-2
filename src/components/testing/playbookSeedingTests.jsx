import { assert } from './testUtils';
import { getBackendUrl } from '@/api/backendUrl';

const BACKEND_URL = getBackendUrl();

export const playbookSeedingTests = {
  name: 'Playbook Seeding',
  tests: [
    {
      name: 'Resolver endpoint reachable',
      fn: async () => {
        const resp = await fetch(`${BACKEND_URL}/api/testing/playbook-seeding`);
        assert.truthy(
          resp.ok,
          `GET /api/testing/playbook-seeding should be reachable (status ${resp.status})`,
        );
        const json = await resp.json();
        assert.equal(json.status, 'success', 'Response status should be success');
        assert.truthy(
          json.data && Array.isArray(json.data.results),
          'data.results should be an array',
        );
      },
    },
    {
      name: 'All real-estate variants resolve to playbooks',
      fn: async () => {
        const resp = await fetch(`${BACKEND_URL}/api/testing/playbook-seeding`);
        assert.truthy(
          resp.ok,
          `GET /api/testing/playbook-seeding should succeed (status ${resp.status})`,
        );
        const json = await resp.json();
        assert.truthy(
          json.data.allPass,
          json.summary || 'Some real-estate industry variants returned 0 playbooks',
        );
        for (const r of json.data.results) {
          assert.truthy(r.ok, `Variant "${r.industry}" resolved to 0 playbooks`);
          assert.truthy(r.count > 0, `Variant "${r.industry}" count should be > 0, got ${r.count}`);
        }
      },
    },
    {
      name: 'Canonical key resolves correctly',
      fn: async () => {
        const industry = 'real_estate_and_property_management';
        const resp = await fetch(
          `${BACKEND_URL}/api/testing/playbook-seeding?industry=${encodeURIComponent(industry)}`,
        );
        assert.truthy(resp.ok, `Endpoint should respond (status ${resp.status})`);
        const json = await resp.json();
        assert.equal(json.status, 'success', 'Status should be success');
        assert.truthy(
          json.data.count >= 1,
          `Expected at least 1 playbook for "${industry}", got ${json.data.count}`,
        );
      },
    },
    {
      name: 'Ampersand variant "Real Estate & Property Management" resolves correctly',
      fn: async () => {
        const industry = 'Real Estate & Property Management';
        const resp = await fetch(
          `${BACKEND_URL}/api/testing/playbook-seeding?industry=${encodeURIComponent(industry)}`,
        );
        assert.truthy(resp.ok, `Endpoint should respond (status ${resp.status})`);
        const json = await resp.json();
        assert.equal(json.status, 'success', 'Status should be success');
        assert.truthy(
          json.data.count >= 1,
          `Expected at least 1 playbook for "${industry}", got ${json.data.count}. The & normalization fix may not be deployed.`,
        );
      },
    },
    {
      name: 'Shorthand "Real Estate & Property Mgmt" resolves correctly',
      fn: async () => {
        const industry = 'Real Estate & Property Mgmt';
        const resp = await fetch(
          `${BACKEND_URL}/api/testing/playbook-seeding?industry=${encodeURIComponent(industry)}`,
        );
        assert.truthy(resp.ok, `Endpoint should respond (status ${resp.status})`);
        const json = await resp.json();
        assert.equal(json.status, 'success', 'Status should be success');
        assert.truthy(
          json.data.count >= 1,
          `Expected at least 1 playbook for "${industry}", got ${json.data.count}`,
        );
      },
    },
    {
      name: 'Unrelated industry returns no real-estate playbooks',
      fn: async () => {
        const industry = 'technology';
        const resp = await fetch(
          `${BACKEND_URL}/api/testing/playbook-seeding?industry=${encodeURIComponent(industry)}`,
        );
        assert.truthy(resp.ok, `Endpoint should respond (status ${resp.status})`);
        const json = await resp.json();
        assert.equal(json.status, 'success', 'Status should be success');
        // technology industry should return 0 (no playbooks defined for it)
        assert.equal(
          json.data.count,
          0,
          `Industry "technology" should return 0 playbooks, got ${json.data.count}`,
        );
      },
    },
  ],
};
