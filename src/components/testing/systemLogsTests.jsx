import { assert } from './testUtils';

const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
const TEST_TENANT_ID = 'unit-test-tenant';

// Generate a unique message for this run to find it reliably in listings
const uniqueSuffix = () => new Date().toISOString().replace(/[:.]/g, '-');

export const systemLogsTests = {
  name: 'System Logs',
  tests: [
    {
      name: 'API reachable',
      fn: async () => {
        const resp = await fetch(`${BACKEND_URL}/api/system-logs?tenant_id=${encodeURIComponent(TEST_TENANT_ID)}&limit=1`);
        assert.truthy(resp.ok, `GET /api/system-logs should be reachable (status ${resp.status})`);
        const json = await resp.json();
        assert.equal(json.status, 'success', 'Response status should be success');
        assert.truthy(json.data && Array.isArray(json.data['system-logs']), 'Response should include data["system-logs"] array');
      }
    },
    {
      name: 'Create system log (ERROR level)',
      fn: async () => {
        const payload = {
          tenant_id: TEST_TENANT_ID,
          level: 'ERROR',
          message: `Unit test error log ${uniqueSuffix()}`,
          source: 'UnitTests:SystemLogs',
          user_email: 'unit@test.local',
          metadata: { context: 'systemLogsTests', run_id: uniqueSuffix(), severity: 'error' }
        };

        const resp = await fetch(`${BACKEND_URL}/api/system-logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        assert.truthy(resp.ok, `POST /api/system-logs should succeed (status ${resp.status})`);
        const json = await resp.json();
        assert.equal(json.status, 'success', 'Response status should be success');
        assert.exists(json.data, 'Created log should be returned');
        assert.exists(json.data.id, 'Created log should have id');
        assert.equal(json.data.level, 'ERROR', 'Level should be ERROR');
        assert.equal(json.data.source, payload.source, 'Source should match');

        // Save id and message for subsequent tests
        window.__test_log_id = json.data.id;
        window.__test_log_message = json.data.message;
      }
    },
    {
      name: 'List logs for tenant includes created log',
      fn: async () => {
        const resp = await fetch(`${BACKEND_URL}/api/system-logs?tenant_id=${encodeURIComponent(TEST_TENANT_ID)}&limit=50`);
        assert.truthy(resp.ok, `GET /api/system-logs should succeed (status ${resp.status})`);
        const json = await resp.json();
        assert.equal(json.status, 'success', 'Response status should be success');
        const logs = json.data && json.data['system-logs'];
        assert.truthy(Array.isArray(logs), 'data["system-logs"] should be an array');

        const found = logs.find(l => l.id === window.__test_log_id || l.message === window.__test_log_message);
        assert.truthy(found, 'Recently created log should appear in listing');
        // created_at should be present and parseable
        assert.truthy(found.created_at, 'Log should have created_at');
        assert.truthy(!Number.isNaN(new Date(found.created_at).getTime()), 'created_at should be a valid date');
      }
    },
    {
      name: 'Filter by level returns only matching levels',
      fn: async () => {
        const resp = await fetch(`${BACKEND_URL}/api/system-logs?tenant_id=${encodeURIComponent(TEST_TENANT_ID)}&level=ERROR&limit=50`);
        assert.truthy(resp.ok, `GET /api/system-logs?level=ERROR should succeed (status ${resp.status})`);
        const json = await resp.json();
        assert.equal(json.status, 'success', 'Response status should be success');
        const logs = json.data && json.data['system-logs'];
        assert.truthy(Array.isArray(logs), 'data["system-logs"] should be an array');
        // All returned logs must be ERROR
        const nonError = logs.find(l => l.level !== 'ERROR');
        assert.truthy(!nonError, 'Level filter should exclude non-ERROR logs');
      }
    },
    {
      name: 'Delete the created log',
      fn: async () => {
        const id = window.__test_log_id;
        assert.exists(id, 'Created log id should be available');
        const resp = await fetch(`${BACKEND_URL}/api/system-logs/${id}`, { method: 'DELETE' });
        assert.truthy(resp.ok, `DELETE /api/system-logs/:id should succeed (status ${resp.status})`);
        const json = await resp.json();
        assert.equal(json.status, 'success', 'Response status should be success');

        // Verify it no longer appears
        const listResp = await fetch(`${BACKEND_URL}/api/system-logs?tenant_id=${encodeURIComponent(TEST_TENANT_ID)}&limit=50`);
        const listJson = await listResp.json();
        const logs = listJson?.data?.['system-logs'] || [];
        const stillThere = logs.find(l => l.id === id);
        assert.truthy(!stillThere, 'Deleted log should not appear in listing');

        delete window.__test_log_id;
        delete window.__test_log_message;
      }
    }
  ]
};
